use crate::{
    audio, bridge,
    engine::{self, Action, Shared},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Abrir Typeper",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "record",
        "Iniciar / finalizar ditado",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "cancel",
        "Cancelar gravação",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let settings = app.state::<Shared>().store.settings().unwrap_or_default();
    let providers = Submenu::new(app, "Transcrição", true)?;
    for (id, name) in [("openai", "OpenAI"), ("gemini", "Gemini")] {
        let label = format!(
            "{}{}",
            if settings.provider == id { "✓ " } else { "" },
            name
        );
        providers.append(&MenuItem::with_id(
            app,
            format!("provider:{id}"),
            label,
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&providers)?;
    let microphones = Submenu::new(app, "Microfone", true)?;
    if let Ok(devices) = audio::microphones() {
        for device in devices {
            let label = format!(
                "{}{}",
                if settings.microphone == device.id {
                    "✓ "
                } else {
                    ""
                },
                device.name
            );
            microphones.append(&MenuItem::with_id(
                app,
                format!("mic:{}", device.id),
                label,
                true,
                None::<&str>,
            )?)?;
        }
    }
    menu.append(&microphones)?;
    let languages = Submenu::new(app, "Idioma", true)?;
    for (id, name) in [
        ("auto", "Automático"),
        ("pt-BR", "Português"),
        ("en-US", "English"),
        ("es-ES", "Español"),
        ("ja-JP", "日本語"),
    ] {
        languages.append(&MenuItem::with_id(
            app,
            format!("language:{id}"),
            format!(
                "{}{}",
                if settings.language == id { "✓ " } else { "" },
                name
            ),
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&languages)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "history",
        "Histórico",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Configurações",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?)?;
    Ok(menu)
}
pub fn refresh(app: &AppHandle) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("typeper") {
        tray.set_menu(Some(menu(app)?))?;
    }
    Ok(())
}
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id("typeper")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Typeper · sua voz, onde você escreve")
        .menu(&menu(app)?)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "quit" => {
                    engine::action(app, Action::Cancel);
                    app.exit(0);
                }
                "record" => engine::action(app, Action::Toggle),
                "cancel" => engine::action(app, Action::Cancel),
                "open" | "history" | "settings" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("navigate", if id == "open" { "activity" } else { id });
                }
                _ => {
                    let shared = app.state::<Shared>().inner().clone();
                    let phase = shared.capture.lock().unwrap().phase.clone();
                    if ["recording", "ready", "transcribing"].contains(&phase.as_str()) {
                        return;
                    }
                    if let Ok(mut settings) = shared.store.settings() {
                        if let Some(value) = id.strip_prefix("provider:") {
                            settings.provider = value.into();
                        } else if let Some(value) = id.strip_prefix("mic:") {
                            settings.microphone = value.into();
                        } else if let Some(value) = id.strip_prefix("language:") {
                            settings.language = value.into();
                        } else {
                            return;
                        }
                        if shared.store.save_settings(&settings).is_ok() {
                            let _ = refresh(app);
                            let _ = app.emit("data-changed", ());
                            tauri::async_runtime::spawn(async move {
                                bridge::settings_changed(&shared, &settings).await;
                            });
                        }
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}
