/**
 * Keyboard event to terminal byte encoding.
 *
 * Converts DOM KeyboardEvent instances into the byte sequences expected by
 * a VT100/xterm-compatible terminal. Handles special keys, control characters,
 * Alt/Option prefixing, and UTF-8 encoding of printable characters.
 */

const encoder = new TextEncoder();

/**
 * Map of special key names to their terminal escape sequences.
 */
const SPECIAL_KEYS: Record<string, Uint8Array> = {
  Enter: new Uint8Array([0x0d]),
  Backspace: new Uint8Array([0x7f]),
  Tab: new Uint8Array([0x09]),
  Escape: new Uint8Array([0x1b]),
  ArrowUp: new Uint8Array([0x1b, 0x5b, 0x41]),    // \x1b[A
  ArrowDown: new Uint8Array([0x1b, 0x5b, 0x42]),   // \x1b[B
  ArrowRight: new Uint8Array([0x1b, 0x5b, 0x43]),  // \x1b[C
  ArrowLeft: new Uint8Array([0x1b, 0x5b, 0x44]),   // \x1b[D
  Home: new Uint8Array([0x1b, 0x5b, 0x48]),         // \x1b[H
  End: new Uint8Array([0x1b, 0x5b, 0x46]),          // \x1b[F
  PageUp: new Uint8Array([0x1b, 0x5b, 0x35, 0x7e]),   // \x1b[5~
  PageDown: new Uint8Array([0x1b, 0x5b, 0x36, 0x7e]), // \x1b[6~
  Delete: new Uint8Array([0x1b, 0x5b, 0x33, 0x7e]),   // \x1b[3~
  Insert: new Uint8Array([0x1b, 0x5b, 0x32, 0x7e]),   // \x1b[2~
};

/**
 * Map of function keys to their terminal escape sequences.
 * F1-F4 use SS3 (ESC O), F5+ use CSI with numeric codes.
 */
const FUNCTION_KEYS: Record<string, Uint8Array> = {
  F1: encoder.encode("\x1bOP"),
  F2: encoder.encode("\x1bOQ"),
  F3: encoder.encode("\x1bOR"),
  F4: encoder.encode("\x1bOS"),
  F5: encoder.encode("\x1b[15~"),
  F6: encoder.encode("\x1b[17~"),
  F7: encoder.encode("\x1b[18~"),
  F8: encoder.encode("\x1b[19~"),
  F9: encoder.encode("\x1b[20~"),
  F10: encoder.encode("\x1b[21~"),
  F11: encoder.encode("\x1b[23~"),
  F12: encoder.encode("\x1b[24~"),
};

/**
 * Keys that should not produce any output when pressed alone.
 */
const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Symbol",
  "SymbolLock",
]);

/**
 * Convert a DOM KeyboardEvent to the byte sequence expected by the terminal.
 *
 * Returns `null` for events that should not produce terminal input (e.g.,
 * pressing Shift alone, or Meta+key shortcuts that should be handled by
 * the window manager).
 */
export function encodeKeyEvent(event: KeyboardEvent): Uint8Array | null {
  const { key, ctrlKey, altKey, metaKey } = event;

  // Ignore standalone modifier keys.
  if (MODIFIER_KEYS.has(key)) {
    return null;
  }

  // Let Meta (Cmd on macOS) combinations pass through to the OS,
  // except for Meta+C/V which we might want to handle later.
  if (metaKey) {
    return null;
  }

  // Handle Ctrl+key combinations.
  if (ctrlKey && key.length === 1) {
    const upper = key.toUpperCase();
    const code = upper.charCodeAt(0);

    // Ctrl+A through Ctrl+Z produce bytes 1-26.
    if (code >= 0x41 && code <= 0x5a) {
      const byte = code - 0x40; // A=1, B=2, ..., Z=26
      if (altKey) {
        // Alt+Ctrl+key: prefix with ESC.
        return new Uint8Array([0x1b, byte]);
      }
      return new Uint8Array([byte]);
    }

    // Ctrl+[ → ESC (27)
    if (key === "[") {
      return new Uint8Array([0x1b]);
    }
    // Ctrl+] → GS (29)
    if (key === "]") {
      return new Uint8Array([0x1d]);
    }
    // Ctrl+\ → FS (28)
    if (key === "\\") {
      return new Uint8Array([0x1c]);
    }
    // Ctrl+/ → US (31) — some terminals send this
    if (key === "/") {
      return new Uint8Array([0x1f]);
    }
    // Ctrl+Space → NUL (0)
    if (key === " ") {
      return new Uint8Array([0x00]);
    }
  }

  // Handle function keys.
  const fnKey = FUNCTION_KEYS[key];
  if (fnKey) {
    return fnKey;
  }

  // Handle special keys (Enter, Backspace, arrows, etc.).
  const special = SPECIAL_KEYS[key];
  if (special) {
    if (altKey) {
      // Alt + special key: prefix with ESC.
      const result = new Uint8Array(1 + special.length);
      result[0] = 0x1b;
      result.set(special, 1);
      return result;
    }
    return special;
  }

  // Handle printable characters.
  if (key.length === 1) {
    const encoded = encoder.encode(key);
    if (altKey) {
      // Alt+key: prefix with ESC.
      const result = new Uint8Array(1 + encoded.length);
      result[0] = 0x1b;
      result.set(encoded, 1);
      return result;
    }
    return encoded;
  }

  // Multi-codepoint key values (e.g., emoji input, dead keys).
  if (key.length > 1 && !key.startsWith("Dead") && !key.startsWith("Unidentified")) {
    return encoder.encode(key);
  }

  // Unknown or unhandled key — do not send anything.
  return null;
}
