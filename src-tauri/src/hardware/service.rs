//! Hardware Supervisor Service for the Wii Balance Board.
//! Connects Bluetooth/HID, manages data acquisition loop, and streams events to the Tauri Webview.

use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::hardware::board_hid::BoardHidDevice;
use crate::hardware::types::BoardStatus;
use crate::hardware::windows_bluetooth;

pub struct BalanceBoardService {
    status: Arc<Mutex<BoardStatus>>,
    is_running: Arc<AtomicBool>,
    tare_requested: Arc<AtomicBool>,
    stop_scan_flag: Arc<AtomicBool>,
}

impl Default for BalanceBoardService {
    fn default() -> Self {
        Self {
            status: Arc::new(Mutex::new(BoardStatus::default())),
            is_running: Arc::new(AtomicBool::new(false)),
            tare_requested: Arc::new(AtomicBool::new(false)),
            stop_scan_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl BalanceBoardService {
    pub async fn get_status(&self) -> BoardStatus {
        let status = self.status.lock().await;
        status.clone()
    }

    pub async fn tare(&self) {
        log::info!("Tare zero offset requested by user.");
        self.tare_requested.store(true, Ordering::SeqCst);
    }

    pub async fn disconnect(&self, app: &AppHandle) {
        log::info!("Disconnecting balance board...");
        self.stop_scan_flag.store(true, Ordering::SeqCst);
        self.is_running.store(false, Ordering::SeqCst);

        let mut status = self.status.lock().await;
        status.is_connected = false;
        status.is_scanning = false;
        status.message = "Disconnected. Press SYNC on your board to reconnect.".into();
        status.error = None;

        let _ = app.emit("balance-board-status", status.clone());
    }

    /// Full Bluetooth discovery, pairing and HID stream initialization.
    pub async fn scan_and_connect(self: Arc<Self>, app: AppHandle) -> Result<()> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.stop_scan_flag.store(false, Ordering::SeqCst);

        // 1. Update status to scanning
        {
            let mut status = self.status.lock().await;
            status.is_scanning = true;
            status.is_connected = false;
            status.message = "Searching for Nintendo RVL-WBC-01... Press the red SYNC button on your board.".into();
            status.error = None;
            let _ = app.emit("balance-board-status", status.clone());
        }

        let service = self.clone();
        tokio::spawn(async move {
            // First check if already paired in Windows Bluetooth
            let existing_mac = windows_bluetooth::find_paired_nintendo_board().await.ok().flatten();

            let board_mac = match existing_mac {
                Some(mac) => {
                    log::info!("Found existing paired board in Windows: {:012x}", mac);
                    mac
                }
                None => {
                    log::info!("Starting Bluetooth discovery and legacy PIN pairing...");
                    match windows_bluetooth::scan_and_pair_nintendo(service.stop_scan_flag.clone()).await {
                        Ok(mac) => mac,
                        Err(e) => {
                            log::error!("Bluetooth scan/pair failed: {e:#}");
                            let mut status = service.status.lock().await;
                            status.is_scanning = false;
                            status.is_connected = false;
                            status.error = Some(e.to_string());
                            status.message = "Connection failed. Please press red SYNC and retry.".into();
                            let _ = app.emit("balance-board-status", status.clone());
                            return;
                        }
                    }
                }
            };

            // Now open HID interface
            service.start_hid_stream(Some(board_mac), app).await;
        });

        Ok(())
    }

    /// Direct HID connection attempt (used when board is already paired with Windows).
    pub async fn direct_hid_connect(self: Arc<Self>, app: AppHandle) -> Result<()> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        {
            let mut status = self.status.lock().await;
            status.is_scanning = true;
            status.message = "Opening paired Wii Balance Board via HID...".into();
            status.error = None;
            let _ = app.emit("balance-board-status", status.clone());
        }

        let service = self.clone();
        tokio::spawn(async move {
            service.start_hid_stream(None, app).await;
        });

        Ok(())
    }

    async fn start_hid_stream(&self, mac: Option<u64>, app: AppHandle) {
        // Allow brief Windows driver attachment delay
        tokio::time::sleep(Duration::from_millis(500)).await;

        let mut hid_device = match BoardHidDevice::open(mac) {
            Ok(dev) => dev,
            Err(e) => {
                log::error!("Failed to open HID device: {e:#}");
                let mut status = self.status.lock().await;
                status.is_scanning = false;
                status.is_connected = false;
                status.error = Some(e.to_string());
                status.message = "Failed to open board HID interface. Ensure board is awake and paired.".into();
                let _ = app.emit("balance-board-status", status.clone());
                return;
            }
        };

        self.is_running.store(true, Ordering::SeqCst);

        // Update status to connected
        {
            let mut status = self.status.lock().await;
            status.is_connected = true;
            status.is_scanning = false;
            status.device_name = Some(windows_bluetooth::NINTENDO_BOARD_ID.into());
            status.mac_address = mac.map(|m| format!("{:012x}", m));
            status.message = "Connected to Nintendo Wii Balance Board. Streaming live sensor data.".into();
            status.error = None;
            let _ = app.emit("balance-board-status", status.clone());
        }

        let is_running = self.is_running.clone();
        let tare_requested = self.tare_requested.clone();
        let status_arc = self.status.clone();
        let app_handle = app.clone();

        // Spawn background reader thread (blocking HID reads)
        std::thread::spawn(move || {
            crate::hardware::board_hid::debug_log("Started background balance board data stream thread.");
            let mut failure_count = 0u32;
            let mut emit_count = 0u64;

            while is_running.load(Ordering::SeqCst) {
                if tare_requested.swap(false, Ordering::SeqCst) {
                    hid_device.tare();
                }

                match hid_device.read_sample() {
                    Ok(Some(reading)) => {
                        failure_count = 0;
                        emit_count += 1;

                        if emit_count <= 25 || emit_count % 50 == 0 {
                            crate::hardware::board_hid::debug_log(&format!(
                                "Tauri Event Emit #{} ('balance-board-data'): total={:.2}kg, FL={:.2} (raw={}), FR={:.2} (raw={}), BL={:.2} (raw={}), BR={:.2} (raw={})",
                                emit_count,
                                reading.total_weight,
                                reading.front_left, reading.raw_front_left,
                                reading.front_right, reading.raw_front_right,
                                reading.back_left, reading.raw_back_left,
                                reading.back_right, reading.raw_back_right,
                            ));
                        }

                        let _ = app_handle.emit("balance-board-data", reading);
                    }
                    Ok(None) => {
                        // Idle / short packet, small sleep
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(e) => {
                        failure_count += 1;
                        crate::hardware::board_hid::debug_log(&format!("HID read failure ({failure_count}/10): {e:#}"));
                        if failure_count >= 10 {
                            crate::hardware::board_hid::debug_log("Max consecutive read failures reached. Board disconnected.");
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
            }

            hid_device.close();
            is_running.store(false, Ordering::SeqCst);

            // Notify UI of disconnection
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();
            if let Ok(rt) = rt {
                rt.block_on(async {
                    let mut status = status_arc.lock().await;
                    status.is_connected = false;
                    status.is_scanning = false;
                    status.message = "Board disconnected.".into();
                    let _ = app_handle.emit("balance-board-status", status.clone());
                });
            }
        });
    }
}
