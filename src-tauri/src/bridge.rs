use crate::{
    engine::{Action, Shared},
    model::Settings,
};
use anyhow::{Context, Result};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

pub const NAME: &str = "io.github.typeper.Typeper";
pub const PATH: &str = "/io/github/typeper/Typeper";
pub const INTERFACE: &str = "io.github.typeper.Typeper";
struct Service {
    app: AppHandle,
    shared: Shared,
}

#[zbus::interface(name = "io.github.typeper.Typeper")]
impl Service {
    fn hello(&self) -> zbus::fdo::Result<String> {
        *self.shared.bridge_seen.lock().unwrap() = Some(Instant::now());
        let settings = self
            .shared
            .store
            .settings()
            .map_err(|e| zbus::fdo::Error::Failed(e.to_string()))?;
        serde_json::to_string(&serde_json::json!({"settings":settings,"state":self.shared.capture.lock().unwrap().clone()})).map_err(|e|zbus::fdo::Error::Failed(e.to_string()))
    }
    fn toggle(&self) {
        let _ = self.shared.tx.send(Action::Toggle);
    }
    fn release(&self) {
        let _ = self.shared.tx.send(Action::Release);
    }
    fn finish(&self) {
        let _ = self.shared.tx.send(Action::Finish);
    }
    fn cancel(&self) {
        let _ = self.shared.tx.send(Action::Cancel);
    }
    fn open(&self, page: &str) {
        if let Some(window) = self.app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        if ["activity", "history", "settings"].contains(&page) {
            let _ = self.app.emit("navigate", page);
        }
    }
    #[zbus(signal)]
    async fn capture_changed(
        emitter: &zbus::object_server::SignalEmitter<'_>,
        json: &str,
    ) -> zbus::Result<()>;
    #[zbus(signal)]
    async fn settings_changed(
        emitter: &zbus::object_server::SignalEmitter<'_>,
        json: &str,
    ) -> zbus::Result<()>;
}

pub async fn start(app: AppHandle, shared: Shared) -> Result<()> {
    let connection = zbus::connection::Builder::session()?
        .name(NAME)?
        .serve_at(
            PATH,
            Service {
                app,
                shared: shared.clone(),
            },
        )?
        .build()
        .await?;
    *shared.bridge.lock().unwrap() = Some(connection);
    Ok(())
}
pub fn connected(shared: &Shared) -> bool {
    shared
        .bridge_seen
        .lock()
        .unwrap()
        .is_some_and(|time| time.elapsed() < Duration::from_secs(16))
}
pub async fn settings_changed(shared: &Shared, settings: &Settings) {
    let connection = shared.bridge.lock().unwrap().clone();
    if let Some(connection) = connection {
        let _ = connection
            .emit_signal(
                None::<&str>,
                PATH,
                INTERFACE,
                "SettingsChanged",
                &(serde_json::to_string(settings).unwrap(),),
            )
            .await;
    }
}
pub async fn deliver(shared: &Shared, text: &str, paste: bool) -> Result<String> {
    let connection = shared.bridge.lock().unwrap().clone();
    if let Some(connection) = connection {
        if connected(shared) {
            let proxy = zbus::Proxy::new(
                &connection,
                "io.github.typeper.Shell",
                "/io/github/typeper/Shell",
                "io.github.typeper.Shell",
            )
            .await?;
            let result = tokio::time::timeout(
                Duration::from_secs(4),
                proxy.call::<_, _, String>("Deliver", &(text, paste)),
            )
            .await;
            if let Ok(Ok(status)) = result {
                return Ok(status);
            }
        }
    }
    // Clipboard-only fallback. No X11 automation or privileged input daemon on Wayland.
    let mut child = tokio::process::Command::new("wl-copy")
        .args(["--type", "text/plain;charset=utf-8"])
        .stdin(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .context("Ative a extensão GNOME ou instale wl-clipboard.")?;
    let mut stdin = child
        .stdin
        .take()
        .context("Área de transferência indisponível.")?;
    stdin.write_all(text.as_bytes()).await?;
    drop(stdin);
    let status = tokio::time::timeout(Duration::from_secs(3), child.wait()).await??;
    anyhow::ensure!(
        status.success(),
        "O compositor recusou a área de transferência."
    );
    Ok("clipboard".into())
}
