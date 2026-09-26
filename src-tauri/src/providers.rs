use crate::{audio::RecordedAudio, model::*};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{multipart, Client};
use serde_json::{json, Value};
use std::time::Duration;

pub fn client() -> Result<Client> {
    Ok(Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
pub async fn transcribe(
    settings: &Settings,
    audio: &RecordedAudio,
    key: String,
) -> Result<Transcription> {
    anyhow::ensure!(
        audio.wav.len() < 12_000_000,
        "Gravação maior que o limite local de 5 minutos."
    );
    let client = client()?;
    let request = if settings.provider == "openai" {
        let file = multipart::Part::bytes(audio.wav.clone())
            .file_name("dictation.wav")
            .mime_str("audio/wav")?;
        let mut form = multipart::Form::new()
            .text("model", settings.openai_model.clone())
            .part("file", file);
        if settings.language != "auto" {
            let field = if settings.openai_model == "gpt-transcribe" {
                "languages[]"
            } else {
                "language"
            };
            form = form.text(
                field,
                settings
                    .language
                    .split('-')
                    .next()
                    .unwrap_or("pt")
                    .to_string(),
            );
        }
        client
            .post("https://api.openai.com/v1/audio/transcriptions")
            .bearer_auth(&key)
            .multipart(form)
    } else {
        client
            .post("https://generativelanguage.googleapis.com/v1beta/interactions")
            .header("x-goog-api-key", &key)
            .json(&gemini_body(settings, &audio.wav))
    };
    let response = request
        .send()
        .await
        .context("Falha de conexão. O áudio continua em memória; você pode tentar novamente.")?;
    let status = response.status();
    if !status.is_success() {
        // Do not forward arbitrary provider bodies: they can contain request data.
        anyhow::bail!(
            "{}",
            match status.as_u16() {
                401 | 403 => "Chave recusada ou sem acesso ao modelo. Confira as configurações.",
                404 => "Modelo indisponível para esta chave. Confira o modelo selecionado.",
                429 => "Limite de uso ou saldo da API atingido. Aguarde e confira sua conta.",
                400 | 422 => "A API recusou os parâmetros ou o áudio. Confira modelo e idioma.",
                413 => "A API recusou o tamanho da gravação.",
                _ => "O provedor está indisponível. Você pode tentar novamente.",
            }
        );
    }
    let body: Value = response
        .json()
        .await
        .context("Resposta inválida do provedor.")?;
    parse(&settings.provider, &body)
}

pub fn gemini_body(settings: &Settings, wav: &[u8]) -> Value {
    let languages: Vec<&str> = if settings.language == "auto" {
        vec![]
    } else {
        vec![&settings.language]
    };
    json!({ "model":settings.gemini_model, "store":false,
        "input":[{"type":"audio","data":STANDARD.encode(wav),"mime_type":"audio/wav"}],
        "generation_config":{"transcription_config":{"language_codes":languages,"mode":{"type":"verbatim"}}} })
}

pub fn parse(provider: &str, body: &Value) -> Result<Transcription> {
    let text = if provider == "openai" {
        body["text"].as_str().unwrap_or("").to_string()
    } else if let Some(text) = body["output_text"].as_str() {
        text.to_string()
    } else {
        // Interactions REST returns model_output steps; older revisions use outputs.
        let mut parts = Vec::new();
        if let Some(steps) = body["steps"].as_array() {
            for step in steps {
                if step["type"] == "model_output" {
                    if let Some(content) = step["content"].as_array() {
                        for part in content {
                            if part["type"] == "text" {
                                if let Some(t) = part["text"].as_str() {
                                    parts.push(t);
                                }
                            }
                        }
                    }
                }
            }
        }
        if parts.is_empty() {
            if let Some(outputs) = body["outputs"].as_array() {
                for part in outputs {
                    if part["type"] == "text" {
                        if let Some(t) = part["text"].as_str() {
                            parts.push(t);
                        }
                    }
                }
            }
        }
        parts.join("\n")
    };
    anyhow::ensure!(
        !text.trim().is_empty(),
        "A API não retornou texto. O áudio foi preservado para uma nova tentativa."
    );
    let u = &body["usage"];
    Ok(Transcription {
        text: text.trim().into(),
        usage: Usage {
            input: u["input_tokens"]
                .as_u64()
                .or_else(|| u["total_input_tokens"].as_u64()),
            output: u["output_tokens"]
                .as_u64()
                .or_else(|| u["total_output_tokens"].as_u64()),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_only_transcript_not_thoughts_or_input() {
        let b = json!({"steps":[{"type":"user_input","content":[{"type":"text","text":"ignore"}]},{"type":"model_output","content":[{"type":"thought","text":"ignore"},{"type":"text","text":"Olá."}]}],"usage":{"total_input_tokens":32,"total_output_tokens":2}});
        let t = parse("gemini", &b).unwrap();
        assert_eq!(t.text, "Olá.");
        assert_eq!(t.usage.input, Some(32));
        assert!(parse("openai", &json!({"text":"   "})).is_err());
    }
    #[test]
    fn uses_inline_audio_and_disables_interaction_storage() {
        let b = gemini_body(&Settings::default(), &[1, 2, 3]);
        assert_eq!(b["store"], false);
        assert_eq!(b["input"][0]["data"], "AQID");
        assert_eq!(
            b["generation_config"]["transcription_config"]["mode"]["type"],
            "verbatim"
        );
    }
}
