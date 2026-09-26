# Typeper

Ditado pessoal para Ubuntu/GNOME no Wayland. Tauri 2 + React + Rust, com extensão GNOME para atalhos, janela flutuante e colagem. Em desenvolvimento.

## Decisões

- Gravar em memória; enviar apenas ao confirmar. Esc descarta.
- Microfone via PulseAudio/PipeWire, PCM mono 16 kHz e VAD local.
- OpenAI e Gemini com chaves no chaveiro do sistema.
- Histórico e métricas locais em SQLite.
- Extensão GNOME para integração com o compositor sem ativar uma janela Tauri durante o ditado.
- Commits seguem Conventional Commits.
