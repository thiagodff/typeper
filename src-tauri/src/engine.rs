use crate::{
    audio::{Capture, RecordedAudio, RATE},
    bridge,
    model::*,
    providers, storage,
};
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

pub type Shared = Arc<AppState>;
pub struct AppState {
    pub store: storage::Store,
    pub tx: mpsc::UnboundedSender<Action>,
    pub capture: Mutex<CaptureState>,
    pub bridge: Mutex<Option<zbus::Connection>>,
    pub bridge_seen: Mutex<Option<Instant>>,
}
pub enum Action {
    Toggle,
    Release,
    Finish,
    Cancel,
    Retry,
    Result {
        id: String,
        result: Result<Transcription, String>,
        latency: u64,
    },
}

struct Pending {
    audio: RecordedAudio,
    settings: Settings,
}

pub async fn run(app: AppHandle, shared: Shared, mut rx: mpsc::UnboundedReceiver<Action>) {
    let mut capture: Option<Capture> = None;
    let mut pending: Option<Pending> = None;
    let mut settings = Settings::default();
    let mut job: Option<tokio::task::JoinHandle<()>> = None;
    let mut active_id = String::new();
    let mut ticker = tokio::time::interval(std::time::Duration::from_millis(100));
    loop {
        let action = tokio::select! {
            value = rx.recv() => { match value { Some(value)=>value, None=>break } },
            _ = ticker.tick() => {
                if let Some(current) = &capture {
                    let state = { let b = current.buffer.lock().unwrap(); CaptureState {
                        phase:if b.ended { "ready" } else { "recording" }.into(), paused:b.paused, level:b.level,
                        seconds:b.total as f64 / RATE as f64, audio_seconds:b.pcm.len() as f64 / RATE as f64,
                        message: if b.ended { b.error.clone().unwrap_or("Limite de 5 minutos. Confirme para enviar ou Esc para descartar.".into()) } else { String::new() }, can_retry:false,
                    }};
                    publish(&app, &shared, state).await;
                }
                continue;
            }
        };
        match action {
            Action::Cancel => {
                // This branch never calls a provider. Dropping Capture stops parec and erases its buffer.
                capture.take();
                pending.take();
                if let Some(task) = job.take() {
                    task.abort();
                    let _ =
                        shared
                            .store
                            .finish_usage(&active_id, "cancelled", 0, 0, &Usage::default());
                }
                active_id.clear();
                publish(&app, &shared, CaptureState::default()).await;
            }
            Action::Toggle if capture.is_none() => {
                if job.is_some() || pending.is_some() {
                    continue;
                }
                let result = (|| -> anyhow::Result<Capture> {
                    settings = shared.store.settings()?;
                    storage::get_key(&settings.provider)?;
                    Capture::start(&settings)
                })();
                match result {
                    Ok(value) => {
                        capture = Some(value);
                        publish(
                            &app,
                            &shared,
                            CaptureState {
                                phase: "recording".into(),
                                ..Default::default()
                            },
                        )
                        .await;
                    }
                    Err(error) => publish_error(&app, &shared, error.to_string(), false).await,
                }
            }
            Action::Toggle | Action::Finish | Action::Release => {
                if matches!(action, Action::Release) && settings.mode != "hold" {
                    continue;
                }
                if let Some(current) = capture.take() {
                    match current.stop() {
                        Ok(audio) => {
                            pending = Some(Pending {
                                audio,
                                settings: settings.clone(),
                            })
                        }
                        Err(error) => {
                            publish_error(&app, &shared, error.to_string(), false).await;
                            continue;
                        }
                    }
                    submit(&app, &shared, &pending, &mut job, &mut active_id).await;
                }
            }
            Action::Retry => {
                if job.is_none() && pending.is_some() {
                    // A retry happens in Settings/Activity, so never paste into that now-focused UI.
                    if let Some(p) = pending.as_mut() {
                        p.settings.auto_paste = false;
                    }
                    submit(&app, &shared, &pending, &mut job, &mut active_id).await;
                }
            }
            Action::Result {
                id,
                result,
                latency,
            } => {
                if id != active_id {
                    continue;
                } // Ignore any result racing a cancellation.
                job.take();
                let Some(p) = pending.as_ref() else {
                    continue;
                };
                match result {
                    Ok(result) => {
                        let t = Transcript {
                            id: id.clone(),
                            created_at: chrono::Utc::now().to_rfc3339(),
                            words: result.text.split_whitespace().count(),
                            text: result.text,
                            provider: p.settings.provider.clone(),
                            model: p.settings.model().into(),
                            language: p.settings.language.clone(),
                            audio_seconds: p.audio.seconds,
                            recorded_seconds: p.audio.recorded_seconds,
                            latency_ms: latency,
                        };
                        let usage_result = shared.store.finish_usage(
                            &id,
                            "success",
                            latency,
                            t.words,
                            &result.usage,
                        );
                        let saved = shared.store.insert(&t);
                        let copied = bridge::deliver(&shared, &t.text, p.settings.auto_paste).await;
                        let mut message = match copied {
                            Ok(_) => "Texto copiado para a área de transferência.".into(),
                            Err(e) => format!("Texto transcrito. Não foi possível copiar: {e}"),
                        };
                        if saved.is_err() {
                            message = "Texto transcrito, mas o histórico não pôde ser salvo. Copie o resultado exibido antes de fechar.".into();
                        }
                        if usage_result.is_err() {
                            message += " Não foi possível registrar o uso.";
                        }
                        let _ = app.emit("transcript", &t);
                        pending.take();
                        active_id.clear();
                        publish(
                            &app,
                            &shared,
                            CaptureState {
                                message,
                                ..Default::default()
                            },
                        )
                        .await;
                    }
                    Err(error) => {
                        let _ =
                            shared
                                .store
                                .finish_usage(&id, "error", latency, 0, &Usage::default());
                        publish_error(&app, &shared, error, true).await;
                    }
                }
                let _ = app.emit("data-changed", ());
            }
        }
    }
}

