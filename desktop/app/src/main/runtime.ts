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
 * - NANOMUSE_HOME — the data dir (~/.nanomuse): server_token, app-settings.json, logs
 * - NANOMUSE_PORT — the port (8787)
 * - NANOMUSE_BIN — the `nanomuse` executable; else the repo's .venv, else PATH
 * - NANOMUSE_CONFIG — a config.toml to pass with -c
 */
export class Runtime {
  readonly home: string;
  readonly port: number;
  readonly base: string;
  private child: ChildProcess | null = null;
  /** true when this shell started the runtime (and should stop it on quit) */
  owned = false;

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
    this.child = spawn(bin, args, {
      env: { ...process.env, NANOMUSE_HOME: this.home, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", log, log],
      detached: false,
    });
    this.owned = true;
    this.child.on("exit", (code) => {
      onLog(`nanomuse serve exited (${code})`);
      this.child = null;
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (await this.health()) return;
      if (!this.child) throw new Error(`nanomuse serve stopped before it was ready; see ${join(this.home, "desktop-app.log")}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("nanomuse serve did not answer on /api/health in time");
  }

  /** Stop the runtime we started (a runtime we attached to is left alone). */
  stop(): void {
    if (this.child && this.owned) {
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
