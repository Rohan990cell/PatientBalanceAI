//! Windows Bluetooth discovery and pairing for the Nintendo Wii Balance Board (RVL-WBC-01).
//! Based on verified WinRT + Win32 implementation from The Balance Toolkit.

use anyhow::{Result, anyhow};
use std::mem::size_of;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use windows::core::HSTRING;
use windows_core::{GUID, Interface};

use windows::Devices::Bluetooth::BluetoothAdapter;
use windows::Devices::Bluetooth::BluetoothDevice;
use windows::Devices::Enumeration::{
    DeviceInformation, DeviceInformationUpdate, DeviceWatcher,
};
use windows::Foundation::{IPropertyValue, TypedEventHandler};
use windows::Win32::Devices::Bluetooth::{
    BLUETOOTH_ADDRESS, BLUETOOTH_ADDRESS_0, BLUETOOTH_DEVICE_INFO, BLUETOOTH_FIND_RADIO_PARAMS,
    BLUETOOTH_SERVICE_ENABLE, BluetoothAuthenticateDevice, BluetoothFindFirstRadio,
    BluetoothFindRadioClose, BluetoothGetDeviceInfo, BluetoothRemoveDevice,
    BluetoothSetServiceState,
};
use windows::Win32::Foundation::{CloseHandle, HANDLE};

pub const NINTENDO_BOARD_ID: &str = "Nintendo RVL-WBC-01";

/// The Wii Balance Board requires a legacy Bluetooth PIN equal to the
/// host adapter's MAC address in reversed byte order.
pub fn mac_address_to_wii_pin(mac_address: [u8; 6]) -> [u8; 6] {
    let mut pin = [0u8; 6];
    for i in 0..6 {
        pin[i] = mac_address[5 - i];
    }
    pin
}

pub fn convert_u64_to_mac_address(address: u64) -> [u8; 6] {
    let bytes = address.to_be_bytes();
    [bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]]
}

/// Checks if a Nintendo Wii Balance Board is already paired in Windows.
pub async fn find_paired_nintendo_board() -> Result<Option<u64>> {
    tokio::task::spawn_blocking(move || {
        futures::executor::block_on(async {
            let selector = BluetoothDevice::GetDeviceSelector()?;
            let devices = DeviceInformation::FindAllAsyncAqsFilter(&selector)?.await?;
            for info in devices {
                let name = info.Name().unwrap_or_default().to_string();
                if name.contains("RVL-WBC") || name.contains("Nintendo") {
                    if let Ok(dev) = BluetoothDevice::FromIdAsync(&info.Id()?)?.await {
                        let mac = dev.BluetoothAddress()?;
                        log::info!("Found existing paired Nintendo board: {name} ({mac:012x})");
                        return Ok(Some(mac));
                    }
                }
            }
            Ok(None)
        })
    })
    .await?
}

/// Scans for an unpaired Nintendo Wii Balance Board and pairs it using the host adapter's reverse PIN.
pub async fn scan_and_pair_nintendo(stop_flag: Arc<AtomicBool>) -> Result<u64> {
    tokio::task::spawn_blocking(move || {
        futures::executor::block_on(async move {
            let default_adapter = BluetoothAdapter::GetDefaultAsync()?.await?;
            let adapter_mac = convert_u64_to_mac_address(default_adapter.BluetoothAddress()?);
            let pin = mac_address_to_wii_pin(adapter_mac);
            log::info!(
                "Host BT Adapter MAC: {:02x?}, using Wii PIN: {:02x?}",
                adapter_mac,
                pin
            );

            let selector = BluetoothDevice::GetDeviceSelectorFromPairingState(false)?;
            let watcher = DeviceInformation::CreateWatcherAqsFilter(&selector)?;

            let (tx, rx) = std::sync::mpsc::sync_channel::<HSTRING>(1);

            let added_tx = tx.clone();
            let added = TypedEventHandler::new(
                move |watcher: windows::core::Ref<DeviceWatcher>,
                      info: windows::core::Ref<DeviceInformation>| {
                    let device_info = match info.as_ref() {
                        Some(info) => info,
                        None => return Ok(()),
                    };
                    let device_id = device_info.Id()?;
                    let device_name = device_info.Name()?.to_string();
                    let device_properties = device_info.Properties()?;

                    log::debug!("Discovered device: {} ({})", device_name, device_id);

                    let matches_name = device_name == NINTENDO_BOARD_ID;
                    let matches_prop =
                        properties_has_matching_name(&device_properties, NINTENDO_BOARD_ID);

                    if matches_name || matches_prop {
                        log::info!("Found Nintendo RVL-WBC-01 (Added event). Initiating pairing...");
                        if let Some(w) = watcher.as_ref() {
                            let _ = w.Stop();
                        }
                        let _ = added_tx.try_send(device_id);
                    }
                    Ok(())
                },
            );

            let updated_tx = tx.clone();
            let updated = TypedEventHandler::new(
                move |watcher: windows::core::Ref<DeviceWatcher>,
                      info: windows::core::Ref<DeviceInformationUpdate>| {
                    let device_update = match info.as_ref() {
                        Some(info) => info,
                        None => return Ok(()),
                    };
                    let device_id = device_update.Id()?;
                    let properties = device_update.Properties()?;
                    let matches_prop = properties_has_matching_name(&properties, NINTENDO_BOARD_ID);

                    if matches_prop {
                        log::info!("Found Nintendo RVL-WBC-01 (Updated event). Initiating pairing...");
                        if let Some(w) = watcher.as_ref() {
                            let _ = w.Stop();
                        }
                        let _ = updated_tx.try_send(device_id);
                    }
                    Ok(())
                },
            );
            drop(tx);

            watcher.Added(&added)?;
            watcher.Updated(&updated)?;
            log::info!("Device watcher started. Waiting for Wii Balance Board (Press red SYNC)...");
            watcher.Start()?;

            let deadline = Instant::now() + Duration::from_secs(60);
            let found_id = loop {
                if stop_flag.load(Ordering::SeqCst) {
                    log::info!("Scan cancelled by user.");
                    break None;
                }
                if Instant::now() >= deadline {
                    log::warn!("Scan timeout (60s) reached.");
                    break None;
                }
                match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(id) => break Some(id),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break None,
                }
            };

            let _ = watcher.Stop();

            let Some(device_id) = found_id else {
                return Err(anyhow!(
                    "Timed out waiting for Nintendo RVL-WBC-01. Please press the red SYNC button and try again."
                ));
            };

            let board_address = parse_board_address(&device_id.to_string())
                .ok_or_else(|| anyhow!("Could not parse board MAC from id: {device_id}"))?;

            try_pair_with_board(board_address, pin)?;
            Ok(board_address)
        })
    })
    .await?
}

