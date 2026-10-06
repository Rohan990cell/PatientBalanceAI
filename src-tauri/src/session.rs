use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedMeasurementPoint {
    pub timestamp: String,
    pub elapsed_ms: u64,
    pub front_left: f64,
    pub front_right: f64,
    pub back_left: f64,
    pub back_right: f64,
    pub total_weight: f64,
    pub left_weight: f64,
    pub right_weight: f64,
    pub left_percent: f64,
    pub right_percent: f64,
    pub anterior_weight: f64,
    pub posterior_weight: f64,
    pub anterior_percent: f64,
    pub posterior_percent: f64,
    pub cop_x: f64,
    pub cop_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDataQuality {
    pub valid_samples: usize,
    pub invalid_samples: usize,
    pub data_gaps: usize,
    pub sampling_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryStats {
    pub duration_ms: u64,
    pub duration_formatted: String,
    pub measurement_count: usize,
    pub average_weight_kg: f64,
    pub average_left_percent: f64,
    pub average_right_percent: f64,
    pub average_anterior_percent: f64,
    pub average_posterior_percent: f64,
    pub cop_samples: usize,
    pub min_cop_x: f64,
    pub max_cop_x: f64,
    pub min_cop_y: f64,
    pub max_cop_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSession {
    pub schema_version: u32,
    pub session_id: String,
    pub patient_id: String,
    pub patient_name: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub duration_ms: u64,
    pub data_source: String,
    pub board_model: String,
    pub measurement_count: usize,
    pub sampling_rate: f64,
    pub quality: SessionDataQuality,
    pub summary: SessionSummaryStats,
    pub measurements: Vec<RecordedMeasurementPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSessionSummary {
    pub session_id: String,
    pub patient_id: String,
    pub patient_name: Option<String>,
    pub start_time: String,
    pub duration_ms: u64,
    pub duration_formatted: String,
    pub measurement_count: usize,
    pub data_source: String,
    pub file_path: String,
}

pub fn get_sessions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = if let Ok(app_dir) = app.path().app_data_dir() {
        app_dir.join("sessions")
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {e}"))?
            .join("sessions")
    };

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create sessions directory at {:?}: {e}", dir))?;
    }

    Ok(dir)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

pub fn save_session(app: &AppHandle, session: BalanceSession) -> Result<String, String> {
    if session.session_id.trim().is_empty() {
        return Err("Session ID cannot be empty".to_string());
    }

    let sessions_dir = get_sessions_dir(app)?;
    let safe_id = sanitize_filename(&session.session_id);
    let final_path = sessions_dir.join(format!("{safe_id}.json"));
    let temp_path = sessions_dir.join(format!("{safe_id}.tmp"));

    let json_bytes = serde_json::to_vec_pretty(&session)
        .map_err(|e| format!("Failed to serialize session JSON: {e}"))?;

    // Atomic write: write to temp file then rename
    fs::write(&temp_path, &json_bytes)
        .map_err(|e| format!("Failed to write temporary session file: {e}"))?;

    fs::rename(&temp_path, &final_path)
        .map_err(|e| format!("Failed to finalize session file: {e}"))?;

    Ok(final_path.to_string_lossy().to_string())
}

pub fn load_session(app: &AppHandle, session_id: &str) -> Result<BalanceSession, String> {
    let sessions_dir = get_sessions_dir(app)?;
    let safe_id = sanitize_filename(session_id.trim_end_matches(".json"));
    let path = sessions_dir.join(format!("{safe_id}.json"));

    if !path.exists() {
        return Err(format!("Session file does not exist: {:?}", path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session file {:?}: {e}", path))?;

    let session: BalanceSession = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to deserialize session JSON from {:?}: {e}", path))?;

    Ok(session)
}

pub fn list_sessions(app: &AppHandle) -> Result<Vec<SavedSessionSummary>, String> {
    let sessions_dir = get_sessions_dir(app)?;
    let mut summaries = Vec::new();

    let entries = match fs::read_dir(&sessions_dir) {
        Ok(e) => e,
        Err(_) => return Ok(summaries),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(session) = serde_json::from_str::<BalanceSession>(&content) {
                    summaries.push(SavedSessionSummary {
                        session_id: session.session_id,
                        patient_id: session.patient_id,
                        patient_name: session.patient_name,
                        start_time: session.start_time,
                        duration_ms: session.duration_ms,
                        duration_formatted: session.summary.duration_formatted,
                        measurement_count: session.measurement_count,
                        data_source: session.data_source,
                        file_path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    // Sort descending by start_time
    summaries.sort_by(|a, b| b.start_time.cmp(&a.start_time));
    Ok(summaries)
}

pub fn get_reports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = if let Ok(app_dir) = app.path().app_data_dir() {
        app_dir.join("reports")
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {e}"))?
            .join("reports")
    };

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create reports directory at {:?}: {e}", dir))?;
    }

    Ok(dir)
}

pub fn save_pdf_report(app: &AppHandle, filename: &str, pdf_bytes: &[u8]) -> Result<String, String> {
    let reports_dir = get_reports_dir(app)?;
    let safe_name = sanitize_filename(filename.trim_end_matches(".pdf"));
    let final_path = reports_dir.join(format!("{safe_name}.pdf"));
    let temp_path = reports_dir.join(format!("{safe_name}.tmp"));

    fs::write(&temp_path, pdf_bytes)
        .map_err(|e| format!("Failed to write temporary PDF file: {e}"))?;

    fs::rename(&temp_path, &final_path)
        .map_err(|e| format!("Failed to finalize PDF file: {e}"))?;

    Ok(final_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_serialization_and_data_source() {
        let session = BalanceSession {
            schema_version: 1,
            session_id: "test-session-001".into(),
            patient_id: "pat-001".into(),
            patient_name: Some("Eleanor Vance".into()),
            start_time: "2026-09-30T12:00:00.000Z".into(),
            end_time: "2026-09-30T12:00:30.000Z".into(),
            duration_ms: 30000,
            data_source: "simulation".into(),
            board_model: "RVL-WBC-01".into(),
            measurement_count: 1,
            sampling_rate: 100.0,
            quality: SessionDataQuality {
                valid_samples: 1,
                invalid_samples: 0,
                data_gaps: 0,
                sampling_rate: 100.0,
            },
            summary: SessionSummaryStats {
                duration_ms: 30000,
                duration_formatted: "00:30".into(),
                measurement_count: 1,
                average_weight_kg: 65.0,
                average_left_percent: 50.0,
                average_right_percent: 50.0,
                average_anterior_percent: 50.0,
                average_posterior_percent: 50.0,
                cop_samples: 1,
                min_cop_x: 0.0,
                max_cop_x: 0.0,
                min_cop_y: 0.0,
                max_cop_y: 0.0,
            },
            measurements: vec![RecordedMeasurementPoint {
                timestamp: "2026-09-30T12:00:00.000Z".into(),
                elapsed_ms: 0,
                front_left: 16.25,
                front_right: 16.25,
                back_left: 16.25,
                back_right: 16.25,
                total_weight: 65.0,
                left_weight: 32.5,
                right_weight: 32.5,
                left_percent: 50.0,
                right_percent: 50.0,
                anterior_weight: 32.5,
                posterior_weight: 32.5,
                anterior_percent: 50.0,
                posterior_percent: 50.0,
                cop_x: 0.0,
                cop_y: 0.0,
            }],
        };

        let json = serde_json::to_string(&session).unwrap();
        assert!(json.contains("\"dataSource\":\"simulation\""));
        assert!(json.contains("\"schemaVersion\":1"));
        assert!(json.contains("\"sessionId\":\"test-session-001\""));

        let deserialized: BalanceSession = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.session_id, "test-session-001");
        assert_eq!(deserialized.data_source, "simulation");
        assert_eq!(deserialized.measurements.len(), 1);
        assert_eq!(deserialized.measurements[0].total_weight, 65.0);
    }
}
