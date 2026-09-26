use crate::{
    audio, bridge,
    engine::{Action, Shared},
    model::*,
    storage,
};
use serde::Serialize;
use tauri::{Emitter, State};

type CmdResult<T> = Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: Settings,
    pub capture: CaptureState,
    pub extension_connected: bool,
}
#[tauri::command]
pub fn snapshot(state: State<Shared>) -> CmdResult<Snapshot> {
    Ok(Snapshot {
        settings: state.store.settings().map_err(err)?,
        capture: state.capture.lock().unwrap().clone(),
        extension_connected: bridge::connected(&state),
    })
}
#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, Shared>,
    settings: Settings,
) -> CmdResult<()> {
    let phase = state.capture.lock().unwrap().phase.clone();
    if ["recording", "ready", "transcribing"].contains(&phase.as_str()) {
        return Err("Finalize a gravação antes de alterar configurações.".into());
    }
    state.store.save_settings(&settings).map_err(err)?;
    bridge::settings_changed(&state, &settings).await;
    crate::tray::refresh(&app).map_err(err)?;
    let _ = app.emit("data-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn key_status() -> CmdResult<serde_json::Value> {
    tokio::task::spawn_blocking(|| {
        let mut status=serde_json::Map::new();
        for provider in ["openai","gemini"] {
            let value=match storage::key_entry(provider).and_then(|entry|Ok(entry.get_password()?)) {
                Ok(_)=>serde_json::json!({"saved":true,"error":null}),
                Err(e)=>{
                    let no_entry=e.downcast_ref::<keyring::Error>().is_some_and(|e|matches!(e,keyring::Error::NoEntry));
                    serde_json::json!({"saved":false,"error":if no_entry { None } else { Some("Chaveiro indisponível ou bloqueado.") }})
                }
            };
            status.insert(provider.into(),value);
        }
        Ok(serde_json::Value::Object(status))
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn save_key(provider: String, key: String) -> CmdResult<()> {
    tokio::task::spawn_blocking(move || {
        let key = key.trim();
        if key.len() < 10 || key.len() > 1024 || key.chars().any(char::is_whitespace) {
            return Err("Confira a chave informada.".into());
        }
        storage::key_entry(&provider)
            .map_err(err)?
            .set_password(key)
            .map_err(|_| {
                "Não foi possível salvar no chaveiro do Linux. Desbloqueie-o e tente novamente."
                    .into()
            })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn remove_key(provider: String) -> CmdResult<()> {
    tokio::task::spawn_blocking(move || {
        match storage::key_entry(&provider)
            .map_err(err)?
            .delete_credential()
        {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Não foi possível remover a chave.".into()),
        }
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn list_microphones() -> CmdResult<Vec<Microphone>> {
    tokio::task::spawn_blocking(audio::microphones)
        .await
        .map_err(err)?
        .map_err(err)
}
#[tauri::command]
pub fn history(
    state: State<Shared>,
    query: String,
    provider: String,
    offset: u32,
) -> CmdResult<Vec<Transcript>> {
    state.store.history(&query, &provider, offset).map_err(err)
}
#[tauri::command]
pub fn stats(state: State<Shared>) -> CmdResult<Vec<ProviderStats>> {
    state.store.stats().map_err(err)
}
#[tauri::command]
pub fn delete_transcript(app: tauri::AppHandle, state: State<Shared>, id: String) -> CmdResult<()> {
    state.store.delete(&id).map_err(err)?;
    let _ = app.emit("data-changed", ());
    Ok(())
}
#[tauri::command]
pub fn clear_history(app: tauri::AppHandle, state: State<Shared>) -> CmdResult<()> {
    state.store.clear().map_err(err)?;
    let _ = app.emit("data-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn copy_text(state: State<'_, Shared>, text: String) -> CmdResult<()> {
    bridge::deliver(&state, &text, false)
        .await
        .map(|_| ())
        .map_err(err)
}
#[tauri::command]
pub fn control(state: State<Shared>, action: String) -> CmdResult<()> {
    let action = match action.as_str() {
        "toggle" => Action::Toggle,
        "finish" => Action::Finish,
        "cancel" => Action::Cancel,
        "retry" => Action::Retry,
        _ => return Err("Ação inválida.".into()),
    };
    state.tx.send(action).map_err(err)
}
