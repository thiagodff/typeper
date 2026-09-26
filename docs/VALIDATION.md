# Validação da entrega

26/09/2026. Ambiente de desenvolvimento sem sessão GNOME e sem microfone físico ou chaves dos provedores.

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite | Passaram |
| Rust/Tauri `cargo check` | Passou |
| Rust/Tauri `cargo clippy -- -D warnings` | Passou, sem avisos |
| Núcleo Rust sem UI | 6 testes passaram |
| Formatação de métricas no frontend | 3 testes passaram |
| Contratos de teclado/clipboard da extensão, com GNOME simulado | 7 testes passaram |
| Interface em Chromium/Playwright | 3 testes passaram |
| Sintaxe JavaScript e scripts shell | Passaram |
| Revisão visual dos temas claro e escuro | Realizada com capturas da interface |
| APIs reais | Não executadas: nenhuma chave fornecida |
| Gravação/atalhos/colagem no GNOME real | Não executados: ambiente sem sessão gráfica GNOME |
| Pacote de distribuição release | Não gerado; entrega de código-fonte |

**19 testes automatizados passaram.** Os testes de UI usam a prévia isolada: verificam busca, filtro, exclusão, persistência de preferências, temas, estados vazios e largura mínima. Os testes de Rust cobrem recorte de silêncio com margens, preservação sem corte, validação das opções, parsing dos provedores, payload Gemini e persistência das métricas após exclusão de textos.

Os testes da extensão verificam repetição de tecla, confirmação por Enter, prioridade do Esc sobre a liberação do atalho, modo hold, foco alterado, Ctrl+V balanceado e proteção contra colagem atrasada durante uma nova gravação. Não atestam o funcionamento das APIs de Mutter/St no compositor real.

A tentativa de vincular os testes completos com a UI encontrou um erro de arquivo intermediário vazio em `tauri-utils` neste ambiente. A checagem/clippy do aplicativo desktop passou; os testes do núcleo foram executados pela feature sem UI. Não se apresenta essa checagem como um pacote nativo executado.

Para concluir a validação de integração, execute o roteiro de [WAYLAND.md](WAYLAND.md) no Ubuntu, primeiro com um texto descartável em um editor e depois com o aplicativo desejado. Teste os dois provedores com suas próprias chaves. Alterações futuras nas APIs ou no GNOME podem exigir ajustes.
