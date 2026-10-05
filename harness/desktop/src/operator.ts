// Portions derived from UI-TARS-desktop (https://github.com/bytedance/UI-TARS-desktop),
// © 2025 Bytedance, Inc. and its affiliates, Apache-2.0: `NutJSOperator` and
// `NutJSElectronOperator` (the screenshot through desktopCapturer at the display's size, the
// action switch with moveStraightTo + sleep(100) + click, the hotkey map, the clipboard paste
// for typing), `getScreenSize` (logical × scaleFactor, 1 on macOS) and the marker shapes of
// `setOfMarks` (the point, the action's name beside it).
import { clipboard, desktopCapturer, nativeImage, screen as electronScreen } from "electron";
import type * as Nut from "@computer-use/nut-js";

/**
 * The hands of nanoMuse Desktop: the mouse, the keyboard and the screenshot, done by this
 * process (Electron) rather than by the Python runtime it starts. Why here: the app bundle is
 * what macOS grants Accessibility and Screen Recording to, Electron knows the display's real
 * geometry, and UI-TARS-desktop has run this very operator on many desks already. The
 * runtime reaches it over loopback (operator-server.ts) and keeps the brain — the agent loop,
 * the Sentinel, the tools.
 *
 * Coordinates: everything in and out of here is in the *operator's screen pixels* — the space
 * libnut moves the pointer in. On Linux (X11) that is the root window's pixels, on Windows
 * physical pixels (the process is DPI-aware), on macOS points — which is why the scale factor
 * is taken as 1 there, as UI-TARS does. The screenshot is the primary display at exactly that
 * size (or scaled to the size the runtime asks for), so a pixel of the picture is a pixel the
 * pointer can be sent to; the runtime does the picture ↔ screen arithmetic.
 */

export interface ScreenSpace {
  /** The primary display's id (desktopCapturer's `display_id` is its string). */
  id: number;
  /** The operator's screen pixels: logical × scaleFactor (× 1 on macOS). */
  width: number;
  height: number;
  scaleFactor: number;
  logical: { width: number; height: number };
  /** The display's place in Electron's logical coordinates. */
  bounds: { x: number; y: number; width: number; height: number };
  /** The display's top-left in the operator's pixels (0,0 for the usual primary display). */
  originX: number;
  originY: number;
}

export interface OperatorInfo {
  available: boolean;
  reason: string;
  platform: NodeJS.Platform;
  display: { width: number; height: number; scaleFactor: number; logical: { width: number; height: number } };
}

export interface ScreenshotRequest {
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  quality?: number;
}

export interface Screenshot {
  base64: string;
  mime: "image/png" | "image/jpeg";
  /** The picture's size (the requested one, or the screen's). */
  width: number;
  height: number;
  /** The operator's screen pixels the picture stands for. */
  screen: { width: number; height: number };
  scaleFactor: number;
  display: { id: string; bounds: ScreenSpace["bounds"] };
}

export interface OperatorAction {
  action: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  dy?: number;
  text?: string;
  submit?: boolean;
  clear?: boolean;
  keys?: string[];
  seconds?: number;
}

/** What the overlay hears of each action: the point as fractions of the display, the words. */
export interface Marker {
  /** -1 when the action had no point (typing, a key). */
  fx: number;
  fy: number;
  /** For a drag: where it ended. */
  fx2?: number;
  fy2?: number;
  kind: string;
  text: string;
}

export interface OperatorOptions {
  /** Each executed action, for the glow's marker. */
  onAction?: (marker: Marker) => void;
  /** Around the capture: `before` hides what must not be in the picture, `after` shows it again. */
  onCapture?: (phase: "before" | "after") => void | Promise<void>;
  /** macOS: the permissions the hands need, as the app's own probes see them. */
  permissions?: () => { accessibility: boolean; screen: boolean };
  log?: (line: string) => void;
}

