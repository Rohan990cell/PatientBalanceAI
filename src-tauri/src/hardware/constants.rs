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
/// Nintendo's Wii Balance Board programming guide uses a ≥2 kg change from the
/// zero point to detect a person stepping on; residual empty-board sensor noise
/// and post-load hysteresis commonly sit around 0.5–1.5 kg on a single corner.
/// Values at or below this threshold are reported as a clean unloaded zero
/// (no phantom weight / COP pinned to a corner).
///
/// This alone zeros empty-board flicker without subtracting tare from standing weight.
pub const UNLOADED_THRESHOLD_KG: f32 = 2.0;

/// Number of balance samples to average when capturing a zero-tare baseline.
/// ~100 Hz streaming → ~1.0 s of empty-board averaging.
pub const TARE_AVERAGE_SAMPLES: u32 = 100;

/// Reject Zero Tare if the averaged empty-board offset exceeds this total (kg).
/// Prevents accidental tare while someone is on the board (would under-read by tens of kg).
pub const MAX_TARE_TOTAL_KG: f32 = 3.0;

/// Soft cap per corner tare offset (kg). Empty-board hysteresis is typically ≤1–1.5 kg/corner.
pub const MAX_TARE_PER_CORNER_KG: f32 = 1.5;
