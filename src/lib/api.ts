import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  defaults,
  idle,
  type Snapshot,
  type Transcript,
  type ProviderStats,
  type Settings,
} from "./types";

export const desktop = isTauri();
export const demo =
  !desktop && new URLSearchParams(location.search).has("demo");
const saved = localStorage.getItem("typeper-preview-settings");
let settings: Settings = { ...defaults };
try {
  if (saved && !desktop) settings = { ...defaults, ...JSON.parse(saved) };
} catch {
  /* ignore corrupt preview preferences */
}
let records: Transcript[] = demo
  ? [
      {
        id: "demo-1",
        createdAt: new Date().toISOString(),
        text: "A melhor forma de organizar uma ideia é começar. Vou separar a implementação em pequenas etapas e validar cada uma antes de seguir para a próxima.",
        provider: "openai",
        model: "gpt-transcribe",
        language: "pt-BR",
        audioSeconds: 18,
        recordedSeconds: 26,
        latencyMs: 1400,
        words: 28,
      },
      {
        id: "demo-2",
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        text: "Olá, pessoal! Terminei a revisão e deixei os comentários no projeto. Podemos conversar sobre os próximos passos amanhã de manhã.",
        provider: "gemini",
        model: "gemini-3.5-transcribe",
        language: "pt-BR",
        audioSeconds: 12,
        recordedSeconds: 21,
        latencyMs: 1800,
        words: 23,
      },
      {
        id: "demo-3",
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        text: "Lembrar de testar os atalhos e conferir se o microfone padrão acompanha a configuração do sistema.",
        provider: "openai",
        model: "gpt-transcribe",
        language: "pt-BR",
        audioSeconds: 9,
        recordedSeconds: 14,
        latencyMs: 1100,
        words: 17,
      },
    ]
  : [];
const demoUsage = [...records];
export async function call<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (desktop) return invoke<T>(command, args);
  let result: unknown;
  switch (command) {
    case "snapshot":
      result = {
        settings,
        capture: idle,
        extensionConnected: false,
      } satisfies Snapshot;
      break;
    case "key_status":
      result = {
        openai: { saved: false, error: null },
        gemini: { saved: false, error: null },
      };
      break;
    case "save_settings":
      settings = args.settings as Settings;
      localStorage.setItem(
        "typeper-preview-settings",
        JSON.stringify(settings),
      );
      break;
    case "list_microphones":
      result = [{ id: "default", name: "Padrão do sistema" }];
      break;
    case "history":
      result = records
        .filter(
          (r) =>
            r.text
              .toLocaleLowerCase()
              .includes(String(args.query ?? "").toLocaleLowerCase()) &&
            (!args.provider || r.provider === args.provider),
        )
        .slice(Number(args.offset ?? 0), Number(args.offset ?? 0) + 50);
      break;
    case "stats":
      result = ["openai", "gemini"].map((provider) => {
        const rows = demoUsage.filter((r) => r.provider === provider);
        return {
          provider,
          requests: rows.length,
          successes: rows.length,
          failures: 0,
          audioSeconds: rows.reduce((n, r) => n + r.audioSeconds, 0),
          recordedSeconds: rows.reduce((n, r) => n + r.recordedSeconds, 0),
          words: rows.reduce((n, r) => n + r.words, 0),
          inputTokens: 0,
          outputTokens: 0,
          tokenReports: 0,
          averageLatencyMs: rows.length
            ? rows.reduce((n, r) => n + r.latencyMs, 0) / rows.length
            : 0,
        } as ProviderStats;
      });
      break;
    case "copy_text":
      await navigator.clipboard.writeText(String(args.text));
      break;
    case "delete_transcript":
      records = records.filter((r) => r.id !== args.id);
      break;
    case "clear_history":
      records = [];
      break;
    default:
      throw new Error(
        "Disponível no aplicativo Linux. Esta é uma prévia da interface.",
      );
  }
  return result as T;
}
export async function on<T>(event: string, handler: (payload: T) => void) {
  return desktop
    ? listen<T>(event, (event) => handler(event.payload))
    : () => {};
}
