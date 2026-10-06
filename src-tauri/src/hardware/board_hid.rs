//! HID communication, EEPROM calibration extraction, and real-time load cell parsing
//! for the Nintendo Wii Balance Board (RVL-WBC-01).
//! Based on verified implementations from The Balance Toolkit.

use anyhow::{Result, anyhow};
use chrono::Utc;
use hidapi::{HidApi, HidDevice};

use crate::hardware::constants::{SENSOR_HALF_X_MM, SENSOR_HALF_Y_MM, UNLOADED_THRESHOLD_KG};
use crate::hardware::types::BalanceBoardReading;

const HID_INTERFACE_LED_INPUT: u8 = 0x11;
const HID_INTERFACE_DATA_REPORTING: u8 = 0x12;
const HID_INTERFACE_STATUS_REQUEST: u8 = 0x15;
const HID_INTERFACE_WRITE_MEMORY: u8 = 0x16;
const HID_INTERFACE_READ_MEMORY: u8 = 0x17;

const HID_CMD_DATA_REPORT_MODE_0X32: u8 = 0x32; // Core buttons + 8 Extension bytes (Balance Board load cells)
const CONTINUOUS_REPORTING_FLAG: u8 = 0x04;      // Bit 2 set = continuous reporting
const CALIBRATION_DATA_SIZE: usize = 32;
const DATA_REPORT_READ_EVENT: u8 = 0x21;
const DATA_PACKET_MIN_LEN: usize = 11;

const BOARD_TURN_ON_LED: [u8; 2] = [HID_INTERFACE_LED_INPUT, 0x10];
const BOARD_TURN_OFF_LED: [u8; 2] = [HID_INTERFACE_LED_INPUT, 0x00];
const BOARD_STATUS_REQUEST: [u8; 2] = [HID_INTERFACE_STATUS_REQUEST, 0x00];

// Extension controller initialization (New Way - unencrypted register mapping)
// 1. Write 0x55 to register 0xA400F0
const BOARD_INIT_EXTENSION_1: [u8; 22] = [
    HID_INTERFACE_WRITE_MEMORY, // 0x16
    0x04,                       // Control registers flag
    0xA4, 0x00, 0xF0,           // 24-bit memory address 0xA400F0
    0x01,                       // 1 byte to write
    0x55,                       // Data value
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // Padding to 16 data bytes
];

// 2. Write 0x00 to register 0xA400FB
const BOARD_INIT_EXTENSION_2: [u8; 22] = [
    HID_INTERFACE_WRITE_MEMORY, // 0x16
    0x04,                       // Control registers flag
    0xA4, 0x00, 0xFB,           // 24-bit memory address 0xA400FB
    0x01,                       // 1 byte to write
    0x00,                       // Data value
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // Padding to 16 data bytes
];

// Start continuous balance board streaming in mode 0x32 (8 extension bytes)
const BOARD_START_READING: [u8; 3] = [
    HID_INTERFACE_DATA_REPORTING, // 0x12
    CONTINUOUS_REPORTING_FLAG,    // 0x04 (Continuous reporting enabled!)
    HID_CMD_DATA_REPORT_MODE_0X32 // 0x32 (Core buttons + 8 Extension bytes)
];

const BOARD_STOP_READING: [u8; 3] = [HID_INTERFACE_DATA_REPORTING, 0x00, 0x30];

#[derive(Debug, Clone)]
pub struct CalibrationPoint {
    pub min: u16, // 0 kg
    pub mid: u16, // 17 kg
    pub max: u16, // 34 kg
}

