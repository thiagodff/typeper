export type Provider = "openai" | "gemini";
export type Page = "activity" | "history" | "settings";
export interface Settings {
  provider: Provider;
  openaiModel: string;
  geminiModel: string;
  microphone: string;
  language: string;
  mode: "toggle" | "hold";
  shortcut: string;
  theme: "light" | "dark" | "system";
  autoPaste: boolean;
  trimSilence: boolean;
  vadMode: number;
}
export interface CaptureState {
  phase: "idle" | "recording" | "ready" | "transcribing" | "error";
  paused: boolean;
  level: number;
  seconds: number;
  audioSeconds: number;
  message: string;
  canRetry: boolean;
}
export interface Transcript {
  id: string;
  createdAt: string;
  text: string;
  provider: Provider;
  model: string;
  language: string;
  audioSeconds: number;
  recordedSeconds: number;
  latencyMs: number;
  words: number;
}
export interface ProviderStats {
  provider: Provider;
  requests: number;
  successes: number;
  failures: number;
  audioSeconds: number;
  recordedSeconds: number;
  words: number;
  inputTokens: number;
  outputTokens: number;
  tokenReports: number;
  averageLatencyMs: number;
}
export interface Snapshot {
  settings: Settings;
  capture: CaptureState;
  extensionConnected: boolean;
}
export interface Microphone {
  id: string;
  name: string;
}
export type KeyStatus = Record<
  Provider,
  { saved: boolean; error: string | null }
>;
export const defaults: Settings = {
  provider: "openai",
  openaiModel: "gpt-transcribe",
  geminiModel: "gemini-3.5-transcribe",
  microphone: "default",
  language: "auto",
  mode: "toggle",
  shortcut: "<Control><Super>space",
  theme: "system",
  autoPaste: true,
  trimSilence: true,
  vadMode: 1,
};
export const idle: CaptureState = {
  phase: "idle",
  paused: false,
  level: 0,
  seconds: 0,
  audioSeconds: 0,
  message: "",
  canRetry: false,
};
