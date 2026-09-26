# Typeper

**Sua voz, onde você escreve.** Ditado pessoal para Ubuntu/GNOME no Wayland, feito com Tauri 2, Rust, React e TypeScript.

[Prévia clara](docs/previews/activity-light.png) · [Prévia escura](docs/previews/settings-dark.png)

## Implementado

- Atalho global e janela flutuante com nível de áudio, cronômetro e estado de pausa.
- **Alternar:** aperte para gravar; confirme com o mesmo atalho ou Enter.
- **Segurar:** segure enquanto fala; solte para confirmar.
- **Esc:** encerra a captura e descarta o áudio sem chamar as APIs.
- Clipboard e tentativa de Ctrl+V na janela original, sem apresentar a janela Tauri.
- OpenAI: GPT Transcribe, GPT-4o Transcribe e GPT-4o Mini Transcribe.
- Gemini 3.5 Transcribe, com integração dedicada de transcrição.
- Duas chaves independentes no chaveiro do Linux, via Secret Service.
- Microfone padrão do sistema ou dispositivo específico, também pelo indicador da barra superior.
- VAD WebRTC local, com 200 ms antes da fala e 500 ms depois para preservar as bordas das palavras.
- Histórico SQLite: data/hora, busca, filtro por provedor, cópia e exclusão.
- Atividade dos últimos 30 dias: transcrições, palavras, áudio, silêncio removido e uso por provedor.
- Temas claro, escuro e automático. Logo original em `public/typeper.svg`.
- Falhas de API preservam o áudio **somente em memória**, para tentar novamente ou descartar.

## Iniciar no Ubuntu

Requisitos: Ubuntu com **GNOME 45–50**, sessão Wayland, PulseAudio ou PipeWire com `pipewire-pulse`, Node.js 22+ e Rust stable atualizado. Os metadados permitem essas versões do GNOME; a integração real ainda precisa de validação no desktop instalado.

Na pasta `typeper`:

```bash
# Dependências de compilação e execução (Ubuntu 24.04+).
bash scripts/setup-ubuntu.sh

# Instale Rust por https://rustup.rs, se necessário.
rustup update stable
npm ci

# Instala a extensão apenas para o usuário atual, sem sudo.
npm run extension:install

# Abre o aplicativo Tauri.
npm run desktop
```

Se o GNOME ainda não reconhecer a extensão, encerre a sessão, entre novamente e execute:

```bash
gnome-extensions enable typeper@typeper.local
```

Abra **Configurações**, salve a chave da OpenAI ou do Gemini e selecione o provedor. “Chave adicionada” confirma o armazenamento, não o acesso ao modelo: a API verifica isso no primeiro ditado. Salvar a chave não envia áudio nem faz requisições pagas de teste.

Clique em um campo de texto e use **Ctrl + Super + Espaço**. Fale e confirme. Fechar a janela mantém o Typeper em segundo plano. Para encerrar, use **Sair do Typeper** no indicador.

## Gerar pacote instalável

```bash
npm run package -- --bundles deb
sudo apt install ./src-tauri/target/release/bundle/deb/typeper_*.deb
```

A extensão GNOME é instalada separadamente pelo comando anterior. Para AppImage: `npm run package -- --bundles appimage`. Esta entrega contém **código-fonte e Git**, sem binário pré-compilado.

Para desenvolver só a interface:

```bash
npm run dev
# http://localhost:1420
# ?demo=1 mostra dados de exemplo, claramente identificados.
```

A prévia de navegador não grava, não recebe chaves e não chama APIs. No Tauri, dados e ações vêm do backend Rust.

## Wayland e foco

A extensão desenha a cápsula no monitor ativo e faz uma captura temporária do teclado no Shell, restaurando o foco anterior ao confirmar ou cancelar. Nenhuma janela Tauri é ativada durante o ditado.

- Só tenta colar se a janela original ainda estiver selecionada. Não força a volta a outra janela.
- Se não houver campo editável, o texto fica no clipboard. Não é possível confirmar que o campo aceitou a colagem.
- Usa Ctrl+V. Aplicativos que exigem outro atalho, como alguns terminais, precisam de colagem manual.
- O limite local é **5 minutos**: a captura para no limite, mas exige confirmação antes de enviar.
- Durante pausas, o microfone continua aberto para detectar o retorno da fala; o silêncio é removido do buffer.
- Sem extensão, é possível gravar pela janela principal e tentar clipboard via `wl-copy`, sem atalhos ou colagem globais.

Detalhes e roteiro de teste: [docs/WAYLAND.md](docs/WAYLAND.md).

## Dados e métricas

O áudio não é escrito em disco. Antes da confirmação não há upload. Após confirmar, a requisição já pode ter chegado ao provedor; cancelá-la não desfaz dados enviados nem eventuais cobranças. Não há reenvio automático ou troca silenciosa de provedor.

As chaves ficam no Secret Service (`io.github.typeper.Typeper`), não em SQLite, localStorage ou Git. Histórico e preferências ficam em `$XDG_DATA_HOME/io.github.typeper.Typeper/typeper.sqlite3` (normalmente `~/.local/share/io.github.typeper.Typeper/`). Diretório 0700 e banco 0600. O histórico de textos **não é criptografado**.

As métricas contam tentativas iniciadas e a duração do áudio preparado para elas, incluindo reenvios. Uma falha de rede não permite saber se o provedor recebeu ou cobrou a requisição. Tokens aparecem somente quando retornados pela API. Os números não consultam saldo, quota ou fatura. Apagar textos mantém métricas de uso. Cancelar antes de enviar não conta como requisição.

Não há seletor de tom: o fluxo preserva a fala. Formalizar ou tornar um texto casual exigiria reescrita, com possível alteração de significado. Também não há dicionário, conta Typeper, servidor próprio, telemetria ou sincronização.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/pages/` | Atividade, histórico e configurações |
| `src/lib/api.ts` | IPC e prévia isolada |
| `src-tauri/src/audio.rs` | Captura `parec`, VAD, margens e WAV |
| `src-tauri/src/engine.rs` | Gravação, cancelamento, envio e recuperação |
| `src-tauri/src/providers.rs` | Contratos HTTP OpenAI/Gemini |
| `src-tauri/src/storage.rs` | SQLite e chaveiro |
| `src-tauri/src/bridge.rs` | D-Bus com a extensão |
| `gnome-extension/` | Atalhos, indicador, janela flutuante e clipboard |

## Verificações

```bash
npm run check
npm run test:gnome
npx playwright install chromium
npm run test:e2e
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib
```

Os testes da extensão simulam APIs do GNOME: não substituem um teste em sessão Wayland. Resultados desta entrega em [docs/VALIDATION.md](docs/VALIDATION.md). Fontes oficiais em [docs/API_NOTES.md](docs/API_NOTES.md).

## Git

O repositório local já contém commits Conventional Commits. O arquivo de entrega inclui `.git`; extraia preservando arquivos ocultos. Nenhum remoto foi criado. Use `git log --oneline` para acompanhar as etapas.