impl Default for CalibrationPoint {
    fn default() -> Self {
        // Biomechanically verified factory averages for Nintendo RVL-WBC-01:
        // 0kg baseline (~8200), 17kg setpoint (~24500), 34kg setpoint (~40800)
        Self {
            min: 8200,
            mid: 24500,
            max: 40800,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct BalanceBoardCalibrationData {
    pub top_right: CalibrationPoint,
    pub bottom_right: CalibrationPoint,
    pub top_left: CalibrationPoint,
    pub bottom_left: CalibrationPoint,
}

impl BalanceBoardCalibrationData {
    pub fn from_bytes(buf: [u8; 32]) -> Self {
        Self {
            top_right: CalibrationPoint {
                min: u16::from_be_bytes([buf[4], buf[5]]),
                mid: u16::from_be_bytes([buf[12], buf[13]]),
                max: u16::from_be_bytes([buf[20], buf[21]]),
            },
            bottom_right: CalibrationPoint {
                min: u16::from_be_bytes([buf[6], buf[7]]),
                mid: u16::from_be_bytes([buf[14], buf[15]]),
                max: u16::from_be_bytes([buf[22], buf[23]]),
            },
            top_left: CalibrationPoint {
                min: u16::from_be_bytes([buf[8], buf[9]]),
                mid: u16::from_be_bytes([buf[16], buf[17]]),
                max: u16::from_be_bytes([buf[24], buf[25]]),
            },
            bottom_left: CalibrationPoint {
                min: u16::from_be_bytes([buf[10], buf[11]]),
                mid: u16::from_be_bytes([buf[18], buf[19]]),
                max: u16::from_be_bytes([buf[26], buf[27]]),
            },
        }
    }
}

pub fn debug_log(msg: &str) {
    eprintln!("[WII_DEBUG] {}", msg);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("wii_hardware_debug.log")
    {
        use std::io::Write;
        let _ = writeln!(
            file,
            "[{}] {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
            msg
        );
        let _ = file.flush();
    }
}

pub fn send_hid_command(device: &HidDevice, name: &str, cmd: &[u8]) -> Result<()> {
    let report_id = cmd.first().copied().unwrap_or(0);
    let hex_bytes = cmd.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(",");
    debug_log(&format!(
        "HID TX:\ncommand_name={name}\nreport_id=0x{:02X}\nlen={}\nbytes=[{}]",
        report_id, cmd.len(), hex_bytes
    ));
    device.write(cmd).map_err(|e| {
        debug_log(&format!("HID TX ({name}) FAILED: {e:#}"));
        anyhow!("Failed to send HID command {name}: {e}")
    })?;
    Ok(())
}

pub struct BoardHidDevice {
    device: HidDevice,
    calibration: BalanceBoardCalibrationData,
    tare_tr: f32,
    tare_br: f32,
    tare_tl: f32,
    tare_bl: f32,
    tare_pending: bool,
    packet_count: u64,
    last_log_instant: std::time::Instant,
    last_timeout_log: std::time::Instant,
}

impl BoardHidDevice {
    /// Attempts to locate and open the Wii Balance Board HID interface.
    /// If `mac_address` is provided, matches serial number; otherwise finds any Nintendo RVL-WBC device.
    pub fn open(mac_address: Option<u64>) -> Result<Self> {
        debug_log("==================================================");
        debug_log("BoardHidDevice::open: Initializing HID communication...");
        let api = HidApi::new().map_err(|e| {
            debug_log(&format!("Failed to initialize HID API: {e}"));
            anyhow!("Failed to initialize HID API: {e}")
        })?;

        let dev_info = if let Some(mac) = mac_address {
            let target_serial = format!("{:012x}", mac).to_lowercase();
            debug_log(&format!("Searching HID devices for MAC serial: {target_serial}"));
            api.device_list().find(|d| {
                d.serial_number()
                    .is_some_and(|s| s.replace(':', "").to_lowercase() == target_serial)
            })
        } else {
            debug_log("Auto-discovering any connected Nintendo Wii Balance Board in HID list...");
            api.device_list().find(|d| {
                let prod = d.product_string().unwrap_or_default().to_lowercase();
                let mfg = d.manufacturer_string().unwrap_or_default().to_lowercase();
                d.vendor_id() == 0x057e
                    || prod.contains("rvl-wbc")
                    || prod.contains("balance")
                    || mfg.contains("nintendo")
            })
        };

        let dev_info = dev_info.ok_or_else(|| {
            debug_log("Nintendo Wii Balance Board was NOT found in HID devices list!");
            anyhow!("Nintendo Wii Balance Board was not found in HID devices. Ensure board is paired.")
        })?;

        debug_log(&format!(
            "Found Wii Balance Board HID peripheral: VID={:04x}, PID={:04x}, Path={:?}, Serial={:?}, Prod={:?}",
            dev_info.vendor_id(),
            dev_info.product_id(),
            dev_info.path(),
            dev_info.serial_number(),
            dev_info.product_string()
        ));

        let device = dev_info
            .open_device(&api)
            .map_err(|e| {
                debug_log(&format!("Failed to open HID device: {e}"));
                anyhow!("Failed to open HID device: {e}")
            })?;

        // 1. Turn on front LED to show active connection
        send_hid_command(&device, "BOARD_TURN_ON_LED", &BOARD_TURN_ON_LED)?;
        std::thread::sleep(std::time::Duration::from_millis(50));

        // 2. Request Status to verify communication and clear pending states
        let mut drain_buf = [0u8; 32];
        let _ = send_hid_command(&device, "BOARD_STATUS_REQUEST", &BOARD_STATUS_REQUEST);
        let _ = device.read_timeout(&mut drain_buf, 100);

        // 3. Initialize extension controller (unencrypted register mapping)
        // Write 0x55 to register 0xA400F0
        send_hid_command(&device, "BOARD_INIT_EXTENSION_1", &BOARD_INIT_EXTENSION_1)?;
        let _ = device.read_timeout(&mut drain_buf, 100);

        // Write 0x00 to register 0xA400FB
        send_hid_command(&device, "BOARD_INIT_EXTENSION_2", &BOARD_INIT_EXTENSION_2)?;
        let _ = device.read_timeout(&mut drain_buf, 100);

        // 4. Read 32-byte factory EEPROM calibration values
        debug_log("Attempting to read 32-byte factory EEPROM calibration from board...");
        let calibration = match read_calibration_data(&device) {
            Ok(cal) => {
                debug_log(&format!(
                    "FACTORY EEPROM CALIBRATION READ SUCCESS:\n  Top-Right (FR): min={}, mid={}, max={}\n  Bottom-Right (BR): min={}, mid={}, max={}\n  Top-Left (FL): min={}, mid={}, max={}\n  Bottom-Left (BL): min={}, mid={}, max={}",
                    cal.top_right.min, cal.top_right.mid, cal.top_right.max,
                    cal.bottom_right.min, cal.bottom_right.mid, cal.bottom_right.max,
                    cal.top_left.min, cal.top_left.mid, cal.top_left.max,
                    cal.bottom_left.min, cal.bottom_left.mid, cal.bottom_left.max,
                ));
                cal
            }
            Err(e) => {
                debug_log(&format!(
                    "FACTORY EEPROM CALIBRATION READ FAILED: {e:#}\nWARNING: Using default setpoints (min: 8200, mid: 24500, max: 40800)!"
                ));
                BalanceBoardCalibrationData::default()
            }
        };

        // 5. Command continuous data reporting (Mode 0x32: Core buttons + 8 Extension bytes)
        send_hid_command(&device, "BOARD_START_READING", &BOARD_START_READING)?;

        debug_log("Wii Balance Board successfully opened and streaming loop initialized.");

        Ok(Self {
            device,
            calibration,
            tare_tr: 0.0,
            tare_br: 0.0,
            tare_tl: 0.0,
            tare_bl: 0.0,
            tare_pending: false,
            packet_count: 0,
            last_log_instant: std::time::Instant::now() - std::time::Duration::from_secs(10),
            last_timeout_log: std::time::Instant::now() - std::time::Duration::from_secs(10),
        })
    }

    /// Zero out current weight as baseline tare.
    /// Sets a flag to capture the next calibrated frame as the baseline tare offset without blocking HID reads.
    pub fn tare(&mut self) {
        debug_log("Requesting board tare zero calibration on next frame...");
        self.tare_pending = true;
    }

    /// Reads one incoming HID report and calculates real load cell values.
    pub fn read_sample(&mut self) -> Result<Option<BalanceBoardReading>> {
        let mut buf = [0u8; 32];
        let len = match self.device.read_timeout(&mut buf, 500) {
            Ok(n) => n,
            Err(e) => {
                debug_log(&format!("read_sample HID read_timeout ERROR: {e:#}"));
                return Err(anyhow!("HID read error: {e}"));
            }
        };

        if len == 0 {
            if self.last_timeout_log.elapsed() >= std::time::Duration::from_secs(2) {
                self.last_timeout_log = std::time::Instant::now();
                debug_log(&format!(
                    "read_sample: timeout (0 bytes in 500ms). Packets received so far: {}",
                    self.packet_count
                ));
            }
            return Ok(None);
        }

        self.packet_count += 1;
        let report_id = buf[0];
        let hex_bytes = buf[..len].iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(",");

        let now = std::time::Instant::now();
        let is_first_few = self.packet_count <= 30;
        let is_periodic = self.last_log_instant.elapsed() >= std::time::Duration::from_millis(500);

        if is_first_few || is_periodic {
            self.last_log_instant = now;
            debug_log(&format!(
                "HID RX:\nlen={}\nreport_id=0x{:02X}\nbytes=[{}]",
                len, report_id, hex_bytes
            ));
        }

        // If board sends 0x20 (Status report), re-assert continuous mode 0x32!
        if report_id == 0x20 {
            debug_log("Received Status Report 0x20; re-asserting continuous streaming mode 0x32.");
            let _ = send_hid_command(&self.device, "RE_ASSERT_START_READING", &BOARD_START_READING);
            return Ok(None);
        }

        // Only process reports 0x32 or 0x34 that contain balance sensor data
        if report_id != HID_CMD_DATA_REPORT_MODE_0X32 && report_id != 0x34 {
            if is_first_few || is_periodic {
                debug_log(&format!(
                    "Ignoring non-balance report ID 0x{:02X}", report_id
                ));
            }
            return Ok(None);
        }

        if len < DATA_PACKET_MIN_LEN {
            if is_first_few || is_periodic {
                debug_log(&format!(
                    "Packet #{} length {} < DATA_PACKET_MIN_LEN ({}), report_id=0x{:02X} -> IGNORED",
                    self.packet_count, len, DATA_PACKET_MIN_LEN, report_id
                ));
            }
            return Ok(None);
        }

        // Mode 0x32 / 0x34 packet layout:
        // buf[0] = report ID (0x32 or 0x34)
        // buf[1..3] = buttons (buf[1], buf[2])
        // buf[3..11] = 4 corner load sensors (each 16-bit big endian)
        // Mapping:
        // buf[3..5]   = top_right (FR)
        // buf[5..7]   = bottom_right (BR)
        // buf[7..9]   = top_left (FL)
        // buf[9..11]  = bottom_left (BL)
        let tr_raw = u16::from_be_bytes([buf[3], buf[4]]);
        let br_raw = u16::from_be_bytes([buf[5], buf[6]]);
        let tl_raw = u16::from_be_bytes([buf[7], buf[8]]);
        let bl_raw = u16::from_be_bytes([buf[9], buf[10]]);

        let tr_cal = calculate_single_weight(tr_raw, &self.calibration.top_right);
        let br_cal = calculate_single_weight(br_raw, &self.calibration.bottom_right);
        let tl_cal = calculate_single_weight(tl_raw, &self.calibration.top_left);
        let bl_cal = calculate_single_weight(bl_raw, &self.calibration.bottom_left);

        // Capture zero tare if requested
        if self.tare_pending {
            self.tare_tr = tr_cal;
            self.tare_br = br_cal;
            self.tare_tl = tl_cal;
            self.tare_bl = bl_cal;
            self.tare_pending = false;
            debug_log(&format!(
                "Tare offsets captured: FL={:.2} kg, FR={:.2} kg, BL={:.2} kg, BR={:.2} kg",
                self.tare_tl,
                self.tare_tr,
                self.tare_bl,
                self.tare_br
            ));
        }

        let reading = compute_balance_metrics(
            tl_cal, tr_cal, bl_cal, br_cal,
            self.tare_tl, self.tare_tr, self.tare_bl, self.tare_br,
            tl_raw as i32, tr_raw as i32, bl_raw as i32, br_raw as i32,
            Utc::now().timestamp_millis(),
        );

        if is_first_few || is_periodic {
            debug_log(&format!(
                "DATA PIPELINE [Packet #{}]:\n  Report ID: 0x{:02X}, len={}\n  Raw bytes [3..11]: {:02X?}\n  Raw u16: FL={} FR={} BL={} BR={}\n  Calibrated (kg): FL={:.2} FR={:.2} BL={:.2} BR={:.2}\n  Tare offsets: FL={:.2} FR={:.2} BL={:.2} BR={:.2}\n  Net Forces: FL={:.2} FR={:.2} BL={:.2} BR={:.2}\n  Total Weight: {:.2} kg\n  L/R: Left={:.2} kg ({:.1}%), Right={:.2} kg ({:.1}%)\n  Ant/Post: Ant={:.2} kg ({:.1}%), Post={:.2} kg ({:.1}%)\n  COP: X={:.3} ({:.1} mm), Y={:.3} ({:.1} mm)",
                self.packet_count,
                report_id, len,
                &buf[3..11],
                tl_raw, tr_raw, bl_raw, br_raw,
                tl_cal, tr_cal, bl_cal, br_cal,
                self.tare_tl, self.tare_tr, self.tare_bl, self.tare_br,
                reading.front_left, reading.front_right, reading.back_left, reading.back_right,
                reading.total_weight,
                reading.left_weight, reading.left_percent,
                reading.right_weight, reading.right_percent,
                reading.anterior_weight, reading.anterior_percent,
                reading.posterior_weight, reading.posterior_percent,
                reading.cop_x, reading.cop_x_mm,
                reading.cop_y, reading.cop_y_mm
            ));
        }

        Ok(Some(reading))
    }

    pub fn close(&mut self) {
        debug_log("BoardHidDevice::close: Sending STOP reading and LED off...");
        let _ = send_hid_command(&self.device, "BOARD_STOP_READING", &BOARD_STOP_READING);
        let _ = send_hid_command(&self.device, "BOARD_TURN_OFF_LED", &BOARD_TURN_OFF_LED);
    }
}

impl Drop for BoardHidDevice {
    fn drop(&mut self) {
        self.close();
    }
}

/// Converts calibrated corner forces and tare offsets into scientifically correct
/// balance metrics, directional weight distributions, percentages, and normalized/mm COP.
pub fn compute_balance_metrics(
    tl_cal: f32,
    tr_cal: f32,
    bl_cal: f32,
    br_cal: f32,
    tare_tl: f32,
    tare_tr: f32,
    tare_bl: f32,
    tare_br: f32,
    raw_fl: i32,
    raw_fr: i32,
    raw_bl: i32,
    raw_br: i32,
    timestamp: i64,
) -> BalanceBoardReading {
    // 1. Net calibrated force per corner (kg)
    let fl = (tl_cal - tare_tl).max(0.0);
    let fr = (tr_cal - tare_tr).max(0.0);
    let bl = (bl_cal - tare_bl).max(0.0);
    let br = (br_cal - tare_br).max(0.0);

    // 2. Total Weight (FL + FR + BL + BR)
    let total_weight = fl + fr + bl + br;

    // 3. Directional Weights
    let left_weight = fl + bl;
    let right_weight = fr + br;
    let anterior_weight = fl + fr;
    let posterior_weight = bl + br;

    // 4. Directional Percentages & Center of Pressure (COP)
    let (left_percent, right_percent, anterior_percent, posterior_percent, cop_x, cop_y) =
        if total_weight > UNLOADED_THRESHOLD_KG {
            let left_pct = ((left_weight / total_weight) * 100.0).clamp(0.0, 100.0);
            let right_pct = ((right_weight / total_weight) * 100.0).clamp(0.0, 100.0);
            let ant_pct = ((anterior_weight / total_weight) * 100.0).clamp(0.0, 100.0);
            let post_pct = ((posterior_weight / total_weight) * 100.0).clamp(0.0, 100.0);

            // Normalized COP [-1.0, 1.0]:
            // X: -1.0 = LEFT, 0.0 = CENTER, +1.0 = RIGHT
            // Y: -1.0 = BACK/POSTERIOR, 0.0 = CENTER, +1.0 = FRONT/ANTERIOR
            let cx = ((right_weight - left_weight) / total_weight).clamp(-1.0, 1.0);
            let cy = ((anterior_weight - posterior_weight) / total_weight).clamp(-1.0, 1.0);

            (left_pct, right_pct, ant_pct, post_pct, cx, cy)
        } else {
            // Unloaded / near-zero: return neutral balance safely (no NaN or divide-by-zero)
            (50.0, 50.0, 50.0, 50.0, 0.0, 0.0)
        };

    // 5. Physical COP in millimeters from board center
    let cop_x_mm = cop_x * SENSOR_HALF_X_MM;
    let cop_y_mm = cop_y * SENSOR_HALF_Y_MM;

    BalanceBoardReading {
        timestamp,
        front_left: fl,
        front_right: fr,
        back_left: bl,
        back_right: br,
        top_left: fl,
        top_right: fr,
        bottom_left: bl,
        bottom_right: br,
        raw_front_left: raw_fl,
        raw_front_right: raw_fr,
        raw_back_left: raw_bl,
        raw_back_right: raw_br,
        raw_top_left: raw_fl,
        raw_top_right: raw_fr,
        raw_bottom_left: raw_bl,
        raw_bottom_right: raw_br,
        total_weight,
        left_weight,
        right_weight,
        anterior_weight,
        posterior_weight,
        left_percent,
        right_percent,
        anterior_percent,
        posterior_percent,
        front_percent: anterior_percent,
        back_percent: posterior_percent,
        cop_x,
        cop_y,
        cop_x_mm,
        cop_y_mm,
    }
}

/// Piecewise linear interpolation using 0kg (min), 17kg (mid), 34kg (max) calibration points.
fn calculate_single_weight(sensor_val: u16, cal: &CalibrationPoint) -> f32 {
    let val_f = sensor_val as f32;
    let min_f = cal.min as f32;
    let mid_f = cal.mid as f32;
    let max_f = cal.max as f32;

    if val_f <= min_f {
        0.0
    } else if val_f < mid_f {
        17.0 * (val_f - min_f) / (mid_f - min_f).max(1.0)
    } else {
        17.0 + 17.0 * (val_f - mid_f) / (max_f - mid_f).max(1.0)
    }
}

fn read_calibration_data(device: &HidDevice) -> Result<BalanceBoardCalibrationData> {
    // EEPROM read command: address 0x04A40020, 32 bytes
    let cmd: [u8; 7] = [HID_INTERFACE_READ_MEMORY, 0x04, 0xA4, 0x00, 0x20, 0x00, 0x20];
    send_hid_command(device, "EEPROM_READ_CALIBRATION", &cmd)?;

    let mut calibration_buf = [0u8; CALIBRATION_DATA_SIZE];
    let mut bytes_read: usize = 0;

    for attempt in 0..15 {
        let mut buf = [0u8; 32];
        let len = match device.read_timeout(&mut buf, 500) {
            Ok(n) => n,
            Err(e) => {
                debug_log(&format!("read_calibration_data attempt {attempt}: HID read error: {e}"));
                continue;
            }
        };

        if len == 0 {
            debug_log(&format!("read_calibration_data attempt {attempt}: timeout (0 bytes)"));
            continue;
        }

        debug_log(&format!(
            "read_calibration_data attempt {attempt}: len={}, report_id=0x{:02X}, raw={:02X?}",
            len, buf[0], &buf[..len]
        ));

        if buf[0] != DATA_REPORT_READ_EVENT {
            debug_log(&format!(
                "read_calibration_data: ignoring non-0x21 report: 0x{:02X}",
                buf[0]
            ));
            continue;
        }

        let packet_size = ((buf[3] >> 4) + 1) as usize;
        let error_code = buf[3] & 0x0F;
        debug_log(&format!(
            "read_calibration_data: 0x21 report parsed: packet_size={packet_size}, error_code={error_code}, offset_bytes={:02X?}",
            &buf[4..6]
        ));

        if error_code != 0 {
            return Err(anyhow!("EEPROM error code: {error_code}"));
        }

        if bytes_read + packet_size > CALIBRATION_DATA_SIZE {
            debug_log(&format!(
                "read_calibration_data: packet_size {packet_size} would exceed CALIBRATION_DATA_SIZE ({bytes_read}/32)"
            ));
            break;
        }

        let chunk = &buf[6..(6 + packet_size)];
        debug_log(&format!(
            "read_calibration_data: copying {packet_size} bytes into buf at {bytes_read}..{}: {:02X?}",
            bytes_read + packet_size,
            chunk
        ));
        calibration_buf[bytes_read..(bytes_read + packet_size)].copy_from_slice(chunk);
        bytes_read += packet_size;

        if bytes_read >= CALIBRATION_DATA_SIZE {
            debug_log("read_calibration_data: Full 32 bytes read successfully!");
            break;
        }
    }

    if bytes_read < CALIBRATION_DATA_SIZE {
        return Err(anyhow!("Incomplete calibration data read: {bytes_read}/32 bytes"));
    }

    debug_log(&format!("read_calibration_data: Raw 32 bytes: {:02X?}", &calibration_buf));
    Ok(BalanceBoardCalibrationData::from_bytes(calibration_buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f32 = 1e-4;

    #[test]
    fn test_unloaded_board_handling() {
        let r = compute_balance_metrics(
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            0, 0, 0, 0,
            1000,
        );

        assert_eq!(r.total_weight, 0.0);
        assert_eq!(r.left_weight, 0.0);
        assert_eq!(r.right_weight, 0.0);
        assert_eq!(r.anterior_weight, 0.0);
        assert_eq!(r.posterior_weight, 0.0);
        assert_eq!(r.left_percent, 50.0);
        assert_eq!(r.right_percent, 50.0);
        assert_eq!(r.anterior_percent, 50.0);
        assert_eq!(r.posterior_percent, 50.0);
        assert_eq!(r.cop_x, 0.0);
        assert_eq!(r.cop_y, 0.0);
        assert_eq!(r.cop_x_mm, 0.0);
        assert_eq!(r.cop_y_mm, 0.0);
    }

    #[test]
    fn test_normal_two_foot_standing() {
        // Patient standing centered: 70kg distributed equally (17.5kg per sensor)
        let r = compute_balance_metrics(
            17.5, 17.5, 17.5, 17.5,
            0.0, 0.0, 0.0, 0.0,
            500, 500, 500, 500,
            1000,
        );

        assert!((r.total_weight - 70.0).abs() < EPSILON);
        assert!((r.left_weight - 35.0).abs() < EPSILON);
        assert!((r.right_weight - 35.0).abs() < EPSILON);
        assert!((r.anterior_weight - 35.0).abs() < EPSILON);
        assert!((r.posterior_weight - 35.0).abs() < EPSILON);
        assert!((r.left_percent - 50.0).abs() < EPSILON);
        assert!((r.right_percent - 50.0).abs() < EPSILON);
        assert!((r.anterior_percent - 50.0).abs() < EPSILON);
        assert!((r.posterior_percent - 50.0).abs() < EPSILON);
        assert!(r.cop_x.abs() < EPSILON);
        assert!(r.cop_y.abs() < EPSILON);
        assert!(r.cop_x_mm.abs() < EPSILON);
        assert!(r.cop_y_mm.abs() < EPSILON);
    }

    #[test]
    fn test_left_leg_dominant_standing() {
        // Patient standing 100% on left leg: FL=35kg, BL=35kg, FR=0kg, BR=0kg
        let r = compute_balance_metrics(
            35.0, 0.0, 35.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            1000, 0, 1000, 0,
            1000,
        );

        assert!((r.total_weight - 70.0).abs() < EPSILON);
        assert!((r.left_weight - 70.0).abs() < EPSILON);
        assert!(r.right_weight.abs() < EPSILON);
        assert!((r.left_percent - 100.0).abs() < EPSILON);
        assert!(r.right_percent.abs() < EPSILON);
        // COP X must be -1.0 (fully LEFT)
        assert!((r.cop_x - (-1.0)).abs() < EPSILON);
        assert!(r.cop_y.abs() < EPSILON);
        assert!((r.cop_x_mm - (-SENSOR_HALF_X_MM)).abs() < EPSILON);
    }

    #[test]
    fn test_right_leg_dominant_standing() {
        // Patient standing 100% on right leg: FR=35kg, BR=35kg, FL=0kg, BL=0kg
        let r = compute_balance_metrics(
            0.0, 35.0, 0.0, 35.0,
            0.0, 0.0, 0.0, 0.0,
            0, 1000, 0, 1000,
            1000,
        );

        assert!((r.total_weight - 70.0).abs() < EPSILON);
        assert!(r.left_weight.abs() < EPSILON);
        assert!((r.right_weight - 70.0).abs() < EPSILON);
        assert!(r.left_percent.abs() < EPSILON);
        assert!((r.right_percent - 100.0).abs() < EPSILON);
        // COP X must be +1.0 (fully RIGHT)
        assert!((r.cop_x - 1.0).abs() < EPSILON);
        assert!(r.cop_y.abs() < EPSILON);
        assert!((r.cop_x_mm - SENSOR_HALF_X_MM).abs() < EPSILON);
    }

    #[test]
    fn test_lean_forward_anterior() {
        // Patient leaning forward: FL=35kg, FR=35kg, BL=0kg, BR=0kg
        let r = compute_balance_metrics(
            35.0, 35.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            1000, 1000, 0, 0,
            1000,
        );

        assert!((r.total_weight - 70.0).abs() < EPSILON);
        assert!((r.anterior_weight - 70.0).abs() < EPSILON);
        assert!(r.posterior_weight.abs() < EPSILON);
        assert!((r.anterior_percent - 100.0).abs() < EPSILON);
        assert!(r.posterior_percent.abs() < EPSILON);
        // COP Y must be +1.0 (fully FORWARD / ANTERIOR)
        assert!(r.cop_x.abs() < EPSILON);
        assert!((r.cop_y - 1.0).abs() < EPSILON);
        assert!((r.cop_y_mm - SENSOR_HALF_Y_MM).abs() < EPSILON);
    }

    #[test]
    fn test_lean_backward_posterior() {
        // Patient leaning backward: BL=35kg, BR=35kg, FL=0kg, FR=0kg
        let r = compute_balance_metrics(
            0.0, 0.0, 35.0, 35.0,
            0.0, 0.0, 0.0, 0.0,
            0, 0, 1000, 1000,
            1000,
        );

        assert!((r.total_weight - 70.0).abs() < EPSILON);
        assert!(r.anterior_weight.abs() < EPSILON);
        assert!((r.posterior_weight - 70.0).abs() < EPSILON);
        assert!(r.anterior_percent.abs() < EPSILON);
        assert!((r.posterior_percent - 100.0).abs() < EPSILON);
        // COP Y must be -1.0 (fully BACKWARD / POSTERIOR)
        assert!(r.cop_x.abs() < EPSILON);
        assert!((r.cop_y - (-1.0)).abs() < EPSILON);
        assert!((r.cop_y_mm - (-SENSOR_HALF_Y_MM)).abs() < EPSILON);
    }

    #[test]
    fn test_partial_shifts_and_tare() {
        // Calibrated readings with tare subtraction
        // Raw tare baseline: 2.0kg per sensor
        // Total measured: FL=22.0, FR=12.0, BL=22.0, BR=12.0
        // Net: FL=20.0, FR=10.0, BL=20.0, BR=10.0
        // Total net: 60.0kg
        // Left: 40.0kg (66.67%), Right: 20.0kg (33.33%)
        // COP X: (20 - 40) / 60 = -0.3333... (shifted left)
        // COP Y: (30 - 30) / 60 = 0.0
        let r = compute_balance_metrics(
            22.0, 12.0, 22.0, 12.0,
            2.0, 2.0, 2.0, 2.0,
            600, 300, 600, 300,
            1000,
        );

        assert!((r.total_weight - 60.0).abs() < EPSILON);
        assert!((r.left_weight - 40.0).abs() < EPSILON);
        assert!((r.right_weight - 20.0).abs() < EPSILON);
        assert!((r.left_percent - (40.0 / 60.0 * 100.0)).abs() < EPSILON);
        assert!((r.right_percent - (20.0 / 60.0 * 100.0)).abs() < EPSILON);
        assert!((r.cop_x - (-1.0 / 3.0)).abs() < EPSILON);
        assert!(r.cop_y.abs() < EPSILON);

        // Verify raw sensor values are preserved untouched
        assert_eq!(r.raw_front_left, 600);
        assert_eq!(r.raw_front_right, 300);
        assert_eq!(r.raw_back_left, 600);
        assert_eq!(r.raw_back_right, 300);
    }

    #[test]
    fn test_probe_board_hid() {
        println!("=== HID Peripheral Probe ===");
        let api = match HidApi::new() {
            Ok(a) => a,
            Err(e) => {
                println!("Failed to init HidApi: {e}");
                return;
            }
        };

        let mut found = 0;
        for d in api.device_list() {
            let vid = d.vendor_id();
            let pid = d.product_id();
            let prod = d.product_string().unwrap_or("");
            let mfg = d.manufacturer_string().unwrap_or("");
            let ser = d.serial_number().unwrap_or("");
            let path = d.path().to_string_lossy();

            if vid == 0x057e
                || prod.to_lowercase().contains("rvl")
                || prod.to_lowercase().contains("nintendo")
                || prod.to_lowercase().contains("balance")
            {
                found += 1;
                println!(
                    "Device #{found}: VID={vid:04x}, PID={pid:04x}, Serial={ser}, Prod='{prod}', Mfg='{mfg}', Path={path}"
                );

                match d.open_device(&api) {
                    Ok(dev) => {
                        println!("  Successfully opened device handle!");
                        // Try LED write
                        let led_res = dev.write(&BOARD_TURN_ON_LED);
                        println!("  Write LED result: {led_res:?}");

                        // Try reading 32-byte calibration
                        let cal_res = read_calibration_data(&dev);
                        println!("  Read calibration result: {cal_res:?}");

                        // Try start reading
                        let start_res = dev.write(&BOARD_START_READING);
                        println!("  Write START_READING result: {start_res:?}");

                        // Try reading packets for 2 seconds
                        let start = std::time::Instant::now();
                        let mut pkt_count = 0;
                        while start.elapsed() < std::time::Duration::from_secs(2) {
                            let mut buf = [0u8; 32];
                            match dev.read_timeout(&mut buf, 200) {
                                Ok(n) if n > 0 => {
                                    pkt_count += 1;
                                    println!(
                                        "  Packet #{pkt_count}: len={n}, ID=0x{:02X}, raw={:02X?}",
                                        buf[0],
                                        &buf[..n]
                                    );
                                }
                                Ok(_) => {}
                                Err(e) => {
                                    println!("  Read error: {e}");
                                    break;
                                }
                            }
                        }
                        println!("  Total packets received in 2s: {pkt_count}");
                    }
                    Err(e) => {
                        println!("  Failed to open device handle: {e}");
                    }
                }
            }
        }

        if found == 0 {
            println!("No Nintendo RVL / Balance Board devices found in HidApi device list.");
        }
    }
}
