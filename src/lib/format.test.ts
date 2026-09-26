import { describe, expect, it } from "vitest";
import { duration, silenceSaved, shortcutKeys } from "./format";
describe("Usage metrics", () => {
  it("handles empty usage and prevents negative savings", () => {
    expect(silenceSaved(0, 0)).toBe(0);
    expect(silenceSaved(10, 6)).toBe(40);
    expect(silenceSaved(10, 11)).toBe(0);
  });
  it("rounds before splitting duration at minute boundaries", () => {
    expect(duration(59.8)).toBe("1min 00s");
    expect(duration(0)).toBe("0s");
  });
  it("renders the actual GNOME accelerator", () =>
    expect(shortcutKeys("<Control><Super>space")).toEqual([
      "Ctrl",
      "Super",
      "Espaço",
    ]));
});
