//! Physical constants and geometry for the Nintendo Wii Balance Board (Model RVL-WBC-01).
//! Based on verified biomechanical measurements from The Balance Toolkit.

/// Distance between left and right sensor centers in millimeters (X-axis).
pub const SENSOR_DISTANCE_X_MM: f32 = 446.0;

/// Distance between front and back sensor centers in millimeters (Y-axis).
pub const SENSOR_DISTANCE_Y_MM: f32 = 238.0;

/// Half-distance on X-axis from board center to lateral sensor line in millimeters.
pub const SENSOR_HALF_X_MM: f32 = SENSOR_DISTANCE_X_MM / 2.0; // 223.0 mm

/// Half-distance on Y-axis from board center to anteroposterior sensor line in millimeters.
pub const SENSOR_HALF_Y_MM: f32 = SENSOR_DISTANCE_Y_MM / 2.0; // 119.0 mm

/// Force threshold (in kg) below which the board is considered unloaded or empty.
/// Used to prevent division-by-zero or jitter when no person is standing on the board.
pub const UNLOADED_THRESHOLD_KG: f32 = 0.1;
