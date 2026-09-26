# APIs e escolhas técnicas

Documentação consultada em 26/09/2026, incluindo Context7 para Tauri. Chamadas feitas no Rust, usando endpoints fixos e HTTPS. Chaves não entram em URLs ou logs.

## OpenAI

- `POST https://api.openai.com/v1/audio/transcriptions`, multipart `file` e `model`.
- Padrão `gpt-transcribe`; GPT-4o e GPT-4o Mini Transcribe também selecionáveis.
- O modelo novo usa `languages[]`; as alternativas usam `language`. Não enviamos ambos.
- Resposta em `text`. Tokens de `usage` quando disponíveis.
- Sem streaming ou Realtime: áudio local até confirmar.

Fontes: [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [GPT-4o Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe).

## Gemini

- `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`.
- Modelo dedicado `gemini-3.5-transcribe`.
- WAV base64 inline em `input`, tipo `audio`, `mime_type: audio/wav`.
- `generation_config.transcription_config.language_codes` com dicas BCP-47; vazio para automático.
- Modo `verbatim`. `store: false` desativa armazenamento recuperável da interação, sem substituir as políticas gerais do provedor.
- Parser aceita `output_text`, conteúdos `text` de `model_output` em `steps` e formato anterior `outputs`. Não concatena pensamentos ou entradas do usuário.
- Métricas de `usage.total_input_tokens` e `usage.total_output_tokens` quando presentes.

Fontes: [Audio transcription](https://ai.google.dev/gemini-api/docs/transcribe), [Interactions API](https://ai.google.dev/api/interactions-api), [Audio understanding](https://ai.google.dev/gemini-api/docs/audio).

## Tom e limites

Um seletor de tom implicaria reescrita, dispensável no ditado fiel. Gemini tem modo smart; esta versão usa verbatim. Contexto de transcrição na OpenAI não é garantia de um tom editorial.

Cinco minutos a 16 kHz/mono/16-bit geram cerca de 9,6 MB de WAV, antes da remoção de silêncio. A requisição inline Gemini fica em aproximadamente 12,8 MB de base64 no pior caso.

Há timeout de conexão e requisição. Sem retry automático: não se sabe se uma tentativa com falha foi processada/cobrada. Repetir mantém provedor/modelo originais e só copia o texto, porque a janela de destino pode ter mudado. Para mudar de provedor, descarte e inicie outro ditado.

Não consultamos faturamento ou quota. Duração medida no cliente; tokens retornados pela API. Falhas sem resposta permanecem sem contagem de tokens.

## Tauri e GNOME

- [System tray](https://v2.tauri.app/learn/system-tray/)
- [Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
- [GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html)
- [GNOME extension anatomy](https://gjs.guide/extensions/overview/anatomy.html)
- [Implementação de foco modal no GNOME](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-46/js/ui/main.js)

A extensão é uma decisão deste projeto para o ambiente confirmado, sem promessa de compatibilidade universal Wayland.
