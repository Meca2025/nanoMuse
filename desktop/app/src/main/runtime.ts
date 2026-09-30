import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The runtime behind the window: `nanomuse serve` on this machine. The shell attaches
 * to one that is already running (the tray app, a terminal, the binary's `serve`) and
 * starts one of its own otherwise, stopping it again when the window quits.
 *
 * Where things are, in order of preference:
 * - NANOMUSE_HOME — the data dir (~/.nanomuse): server_token, app-settings.json, logs, and the
 *   workspace under it (the runtime is started there, with NANOMUSE_DATA_DIR / NANOMUSE_WORKSPACE set)
 * - NANOMUSE_PORT — the port (8787)
 * - NANOMUSE_BIN — the `nanomuse` executable; else the runtime the packaged app carries
 *   (resources/runtime/), else the repo's .venv, else PATH
 * - NANOMUSE_CONFIG — a config.toml to pass with -c
 */
export class Runtime {
  readonly home: string;
  readonly port: number;
  readonly base: string;
  private child: ChildProcess | null = null;
  /** true when this shell started the runtime (and should stop it on quit) */
  owned = false;
  /** called when a runtime this shell started stops on its own (not through stop()) */
  onCrash: ((code: number | null) => void) | null = null;
  private stopping = false;

  constructor() {
    this.home = process.env.NANOMUSE_HOME || join(homedir(), ".nanomuse");
    this.port = Number(process.env.NANOMUSE_PORT || 8787);
    this.base = `http://127.0.0.1:${this.port}`;
  }

  /** The access token the runtime generated (empty with --no-auth). */
  get token(): string {
    try {
      return readFileSync(join(this.home, "server_token"), "utf8").trim();
    } catch {
      return "";
    }
  }

  async health(): Promise<{ ok: boolean; auth?: boolean; version?: string } | null> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(`${this.base}/api/health`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      return (await r.json()) as { ok: boolean; auth?: boolean; version?: string };
    } catch {
      return null;
    }
  }

  /** Attach to a running runtime or start one; resolves once /api/health answers. */
  async ensure(onLog: (line: string) => void): Promise<void> {
    if (await this.health()) {
      onLog(`attached to nanomuse serve at ${this.base}`);
      return;
    }
    const bin = this.findBinary();
    if (!bin) {
      throw new Error(
        "nanomuse is not installed here. Set NANOMUSE_BIN to the executable, or run `nanomuse serve` yourself and open the window again.",
      );
    }
    const args = ["serve", "--no-qr", "--port", String(this.port)];
    if (process.env.NANOMUSE_CONFIG) args.push("-c", process.env.NANOMUSE_CONFIG);
    mkdirSync(this.home, { recursive: true });
    const log = openSync(join(this.home, "desktop-app.log"), "a");
    onLog(`starting ${bin} ${args.join(" ")}`);
    // The runtime is told where to keep everything: the data folder and the workspace under
    // NANOMUSE_HOME. Left to its defaults it would put the workspace under the current directory,
    // which for an app started from Finder is / and from a Windows shortcut may be Program Files
    // or System32 — neither writable, and the runtime would stop before it was ready.
    // PYTHONUTF8 keeps the log readable on a Chinese or Japanese Windows (the console code page
    // would otherwise garble the runtime's error messages).
    this.child = spawn(bin, args, {
      cwd: this.home,
      env: {
        ...process.env,
        NANOMUSE_HOME: this.home,
        NANOMUSE_DATA_DIR: this.home,
        NANOMUSE_WORKSPACE: join(this.home, "workspace"),
        PYTHONUNBUFFERED: "1",
        PYTHONUTF8: "1",
      },
      stdio: ["ignore", log, log],
      detached: false,
    });
    this.owned = true;
    this.stopping = false;
    let ready = false;
    this.child.on("exit", (code) => {
      onLog(`nanomuse serve exited (${code})`);
      this.child = null;
      if (ready && !this.stopping) this.onCrash?.(code);
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (await this.health()) {
        ready = true;
        return;
      }
      if (!this.child) throw new Error(this.explainExit());
      await new Promise((r) => setTimeout(r, 500));
    }
    const zh = (app.getLocale() || "").toLowerCase().startsWith("zh");
    throw new Error(this.explainExit(zh ? "nanomuse serve 没有及时在 /api/health 上应答。" : "nanomuse serve did not answer on /api/health in time."));
  }

  /** The last lines of the runtime's log, so a dialog can say why instead of "see the log". */
  logTail(lines = 12): string {
    try {
      const text = readFileSync(join(this.home, "desktop-app.log"), "utf8");
      return text.trimEnd().split("\n").slice(-lines).join("\n");
    } catch {
      return "";
    }
  }

  /** A stopped runtime, in words (the system's language): the usual causes are recognised in its log. */
  private explainExit(lead?: string): string {
    const zh = (app.getLocale() || "").toLowerCase().startsWith("zh");
    lead ??= zh ? "nanomuse serve 在就绪前就停止了。" : "nanomuse serve stopped before it was ready.";
    const tail = this.logTail(40);
    let hint = "";
    if (/address already in use|EADDRINUSE|Errno 98|Errno 10048/i.test(tail)) {
      hint = zh
        ? `端口 ${this.port} 被其他程序（或另一个 nanoMuse）占用。退出它，或设置 NANOMUSE_PORT。`
        : `Port ${this.port} is taken by another program (or another nanoMuse). Quit it, or set NANOMUSE_PORT.`;
    } else if (/permission denied|Errno 13|WinError 5|not writable|cannot write|cannot create/i.test(tail)) {
      hint = zh
        ? `数据文件夹 ${this.home} 不可写。修复它的权限，或设置 NANOMUSE_HOME。`
        : `The data folder ${this.home} is not writable. Fix its permissions or set NANOMUSE_HOME.`;
    } else if (/cannot open display|DISPLAY|xdotool/i.test(tail)) {
      hint = zh ? "没有可用的显示器，Hands 需要一个桌面会话。" : "No display is available for the hands; the runtime still needs a desktop session.";
    } else if (/config\.toml|TOMLDecodeError|does not understand/i.test(tail)) {
      hint = zh ? "config.toml 读不出来；日志里有字段和行号。" : "config.toml could not be read; the log has the field and the line.";
    } else if (/ModuleNotFoundError|ImportError|No module named/i.test(tail)) {
      hint = zh
        ? "运行时缺少一个 Python 包；重新安装 nanoMuse，或把 NANOMUSE_BIN 指向一个可用的运行时。"
        : "The runtime is missing a Python package; reinstall nanoMuse or point NANOMUSE_BIN at a working one.";
    }
    const where = `${zh ? "日志" : "Log"}: ${join(this.home, "desktop-app.log")}`;
    const last = tail.split("\n").slice(-3).join("\n");
    return [lead, hint, where, last ? `\n${last}` : ""].filter(Boolean).join("\n");
  }

  /** Stop the runtime we started (a runtime we attached to is left alone). */
  stop(): void {
    if (this.child && this.owned) {
      this.stopping = true;
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }

  /** Something small against the API, e.g. a Stop. */
  async post(path: string, body: unknown = {}): Promise<boolean> {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      const r = await fetch(`${this.base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** The web app, with the token the way the QR code hands it over. */
  appUrl(): string {
    const q = new URLSearchParams({ desktop: "1" });
    if (this.token) q.set("token", this.token);
    return `${this.base}/?${q.toString()}`;
  }

  private findBinary(): string | null {
    const candidates: string[] = [];
    if (process.env.NANOMUSE_BIN) candidates.push(process.env.NANOMUSE_BIN);
    // the packaged app carries its own runtime (scripts/desktop-app/build-runtime.py) next
    // to the app's resources; in development the same folder may sit under desktop/app
    const exe = process.platform === "win32" ? "nanomuse.exe" : "nanomuse";
    if (process.resourcesPath) candidates.push(join(process.resourcesPath, "runtime", exe));
    candidates.push(resolve(__dirname, "..", "..", "runtime", exe));
    // the repo checkout this app lives in: desktop/app → ../../.venv
    const repo = resolve(__dirname, "..", "..", "..", "..");
    candidates.push(
      process.platform === "win32" ? join(repo, ".venv", "Scripts", "nanomuse.exe") : join(repo, ".venv", "bin", "nanomuse"),
    );
    for (const c of candidates) if (existsSync(c)) return c;
    // PATH: let spawn resolve it, if `nanomuse --version` can be found
    return which("nanomuse");
  }
}

function which(name: string): string | null {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}
