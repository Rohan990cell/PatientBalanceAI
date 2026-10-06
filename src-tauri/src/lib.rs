use std::sync::Arc;
use tauri::{AppHandle, State};

pub mod hardware;
pub mod session;

use hardware::service::BalanceBoardService;
use hardware::types::BoardStatus;
use session::{BalanceSession, SavedSessionSummary};

#[tauri::command]
fn get_system_status() -> String {
    "PatientBalanceAI Native Engine Active".into()
}

#[tauri::command]
async fn get_balance_board_status(
    service: State<'_, Arc<BalanceBoardService>>,
) -> Result<BoardStatus, String> {
    Ok(service.get_status().await)
}

#[tauri::command]
async fn scan_and_connect_balance_board(
    app: AppHandle,
    service: State<'_, Arc<BalanceBoardService>>,
) -> Result<(), String> {
    let svc = service.inner().clone();
    svc.scan_and_connect(app)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn direct_hid_connect(
    app: AppHandle,
    service: State<'_, Arc<BalanceBoardService>>,
) -> Result<(), String> {
    let svc = service.inner().clone();
    svc.direct_hid_connect(app)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn disconnect_balance_board(
    app: AppHandle,
    service: State<'_, Arc<BalanceBoardService>>,
) -> Result<(), String> {
    service.disconnect(&app).await;
    Ok(())
}

#[tauri::command]
async fn tare_balance_board(service: State<'_, Arc<BalanceBoardService>>) -> Result<(), String> {
    service.tare().await;
    Ok(())
}

#[tauri::command]
async fn save_balance_session(
    app: AppHandle,
    session: BalanceSession,
) -> Result<String, String> {
    session::save_session(&app, session)
}

#[tauri::command]
async fn load_balance_session(
    app: AppHandle,
    session_id: String,
) -> Result<BalanceSession, String> {
    session::load_session(&app, &session_id)
}

#[tauri::command]
async fn list_saved_sessions(
    app: AppHandle,
) -> Result<Vec<SavedSessionSummary>, String> {
    session::list_sessions(&app)
}

#[tauri::command]
async fn save_pdf_report(
    app: AppHandle,
    filename: String,
    pdf_bytes: Vec<u8>,
) -> Result<String, String> {
    session::save_pdf_report(&app, &filename, &pdf_bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    let service = Arc::new(BalanceBoardService::default());

    tauri::Builder::default()
        .manage(service)
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_balance_board_status,
            scan_and_connect_balance_board,
            direct_hid_connect,
            disconnect_balance_board,
            tare_balance_board,
            save_balance_session,
            load_balance_session,
            list_saved_sessions,
            save_pdf_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PatientBalanceAI application");
}