export class OperatorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OperatorError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export class Operator {
  private nut: typeof Nut | null = null;
  private loadError = "";
  private loaded = false;
  private lastMarker: { fx: number; fy: number } | null = null;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: OperatorOptions = {}) {}

  private log(line: string): void {
    this.options.log?.(`operator: ${line}`);
  }

  /** libnut is native: a build that cannot load it has no hands, not a crash. */
  private load(): typeof Nut | null {
    if (this.loaded) return this.nut;
    this.loaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.nut = require("@computer-use/nut-js") as typeof Nut;
      this.nut.mouse.config.mouseSpeed = 3600;
      this.nut.mouse.config.autoDelayMs = 50;
      this.nut.keyboard.config.autoDelayMs = 20;
    } catch (exc) {
      this.loadError = String((exc as Error).message ?? exc);
      this.log(`nut.js did not load: ${this.loadError}`);
      this.nut = null;
    }
    return this.nut;
  }

  /** The primary display in the operator's pixels (UI-TARS's getScreenSize). */
  screenSpace(): ScreenSpace {
    const display = electronScreen.getPrimaryDisplay();
    const logical = display.size;
    // macOS: libnut moves in points, which is what Electron calls logical pixels there
    const scaleFactor = process.platform === "darwin" ? 1 : display.scaleFactor || 1;
    return {
      id: display.id,
      width: Math.round(logical.width * scaleFactor),
      height: Math.round(logical.height * scaleFactor),
      scaleFactor,
      logical: { width: logical.width, height: logical.height },
      bounds: { ...display.bounds },
      originX: Math.round(display.bounds.x * scaleFactor),
      originY: Math.round(display.bounds.y * scaleFactor),
    };
  }

  availability(): { available: boolean; reason: string } {
    if (process.platform === "linux" && (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland") {
      return {
        available: false,
        reason: "Wayland session: no global screen or cursor for a program to drive. Log in with Xorg (the session chooser on the login screen), or run the hands on another computer of the account.",
      };
    }
    if (process.platform === "darwin" && this.options.permissions) {
      const p = this.options.permissions();
      const missing = [...(p.accessibility ? [] : ["Accessibility"]), ...(p.screen ? [] : ["Screen Recording"])];
      if (missing.length) {
        return {
          available: false,
          reason: `macOS: switch on nanoMuse Desktop under System Settings → Privacy & Security → ${missing.join(" and ")}${p.screen ? "" : ", then quit and reopen the app"}.`,
        };
      }
    }
    if (!this.load()) return { available: false, reason: `the operator's native module did not load: ${this.loadError}` };
    return { available: true, reason: "" };
  }

  info(): OperatorInfo {
    const space = this.screenSpace();
    return {
      ...this.availability(),
      platform: process.platform,
      display: { width: space.width, height: space.height, scaleFactor: space.scaleFactor, logical: space.logical },
    };
  }

  /** The primary display, scaled to the requested size (the picture the model sees). */
  async screenshot(req: ScreenshotRequest = {}): Promise<Screenshot> {
    const space = this.screenSpace();
    const want = isNum(req.width) && isNum(req.height) && req.width > 0 && req.height > 0 ? { width: Math.round(req.width), height: Math.round(req.height) } : { width: space.width, height: space.height };
    const format = req.format === "png" ? "png" : "jpeg";
    const quality = isNum(req.quality) ? Math.max(30, Math.min(100, Math.round(req.quality))) : 80;
    await this.options.onCapture?.("before");
    let image: Electron.NativeImage;
    try {
      image = await this.capture(space);
    } finally {
      await this.options.onCapture?.("after");
    }
    const size = image.getSize();
    if (size.width !== want.width || size.height !== want.height) image = image.resize({ width: want.width, height: want.height, quality: "best" });
    const buffer = format === "png" ? image.toPNG() : image.toJPEG(quality);
    return {
      base64: buffer.toString("base64"),
      mime: format === "png" ? "image/png" : "image/jpeg",
      width: want.width,
      height: want.height,
      screen: { width: space.width, height: space.height },
      scaleFactor: space.scaleFactor,
      display: { id: String(space.id), bounds: space.bounds },
    };
  }

  private async capture(space: ScreenSpace): Promise<Electron.NativeImage> {
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: space.width, height: space.height } });
      const primary = sources.find((s) => s.display_id === String(space.id)) ?? sources[0];
      if (primary && !primary.thumbnail.isEmpty()) return primary.thumbnail;
      this.log(`desktopCapturer: no picture of display ${space.id} (${sources.length} sources)`);
    } catch (exc) {
      this.log(`desktopCapturer failed: ${String(exc)}`);
    }
    // the fallback UI-TARS's nut operator uses: libnut's own grab, scaled to the screen space
    const nut = this.load();
    if (!nut) throw new OperatorError(`no screenshot: ${this.loadError}`, 500);
    const grabbed = await nut.screen.grab();
    if (grabbed.channels !== 4) throw new OperatorError(`no screenshot: libnut returned ${grabbed.channels}-channel pixels`, 500);
    const bitmap = nativeImage.createFromBitmap(Buffer.from(grabbed.data), { width: grabbed.width, height: grabbed.height });
    if (bitmap.isEmpty()) throw new OperatorError("no screenshot: the capture came back empty", 500);
    return bitmap;
  }

  /** One action, in the operator's pixels. Actions run one after another. */
  execute(action: OperatorAction): Promise<{ ok: true; note: string }> {
    const run = this.busy.then(() => this.run(action));
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async run(action: OperatorAction): Promise<{ ok: true; note: string }> {
    const nut = this.load();
    if (!nut) throw new OperatorError(`the hands are not available: ${this.loadError}`, 503);
    const { mouse, keyboard, Button, Key, Point, straightTo } = nut;
    const space = this.screenSpace();
    const kind = String(action.action ?? "");
    const point = (kx: "x" | "x2", ky: "y" | "y2"): { x: number; y: number } | null => {
      const x = action[kx];
      const y = action[ky];
      if (!isNum(x) || !isNum(y)) return null;
      // one pixel past the edge means the edge
      return {
        x: Math.round(Math.max(space.originX, Math.min(space.originX + space.width - 1, x))),
        y: Math.round(Math.max(space.originY, Math.min(space.originY + space.height - 1, y))),
      };
    };
    const start = point("x", "y");
    const end = point("x2", "y2");
    const moveStraightTo = async (p: { x: number; y: number } | null) => {
      if (!p) return;
      await mouse.move(straightTo(new Point(p.x, p.y)));
    };
    const needsPoint = () => {
      if (!start) throw new OperatorError(`${kind} needs x and y`);
      return start;
    };
    const fraction = (p: { x: number; y: number } | null) => (p ? { fx: Math.min(1, Math.max(0, (p.x - space.originX) / space.width)), fy: Math.min(1, Math.max(0, (p.y - space.originY) / space.height)) } : null);
    const mark = (text: string, p: { x: number; y: number } | null = start, p2: { x: number; y: number } | null = null) => {
      const f = fraction(p) ?? this.lastMarker ?? { fx: -1, fy: -1 };
      if (fraction(p)) this.lastMarker = f;
      const f2 = fraction(p2);
      this.options.onAction?.({ ...f, ...(f2 ? { fx2: f2.fx, fy2: f2.fy } : {}), kind, text });
    };
    this.log(`${kind}${start ? ` at ${start.x},${start.y}` : ""}${end ? ` → ${end.x},${end.y}` : ""}`);
    switch (kind) {
      case "move":
      case "hover":
        mark("move", needsPoint());
        await moveStraightTo(start);
        break;
      case "click":
      case "left_click": {
        mark("click", needsPoint());
        await moveStraightTo(start);
        await sleep(100);
        await mouse.click(Button.LEFT);
        break;
      }
      case "double_click":
      case "left_double": {
        mark("double click", needsPoint());
        await moveStraightTo(start);
        await sleep(100);
        await mouse.doubleClick(Button.LEFT);
        break;
      }
      case "right_click":
      case "right_single": {
        mark("right click", needsPoint());
        await moveStraightTo(start);
        await sleep(100);
        await mouse.click(Button.RIGHT);
        break;
      }
      case "middle_click": {
        mark("middle click", needsPoint());
        await moveStraightTo(start);
        await sleep(100);
        await mouse.click(Button.MIDDLE);
        break;
      }
      case "drag":
      case "left_click_drag": {
        needsPoint();
        if (!end) throw new OperatorError("drag needs x2 and y2");
        mark("drag", start, end);
        await moveStraightTo(start);
        await sleep(100);
        await mouse.drag(straightTo(new Point(end.x, end.y)));
        break;
      }
      case "scroll": {
        // `dy` in screen pixels, positive = down (the runtime's dialect). libnut's unit is a
        // wheel click on X11 and Windows (×120, one notch) and a pixel on macOS.
        const dy = isNum(action.dy) ? action.dy : 300;
        const clicks = Math.max(1, Math.min(30, Math.round(Math.abs(dy) / 40) || 1));
        const amount = process.platform === "darwin" ? Math.min(3000, Math.max(1, Math.round(Math.abs(dy)))) : process.platform === "win32" ? clicks * 120 : clicks;
        mark(dy >= 0 ? "scroll down" : "scroll up", start);
        if (start) await moveStraightTo(start);
        if (dy >= 0) await mouse.scrollDown(amount);
        else await mouse.scrollUp(amount);
        break;
      }
      case "type": {
        const raw = String(action.text ?? "");
        if (!raw) throw new OperatorError("type needs text");
        const submit = action.submit === true || /\\n$|\n$/.test(raw);
        const text = raw.replace(/\\n$/, "").replace(/\n$/, "");
        mark(`typing “${text.length > 40 ? `${text.slice(0, 40)}…` : text}”`, null);
        if (action.clear === true) {
          await keyboard.pressKey(this.commandKey(Key), Key.A);
          await keyboard.releaseKey(this.commandKey(Key), Key.A);
          await sleep(50);
        }
        if (text) await this.typeText(nut, text);
        if (submit) {
          await keyboard.pressKey(Key.Enter);
          await keyboard.releaseKey(Key.Enter);
        }
        break;
      }
      case "key":
      case "hotkey": {
        const names = Array.isArray(action.keys) ? action.keys.map((k) => String(k)) : [];
        if (!names.length) throw new OperatorError("key needs keys");
        const keys = this.hotkeys(Key, names);
        mark(`keys ${names.join(" + ")}`, null);
        await keyboard.pressKey(...keys);
        await keyboard.releaseKey(...keys);
        break;
      }
      case "wait": {
        const seconds = isNum(action.seconds) ? Math.max(0.2, Math.min(10, action.seconds)) : 1;
        mark(`waiting ${seconds} s`, null);
        await sleep(seconds * 1000);
        break;
      }
      default:
        throw new OperatorError(`unknown action '${kind}'`);
    }
    return { ok: true, note: "" };
  }

  private commandKey(Key: typeof Nut.Key): Nut.Key {
    return process.platform === "darwin" ? Key.LeftCmd : Key.LeftControl;
  }

  /**
   * Typing: key codes have no 中文, so anything beyond ASCII goes through the clipboard and a
   * paste (UI-TARS does this on Windows for all text; here on every platform for text that
   * needs it), with the person's clipboard put back afterwards.
   */
  private async typeText(nut: typeof Nut, text: string): Promise<void> {
    const { keyboard, Key } = nut;
    // eslint-disable-next-line no-control-regex
    const ascii = /^[\x20-\x7e\t]*$/.test(text);
    if (ascii && process.platform !== "win32") {
      keyboard.config.autoDelayMs = 0;
      try {
        await keyboard.type(text);
      } finally {
        keyboard.config.autoDelayMs = 20;
      }
      return;
    }
    const previous = await clipboard.readText().catch(() => "");
    await clipboard.writeText(text);
    await sleep(30);
    await keyboard.pressKey(this.commandKey(Key), Key.V);
    await sleep(50);
    await keyboard.releaseKey(this.commandKey(Key), Key.V);
    await sleep(120);
    await clipboard.writeText(previous).catch(() => undefined);
  }

  /** The runtime's key names (`ctrl`, `command`, `enter`, `a`, `f5`, `page_down` …) → libnut keys. */
  private hotkeys(Key: typeof Nut.Key, names: string[]): Nut.Key[] {
    const command = this.commandKey(Key);
    // UI-TARS's map: `ctrl` is ⌘ on a Mac, where the model's ctrl+c means copy
    const table: Record<string, Nut.Key> = {
      return: Key.Enter,
      enter: Key.Enter,
      ctrl: command,
      control: Key.LeftControl,
      shift: Key.LeftShift,
      alt: Key.LeftAlt,
      option: Key.LeftAlt,
      meta: command,
      win: command,
      super: command,
      command: command,
      cmd: command,
      esc: Key.Escape,
      escape: Key.Escape,
      del: Key.Delete,
      delete: Key.Delete,
      backspace: Key.Backspace,
      tab: Key.Tab,
      space: Key.Space,
      "page down": Key.PageDown,
      pagedown: Key.PageDown,
      page_down: Key.PageDown,
      "page up": Key.PageUp,
      pageup: Key.PageUp,
      page_up: Key.PageUp,
      arrowup: Key.Up,
      arrowdown: Key.Down,
      arrowleft: Key.Left,
      arrowright: Key.Right,
      capslock: Key.CapsLock,
      printscreen: Key.Print,
      ",": Key.Comma,
      ".": Key.Period,
      "/": Key.Slash,
      ";": Key.Semicolon,
      "'": Key.Quote,
      "-": Key.Minus,
      "=": Key.Equal,
      "[": Key.LeftBracket,
      "]": Key.RightBracket,
      "\\": Key.Backslash,
      "`": Key.Grave,
    };
    const lowercase = Object.fromEntries(Object.entries(Key).filter(([, v]) => typeof v === "number").map(([k, v]) => [k.toLowerCase(), v as Nut.Key])) as Record<string, Nut.Key>;
    return names.map((raw) => {
      const name = raw.trim().toLowerCase();
      const key = table[name] ?? (/^[0-9]$/.test(name) ? lowercase[`num${name}`] : undefined) ?? lowercase[name];
      if (key === undefined) throw new OperatorError(`unknown key '${raw}'`);
      return key;
    });
  }
}
