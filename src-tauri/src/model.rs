use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub provider: String,
    pub openai_model: String,
    pub gemini_model: String,
    pub microphone: String,
    pub language: String,
    pub mode: String,
    pub shortcut: String,
    pub theme: String,
    pub auto_paste: bool,
    pub trim_silence: bool,
    pub vad_mode: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: "openai".into(),
            openai_model: "gpt-transcribe".into(),
            gemini_model: "gemini-3.5-transcribe".into(),
            microphone: "default".into(),
            language: "auto".into(),
            mode: "toggle".into(),
            shortcut: "<Control><Super>space".into(),
            theme: "system".into(),
            auto_paste: true,
            trim_silence: true,
            vad_mode: 1,
        }
    }
}
impl Settings {
    pub fn model(&self) -> &str {
        if self.provider == "openai" {
            &self.openai_model
        } else {
            &self.gemini_model
        }
    }
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            ["openai", "gemini"].contains(&self.provider.as_str()),
            "Provedor inválido."
        );
        anyhow::ensure!(
            [
                "gpt-transcribe",
                "gpt-4o-transcribe",
                "gpt-4o-mini-transcribe"
            ]
            .contains(&self.openai_model.as_str()),
            "Modelo OpenAI inválido."
        );
        anyhow::ensure!(
            self.gemini_model == "gemini-3.5-transcribe",
            "Modelo Gemini inválido."
        );
        anyhow::ensure!(
            ["toggle", "hold"].contains(&self.mode.as_str()),
            "Modo inválido."
        );
        anyhow::ensure!(
            ["system", "light", "dark"].contains(&self.theme.as_str()),
            "Tema inválido."
        );
        anyhow::ensure!(
            ["auto", "pt-BR", "en-US", "es-ES", "ja-JP"].contains(&self.language.as_str()),
            "Idioma inválido."
        );
        anyhow::ensure!(self.vad_mode <= 3, "Sensibilidade inválida.");
        anyhow::ensure!(
            self.microphone.len() <= 256 && !self.microphone.contains('\0'),
            "Microfone inválido."
        );
        anyhow::ensure!(
            [
                "<Control><Super>space",
                "<Control><Alt>space",
                "<Super><Shift>d",
                "<Control><Shift>F9"
            ]
            .contains(&self.shortcut.as_str()),
            "Atalho inválido."
        );
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: String,
    pub created_at: String,
    pub text: String,
    pub provider: String,
    pub model: String,
    pub language: String,
    pub audio_seconds: f64,
    pub recorded_seconds: f64,
    pub latency_ms: u64,
    pub words: usize,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStats {
    pub provider: String,
    pub requests: u64,
    pub successes: u64,
    pub failures: u64,
    pub audio_seconds: f64,
    pub recorded_seconds: f64,
    pub words: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub token_reports: u64,
    pub average_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureState {
    pub phase: String,
    pub paused: bool,
    pub level: f64,
    pub seconds: f64,
    pub audio_seconds: f64,
    pub message: String,
    pub can_retry: bool,
}
impl Default for CaptureState {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            paused: false,
            level: 0.,
            seconds: 0.,
            audio_seconds: 0.,
            message: String::new(),
            can_retry: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Microphone {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Default)]
pub struct Usage {
    pub input: Option<u64>,
    pub output: Option<u64>,
}
#[derive(Debug, Clone)]
pub struct Transcription {
    pub text: String,
    pub usage: Usage,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_arbitrary_provider_and_shortcut() {
        let mut settings = Settings::default();
        assert!(settings.validate().is_ok());
        settings.provider = "https://unknown.test".into();
        assert!(settings.validate().is_err());
        settings.provider = "openai".into();
        settings.shortcut = "Return".into();
        assert!(settings.validate().is_err());
    }
}
