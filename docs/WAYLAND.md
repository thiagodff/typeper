# Integração Ubuntu / GNOME

O Wayland delega ao compositor atalhos, posicionamento e injeção de entrada. O portal GlobalShortcuts fornece ativação/desativação de atalhos, mas não uma captura temporária genérica de Enter/Esc. A extensão implementa esses comportamentos para o ambiente confirmado: Ubuntu/GNOME.

Não usamos XWayland/xdotool para simular compatibilidade Wayland, leitura de `/dev/input`, grupo `input`, daemon root ou ydotool.

## Fluxo

1. O Tauri registra `io.github.typeper.Typeper` no D-Bus da sessão.
2. A extensão lê preferências e registra o atalho no Mutter. Chaves de API não trafegam no D-Bus.
3. No atalho, guarda a `Meta.Window` atual, desenha a cápsula com St e faz `Main.pushModal` para receber teclado. Nenhuma janela Tauri é apresentada.
4. O Rust abre `parec`, processa frames de 20 ms com WebRTC VAD e mantém PCM em memória.
5. A confirmação fecha a cápsula e libera a captura de teclado. O Rust encerra o áudio e faz HTTPS.
6. O texto é salvo. O backend chama `Deliver`; a extensão verifica o remetente, copia e só injeta Ctrl+V se a janela original ainda estiver focada.
7. Aguarda a liberação dos modificadores físicos antes de colar. Mudança de foco ou bloqueio da sessão impede a injeção.

Esc descarta a captura. Sair do aplicativo encerra o processo de áudio. Se o aplicativo desaparecer, a extensão remove a captura de teclado. Há timeout de inicialização. Desativar a extensão cancela a gravação.

O indicador Tauri fica oculto quando a extensão está conectada, evitando ícones duplicados. Sem extensão, reaparece. No GNOME sem AppIndicators, o indicador da extensão é o caminho principal.

## Instalação e diagnóstico

```bash
npm run extension:install
gnome-extensions info typeper@typeper.local
gnome-shell --version
echo "$XDG_SESSION_TYPE"
pactl info
pactl --format=json list sources
journalctl --user -b | rg -i 'typeper|gnome-shell'
```

O instalador escreve apenas em `${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/typeper@typeper.local`. Ao atualizar uma extensão carregada, encerre a sessão Wayland e entre novamente para recarregar o JavaScript.

Para desativar: `gnome-extensions disable typeper@typeper.local`. Para remover, desative e use `gnome-extensions uninstall typeper@typeper.local`. Isso não apaga histórico ou chaves.

Conflito de atalho: escolha outra combinação nas configurações. Sem microfones: confira pulseaudio-utils e PulseAudio/pipewire-pulse. Chaveiro bloqueado: abra Senhas e Chaves (Seahorse) e desbloqueie a coleção de login. GNOME anterior a 45 usa outro sistema de módulos e não é suportado.

## Roteiro no desktop real — ainda necessário

| Cenário | Resultado esperado |
| --- | --- |
| Chrome/Firefox Wayland com textarea selecionado | Cápsula abre; texto colado no mesmo campo |
| Aplicativo XWayland | Clipboard e colagem pelo compositor |
| Toggle + Enter | Um envio; Enter não envia a mensagem no aplicativo de origem |
| Toggle + atalho novamente | Um envio; auto repeat não dispara novamente |
| Hold + soltar tecla/modificador da combinação | Finaliza uma vez |
| Hold + Esc antes de soltar | Nenhum HTTP e nenhum item no histórico |
| Só silêncio + confirmar | Nenhuma fala detectada, sem requisição |
| Fala, pausa longa, nova fala | Silêncio reduzido e bordas das palavras preservadas |
| Mudar janela enquanto API responde | Só clipboard; não cola na nova janela |
| Nenhum campo editável | Texto no Ctrl+V para depois |
| Dois monitores com escalas diferentes | Cápsula no monitor ativo |
| Erro de API | Áudio em memória para repetir ou descartar |
| Desconectar microfone | Captura para; trecho disponível para confirmar |
| Bloquear sessão/desativar extensão/encerrar app | Nenhuma captura de teclado residual |
| Reiniciar app | Histórico, preferências e chaves preservados |

Metadados permitem GNOME 45–50, mas não certificam cada versão. KDE, Sway e Hyprland precisam de outro adaptador de compositor e não estão implementados.
