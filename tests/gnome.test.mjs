// Contract tests for the extension's keyboard and clipboard behavior.
// GNOME APIs are mocked; these do NOT certify compositor integration.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const Clutter = {
  KEY_space: 32,
  KEY_d: 100,
  KEY_D: 68,
  KEY_F9: 1009,
  KEY_Escape: 27,
  KEY_Return: 13,
  KEY_KP_Enter: 1013,
  KEY_Control_L: 201,
  KEY_Control_R: 202,
  KEY_Super_L: 203,
  KEY_Super_R: 204,
  KEY_Alt_L: 205,
  KEY_Alt_R: 206,
  KEY_Shift_L: 207,
  KEY_Shift_R: 208,
  KEY_v: 118,
  ModifierType: { CONTROL_MASK: 4, MOD4_MASK: 64, MOD1_MASK: 8, SHIFT_MASK: 1 },
  KeyState: { PRESSED: 1, RELEASED: 0 },
  EVENT_STOP: true,
};
function setup(mode = "toggle") {
  const clipboard = [];
  const keyEvents = [];
  const calls = [];
  const later = [];
  const target = { name: "original" };
  const context = {
    Clutter,
    Extension: class {},
    Gio: { DBusProxy: { makeProxyWrapper: () => class {} } },
    GLib: { get_monotonic_time: () => 100 },
    St: {
      ClipboardType: { CLIPBOARD: 1 },
      Clipboard: {
        get_default: () => ({ set_text: (_, text) => clipboard.push(text) }),
      },
    },
    Main: { sessionMode: { isLocked: false } },
    global: { display: { focus_window: target }, get_pointer: () => [0, 0, 0] },
  };
  let source = readFileSync(
    new URL("../gnome-extension/extension.js", import.meta.url),
    "utf8",
  );
  source = source
    .replace(/^import .*;\n/gm, "")
    .replace("export default class TypeperExtension", "class TypeperExtension");
  vm.runInNewContext(
    source + "\nglobalThis.TestExtension=TypeperExtension;",
    context,
  );
  const instance = new context.TestExtension();
  instance._settings = { mode, shortcut: "<Control><Super>space" };
  instance._shortcutDown = true;
  instance._ending = null;
  instance._target = target;
  instance._call = (...args) => calls.push(args);
  instance._end = () => {};
  instance._virtualKeyboard = {
    notify_keyval: (...args) => keyEvents.push(args),
  };
  instance._later = (_ms, callback) => later.push(callback);
  function key(symbol, pressed, state = 68) {
    instance._key(
      { get_key_symbol: () => symbol, get_state: () => state },
      pressed,
    );
  }
  return { instance, key, calls, clipboard, keyEvents, later, context };
}
test("toggle ignores auto repeat and submits only on the second full press", () => {
  const { key, calls } = setup();
  key(32, true);
  key(32, true);
  key(32, false);
  assert.equal(calls.length, 0);
  key(32, true);
  key(32, false);
  assert.deepEqual(calls, [["Finish"]]);
});
test("Esc takes priority over hold release and never finishes the recording", () => {
  const { key, calls } = setup("hold");
  key(27, true);
  key(32, false);
  key(27, false);
  assert.deepEqual(calls, [["Cancel"]]);
});
test("hold submits on a chord release but not an unrelated modifier", () => {
  const { key, calls } = setup("hold");
  key(Clutter.KEY_Shift_L, false);
  assert.equal(calls.length, 0);
  key(Clutter.KEY_Control_L, false);
  assert.deepEqual(calls, [["Release"]]);
});
test("Enter is swallowed until its release", () => {
  const { key, calls } = setup();
  key(13, true);
  assert.equal(calls.length, 0);
  key(13, false);
  assert.deepEqual(calls, [["Finish"]]);
});
test("changing the focused window suppresses paste while preserving clipboard", () => {
  const { instance, context, clipboard, keyEvents, later } = setup();
  assert.equal(instance._deliver("Olá!", true), "paste_requested");
  context.global.display.focus_window = { name: "another" };
  later.shift()();
  assert.deepEqual(clipboard, ["Olá!"]);
  assert.equal(keyEvents.length, 0);
});
test("paste generates a balanced Ctrl+V and copy-only generates no keystrokes", () => {
  const { instance, clipboard, keyEvents, later } = setup();
  instance._deliver("Texto", true);
  later.shift()();
  assert.deepEqual(
    keyEvents.map((event) => event.slice(1)),
    [
      [201, 1],
      [118, 1],
      [118, 0],
      [201, 0],
    ],
  );
  instance._deliver("Outro texto", false);
  assert.deepEqual(clipboard, ["Texto", "Outro texto"]);
  assert.equal(keyEvents.length, 4);
});
test("a new recording prevents a previously scheduled paste from injecting into its keyboard grab", () => {
  const { instance, keyEvents, later } = setup();
  instance._deliver("Texto anterior", true);
  instance._grab = { active: true };
  later.shift()();
  assert.equal(keyEvents.length, 0);
});
