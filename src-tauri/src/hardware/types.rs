use serde::{Deserialize, Serialize};

pub type MacAddress = u64;

/// Raw ADC load-cell readings (16-bit big-endian integers directly from HID report mode 0x34).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceBoardRawReading {
    pub front_left: i32,
    pub front_right: i32,
    pub back_left: i32,
    pub back_right: i32,
    // Legacy aliases
    pub top_left: i32,
    pub top_right: i32,
    pub bottom_left: i32,
    pub bottom_right: i32,
}

/// Comprehensive, scientifically verified balance measurement from the Nintendo Wii Balance Board.
///
/// Coordinate system convention:
/// - X (Lateral): -1.0 = LEFT, 0.0 = CENTER, +1.0 = RIGHT
/// - Y (Anteroposterior): -1.0 = BACK / POSTERIOR, 0.0 = CENTER, +1.0 = FRONT / ANTERIOR
///
/// Corner load cells:
/// - FL (Front Left):  top-left sensor
/// - FR (Front Right): top-right sensor
/// - BL (Back Left):   bottom-left sensor
/// - BR (Back Right):  bottom-right sensor
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceBoardReading {
    /// Timestamp in milliseconds (UTC unix epoch)
    pub timestamp: i64,

    // --- Calibrated Force / Weight per corner (kg) ---
    pub front_left: f32,
    pub front_right: f32,
    pub back_left: f32,
    pub back_right: f32,

    // Legacy corner aliases
    pub top_left: f32,
    pub top_right: f32,
    pub bottom_left: f32,
    pub bottom_right: f32,

    // --- Raw ADC load-cell values (untouched by calibration or tare) ---
    pub raw_front_left: i32,
    pub raw_front_right: i32,
    pub raw_back_left: i32,
    pub raw_back_right: i32,

    // Raw legacy aliases
    pub raw_top_left: i32,
    pub raw_top_right: i32,
    pub raw_bottom_left: i32,
    pub raw_bottom_right: i32,

    // --- Total & Directional Weights (kg) ---
    /// Total weight across all 4 load cells (FL + FR + BL + BR)
    pub total_weight: f32,
    /// Left side weight (FL + BL)
    pub left_weight: f32,
    /// Right side weight (FR + BR)
    pub right_weight: f32,
    /// Anterior / Front weight (FL + FR)
    pub anterior_weight: f32,
    /// Posterior / Back weight (BL + BR)
    pub posterior_weight: f32,

    // --- Directional Balance Distribution Percentages (%) ---
    /// Left percentage: (left_weight / total_weight) * 100
    pub left_percent: f32,
    /// Right percentage: (right_weight / total_weight) * 100
    pub right_percent: f32,
    /// Anterior percentage: (anterior_weight / total_weight) * 100
    pub anterior_percent: f32,
    /// Posterior percentage: (posterior_weight / total_weight) * 100
    pub posterior_percent: f32,

    // Legacy percentage aliases
    pub front_percent: f32,
    pub back_percent: f32,

    // --- Center of Pressure (COP) ---
    /// Normalized COP X: [-1.0 = LEFT, 0.0 = CENTER, +1.0 = RIGHT]
    pub cop_x: f32,
    /// Normalized COP Y: [-1.0 = BACK / POSTERIOR, 0.0 = CENTER, +1.0 = FRONT / ANTERIOR]
    pub cop_y: f32,

    /// Physical Center of Pressure X in millimeters (relative to board center)
    pub cop_x_mm: f32,
    /// Physical Center of Pressure Y in millimeters (relative to board center)
    pub cop_y_mm: f32,
}

/// Shared balance measurement model alias
pub type BalanceMeasurement = BalanceBoardReading;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardStatus {
    pub is_connected: bool,
    pub is_scanning: bool,
    pub device_name: Option<String>,
    pub mac_address: Option<String>,
    pub message: String,
    pub error: Option<String>,
}

impl Default for BoardStatus {
    fn default() -> Self {
        Self {
            is_connected: false,
            is_scanning: false,
            device_name: None,
            mac_address: None,
            message: "Not connected. Press SYNC on your Wii Balance Board to connect.".into(),
            error: None,
        }
    }
}
