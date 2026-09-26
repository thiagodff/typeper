export const number = (value: number) =>
  new Intl.NumberFormat("pt-BR").format(value);
export function duration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return rounded < 60
    ? `${rounded}s`
    : `${Math.floor(rounded / 60)}min ${String(rounded % 60).padStart(2, "0")}s`;
}
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const dateTime = (date: string) =>
  new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const fullDate = (date: string) =>
  new Date(date).toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  });
export const shortcutKeys = (value: string) =>
  value
    .replace("<Control>", "Ctrl+")
    .replace("<Super>", "Super+")
    .replace("<Alt>", "Alt+")
    .replace("<Shift>", "Shift+")
    .replace("space", "Espaço")
    .split("+");
export function silenceSaved(recorded: number, audio: number) {
  return recorded > 0
    ? Math.max(0, Math.round((1 - audio / recorded) * 100))
    : 0;
}
