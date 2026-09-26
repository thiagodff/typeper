pub mod audio;
#[cfg(feature = "desktop")]
mod bridge;
#[cfg(feature = "desktop")]
mod commands;
#[cfg(feature = "desktop")]
mod engine;
pub mod model;
pub mod providers;
pub mod storage;
#[cfg(feature = "desktop")]
mod tray;

#[cfg(feature = "desktop")]
use std::sync::{Arc, Mutex};
#[cfg(feature = "desktop")]
use tauri::Manager;

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
            }
            let database = directory.join("typeper.sqlite3");
            let store = storage::Store::open(&database)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&database, std::fs::Permissions::from_mode(0o600))?;
            }
            let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
            let shared = Arc::new(engine::AppState {
                store,
                tx,
                capture: Mutex::new(Default::default()),
                bridge: Mutex::new(None),
                bridge_seen: Mutex::new(None),
            });
            app.manage(shared.clone());
            tray::create(app.handle())?;
            let handle = app.handle().clone();
            let bridge_shared = shared.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = bridge::start(handle.clone(), bridge_shared.clone()).await {
                    engine::publish_error(
                        &handle,
                        &bridge_shared,
                        format!("Integração GNOME indisponível: {error}"),
                        false,
                    )
                    .await;
                }
            });
            tauri::async_runtime::spawn(engine::run(app.handle().clone(), shared, rx));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::open_key_page,
            commands::save_settings,
            commands::key_status,
            commands::save_key,
            commands::remove_key,
            commands::list_microphones,
            commands::history,
            commands::stats,
            commands::delete_transcript,
            commands::clear_history,
            commands::copy_text,
            commands::control
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Typeper");
}