async fn submit(
    app: &AppHandle,
    shared: &Shared,
    pending: &Option<Pending>,
    job: &mut Option<tokio::task::JoinHandle<()>>,
    active_id: &mut String,
) {
    let Some(p) = pending else {
        return;
    };
    let key = match storage::get_key(&p.settings.provider) {
        Ok(key) => key,
        Err(e) => {
            publish_error(app, shared, e.to_string(), true).await;
            return;
        }
    };
    *active_id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = shared.store.start_usage(
        active_id,
        &p.settings,
        p.audio.seconds,
        p.audio.recorded_seconds,
    ) {
        publish_error(
            app,
            shared,
            format!("Não foi possível registrar o envio: {e}"),
            true,
        )
        .await;
        return;
    }
    publish(
        app,
        shared,
        CaptureState {
            phase: "transcribing".into(),
            seconds: p.audio.recorded_seconds,
            audio_seconds: p.audio.seconds,
            ..Default::default()
        },
    )
    .await;
    let id = active_id.clone();
    let tx = shared.tx.clone();
    let audio = p.audio.clone();
    let settings = p.settings.clone();
    *job = Some(tokio::spawn(async move {
        let start = Instant::now();
        let result = providers::transcribe(&settings, &audio, key)
            .await
            .map_err(|e| e.to_string());
        let _ = tx.send(Action::Result {
            id,
            result,
            latency: start.elapsed().as_millis() as u64,
        });
    }));
}
pub async fn publish(app: &AppHandle, shared: &Shared, state: CaptureState) {
    *shared.capture.lock().unwrap() = state.clone();
    let _ = app.emit("capture-state", &state);
    let connection = shared.bridge.lock().unwrap().clone();
    if let Some(connection) = connection {
        let _ = connection
            .emit_signal(
                None::<&str>,
                bridge::PATH,
                bridge::INTERFACE,
                "CaptureChanged",
                &(serde_json::to_string(&state).unwrap(),),
            )
            .await;
    }
}
pub async fn publish_error(app: &AppHandle, shared: &Shared, message: String, can_retry: bool) {
    publish(
        app,
        shared,
        CaptureState {
            phase: "error".into(),
            message,
            can_retry,
            ..Default::default()
        },
    )
    .await;
}
pub fn action(app: &AppHandle, action: Action) {
    let _ = app.state::<Shared>().tx.send(action);
}