fn try_pair_with_board(board_address: u64, pin: [u8; 6]) -> Result<()> {
    log::info!("Attempting Win32 pairing with {board_address:012x}...");
    let pin_wide: [u16; 6] = pin.map(|b| b as u16);

    unsafe {
        let mut radio = HANDLE::default();
        let find_params = BLUETOOTH_FIND_RADIO_PARAMS {
            dwSize: size_of::<BLUETOOTH_FIND_RADIO_PARAMS>() as u32,
        };
        let radio_find = BluetoothFindFirstRadio(&find_params, &mut radio)?;

        let mut device_info = BLUETOOTH_DEVICE_INFO {
            dwSize: size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
            Address: BLUETOOTH_ADDRESS {
                Anonymous: BLUETOOTH_ADDRESS_0 {
                    ullLong: board_address,
                },
            },
            ..Default::default()
        };

        let remove_status = BluetoothRemoveDevice(&device_info.Address);
        log::debug!("BluetoothRemoveDevice status: {remove_status}");

        let _ = BluetoothGetDeviceInfo(Some(radio), &mut device_info);

        const ERROR_BUSY: u32 = 170;
        let mut auth_status =
            BluetoothAuthenticateDevice(None, Some(radio), &mut device_info, Some(&pin_wide));
        let mut attempts = 0;
        while auth_status == ERROR_BUSY && attempts < 10 {
            attempts += 1;
            log::warn!("Radio busy (ERROR_BUSY); retrying pairing ({attempts}/10)...");
            std::thread::sleep(Duration::from_millis(800));
            auth_status =
                BluetoothAuthenticateDevice(None, Some(radio), &mut device_info, Some(&pin_wide));
        }

        if auth_status != 0 {
            let _ = BluetoothFindRadioClose(radio_find);
            let _ = CloseHandle(radio);
            return Err(anyhow!("Win32 pairing failed with error code: {auth_status}"));
        }

        log::info!("Successfully paired with board {board_address:012x}!");

        let _ = BluetoothGetDeviceInfo(Some(radio), &mut device_info);
        let hid_service = GUID::from_u128(0x00001124_0000_1000_8000_00805f9b34fb);
        let service_status = BluetoothSetServiceState(
            Some(radio),
            &device_info,
            &hid_service,
            BLUETOOTH_SERVICE_ENABLE,
        );
        if service_status != 0 {
            log::warn!("Enabling HID service returned code: {service_status}");
        } else {
            log::info!("HID service enabled on board.");
        }

        let _ = BluetoothFindRadioClose(radio_find);
        let _ = CloseHandle(radio);
        Ok(())
    }
}

fn parse_board_address(device_id: &str) -> Option<u64> {
    let mac = device_id.rsplit('-').next()?;
    let hex: String = mac.chars().filter(|c| *c != ':').collect();
    if hex.len() != 12 {
        return None;
    }
    u64::from_str_radix(&hex, 16).ok()
}

fn properties_has_matching_name(
    properties: &windows_collections::IMapView<HSTRING, windows_core::IInspectable>,
    target: &str,
) -> bool {
    let item_name = match properties.Lookup(&HSTRING::from("System.ItemNameDisplay")) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let prop: IPropertyValue = match item_name.cast() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let hstring = match prop.GetString() {
        Ok(s) => s,
        Err(_) => return false,
    };
    hstring.to_string() == target
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_paired_board() {
        println!("Checking Windows paired Bluetooth peripherals for Wii Balance Board...");
        match find_paired_nintendo_board().await {
            Ok(Some(mac)) => println!("RESULT: Found paired Nintendo board with MAC {:012x}", mac),
            Ok(None) => println!("RESULT: No paired Nintendo board found in Windows registry currently."),
            Err(e) => println!("RESULT: Query failed with error: {e:#}"),
        }
    }
}

