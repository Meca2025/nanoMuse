import { pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, powerSaveBlocker, screen, shell, systemPreferences, Tray } from "electron";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * nanoMuse Desktop — the nanoMuse desktop, built on DeepSeek Harness.
 *
 * The window shows the harness's own web app, served by a dsh Host this shell starts as a
 * child process: the Electron binary in Node mode (`ELECTRON_RUN_AS_NODE`, as the harness's
 * own desktop does), running the `dsh` that ships under `resources/dsh` with the nanoMuse
 * bundle (`harness/dsh-nanomuse`) installed next to it. The profile the Host boots lives
 * under `~/.nanomuse/desktop` and names the bundle; nothing is installed at first run and
 * no Node or pnpm is needed on the machine. When the runtime for the hands is bundled
 * (`resources/runtime`, the PyInstaller build the other desktop app carries too), the
 * preset's `nanomuse mcp` points at it, so the hands work out of the box.
 *
 * What the shell adds is small on purpose: a loading page with the face, the Host's URL
 * loaded once it is ready, external links in the browser, a menu with About and the
 * places to report a problem, and a clear dialog — with the log's tail on the clipboard —
 * when the Host does not come up. Everything else is the harness's and the bundle's
 * (docs/desktop.md, docs/harness.md).
 */

const PROFILE = "nanomuse";
// The composition: the harness's base and Web app, its Schedule (the goals' automations and
// the agent's reminders — an optional bundle of the harness, on by default here), then ours.
const BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-experimental-schedule-bundle", "dsh-nanomuse"];
const BUNDLE = "dsh-nanomuse";
const READY_TIMEOUT_MS = 120_000;
const RELEASES_PAGE = "https://github.com/nano-muse/nanoMuse/releases/latest";
const ISSUES_PAGE = "https://github.com/nano-muse/nanoMuse/issues";
const DOCS_PAGE = "https://github.com/nano-muse/nanoMuse/blob/main/docs/desktop.md";
const HARNESS_PAGE = "https://github.com/deepseek-ai/deepseek-harness";

const zh = (app.getLocale() || "").toLowerCase().startsWith("zh");
const T = {
  starting: zh ? "正在启动…" : "Starting…",
  notReady: zh ? "nanoMuse 没能启动" : "nanoMuse could not start",
  stopped: zh ? "nanoMuse 的后台停止了" : "nanoMuse's host stopped",
  restart: zh ? "重新启动" : "Restart",
  quit: zh ? "退出" : "Quit",
  copyDetails: zh ? "复制详情" : "Copy details",
  copied: zh ? "已复制。到 GitHub 发一个 issue 时贴上即可。" : "Copied. Paste it into a GitHub issue.",
  openLogFolder: zh ? "打开日志文件夹" : "Open the log folder",
  reportHint: zh ? "「复制详情」会把这段话和日志末尾复制下来，发 issue 时贴上：" : "Copy details puts this and the end of the log on the clipboard for an issue at",
  about: zh ? "关于 nanoMuse" : "About nanoMuse",
  website: zh ? "nanoMuse 官网" : "nanoMuse website",
  docs: zh ? "这个桌面版的说明" : "About this desktop",
  issue: zh ? "报告问题" : "Report an issue",
  builtOn: zh ? "基于 DeepSeek Harness（MIT）" : "Built on DeepSeek Harness (MIT)",
  releases: zh ? "下载页（检查新版本）" : "Downloads (check for a newer version)",
  reload: zh ? "重新加载" : "Reload",
  devtools: zh ? "开发者工具" : "Developer tools",
  view: zh ? "视图" : "View",
  window: zh ? "窗口" : "Window",
  help: zh ? "帮助" : "Help",
  edit: zh ? "编辑" : "Edit",
  open: zh ? "打开 nanoMuse" : "Open nanoMuse",
  newChat: zh ? "新聊天" : "New chat",
  quickChat: zh ? "快速唤起" : "Quick chat",
};

/** dev flag: `--screenshot=/tmp/x.png` writes the window once the web app is up, then quits (a headless check) */
const screenshotFlag = process.argv.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);

const logs: string[] = [];
let hostStderr = "";
let child: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let hostUrl: string | null = null;
let quitting = false;
let restarts = 0;

/**
 * `~/.nanomuse/desktop`, the harness home of this app alone — the CLI's `~/.dsh` is left alone.
 * `NANOMUSE_DESKTOP_HOME` moves it (`NANOMUSE_HARNESS_HOME`, the 0.1.28–0.1.29 name, still
 * counts). A home the app kept as nanoMuse Harness under `~/.nanomuse/harness` is taken over
 * once, so the account and the chats of those two versions carry on.
 */
let resolvedHome: string | undefined;
function harnessHome(): string {
  if (resolvedHome) return resolvedHome;
  const fromEnv = process.env.NANOMUSE_DESKTOP_HOME || process.env.NANOMUSE_HARNESS_HOME;
  if (fromEnv) return (resolvedHome = fromEnv);
  const home = join(homedir(), ".nanomuse", "desktop");
  const previous = join(homedir(), ".nanomuse", "harness");
  if (!existsSync(home) && existsSync(join(previous, "profiles"))) {
    try {
      renameSync(previous, home);
    } catch {
      return (resolvedHome = previous);
    }
  }
  return (resolvedHome = home);
}

/** Where dsh/ and runtime/ are: next to app.asar when packaged, the project dir in development. */
function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(__dirname, "..");
}

/** The app's own files (icons, the loading page): inside app.asar when packaged. */
function ownResources(): string {
  return join(app.getAppPath(), "resources");
}

function log(line: string): void {
  const stamped = `${new Date().toISOString().slice(11, 19)} ${line}`;
  logs.push(stamped);
  if (logs.length > 200) logs.shift();
  console.log(`[nanomuse-desktop] ${line}`);
  try {
    mkdirSync(harnessHome(), { recursive: true });
    appendFileSync(join(harnessHome(), "desktop.log"), `${stamped}\n`);
  } catch {
    /* the line is still in memory for the dialog */
  }
}

type Shipped = { dsh?: string; bundle?: string; platform?: string; arch?: string };

/** What scripts/prepare-dsh.mjs wrote next to the staged dsh: the versions for About. */
function shipped(): Shipped {
  try {
    return JSON.parse(readFileSync(join(resourcesDir(), "dsh", "dsh.json"), "utf8")) as Shipped;
  } catch {
    return {};
  }
}

/** The bundled runtime's executable (`nanomuse mcp` serves the hands), when it was built in. */
function bundledRuntime(): string | undefined {
  const exe = join(resourcesDir(), "runtime", process.platform === "win32" ? "nanomuse.exe" : "nanomuse");
  return existsSync(exe) ? exe : undefined;
}

/**
 * The profile the Host boots: `~/.nanomuse/desktop/profiles/nanomuse`. Three small files the
 * harness reads (the manifest with the bundle list, the empty root, the person's own patch
 * layer, which dsh writes settings into) and one link: `node_modules/dsh-nanomuse` → the copy
 * under resources, which is how the Loader finds a bundle that is not among the harness's own
 * packages. The link is refreshed every start, so moving the app or updating it is enough.
 */
function ensureProfile(dshDir: string): string {
  const dir = join(harnessHome(), "profiles", PROFILE);
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  const manifestPath = join(dir, "package.json");
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    } catch (exc) {
      log(`profile manifest unreadable, rewriting: ${String(exc)}`);
    }
  }
  const deps = (manifest.dependencies as Record<string, string> | undefined) ?? {};
  const dsh = (manifest.dsh as { profile?: { bundles?: string[] } } | undefined) ?? {};
  const bundles = dsh.profile?.bundles ?? [];
  const same = bundles.length === BUNDLES.length && bundles.every((b, i) => b === BUNDLES[i]);
  if (!same || deps[BUNDLE] !== "*" || manifest.name !== `dsh-profile-${PROFILE}`) {
    const next = {
      ...manifest,
      name: `dsh-profile-${PROFILE}`,
      private: true,
      dependencies: { ...deps, [BUNDLE]: "*" },
      dsh: { ...dsh, profile: { ...dsh.profile, bundles: [...BUNDLES] } },
    };
    writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  if (!existsSync(join(dir, "cordis.yml"))) {
    writeFileSync(
      join(dir, "cordis.yml"),
      "# dsh profile root — an empty entry list. The tree is composed as patches:\n# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml.\n# Edit cordis.patch.yml, not this file.\n[]\n",
    );
  }
  if (!existsSync(join(dir, "cordis.patch.yml"))) {
    writeFileSync(
      join(dir, "cordis.patch.yml"),
      "# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries. nanoMuse Desktop and dsh\n# write settings here; you may edit it too.\n[]\n",
    );
  }
  const link = join(dir, "node_modules", BUNDLE);
  const target = join(dshDir, "node_modules", BUNDLE);
  let current: string | undefined;
  try {
    current = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "(not a link)";
  } catch {
    current = undefined;
  }
  if (current !== target) {
    rmSync(link, { recursive: true, force: true });
    // a junction on Windows: no privilege needed, and it points at a directory
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    log(`profile: ${BUNDLE} → ${target}`);
  }
  return dir;
}

/** Try to bind one loopback port (0 = any); the port bound, or 0 when it is taken. */
function tryPort(port: number): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", () => resolve(0));
    srv.listen(port, "127.0.0.1", () => {
      const address = srv.address();
      const bound = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(bound));
    });
  });
}

/** The port tried first on a fresh install (the connectors' loopback is 38417). */
const HOST_PORT_DEFAULT = 38421;

/**
 * The host's port, kept across launches. The window's origin is `127.0.0.1:<port>`, and
 * the origin is the browser's storage key — the preferences, the star asks' memory, the
 * live stage's place, the harness's own settings all live in that origin's localStorage —
 * so a port that changed on every launch meant an app that forgot everything on every
 * launch. The port used last time is tried first (it is written to `<home>/port`), then
 * the default, then any free one.
 */
async function hostPort(home: string): Promise<number> {
  const file = join(home, "port");
  let last = 0;
  try {
    last = Number.parseInt(readFileSync(file, "utf8").trim(), 10) || 0;
  } catch {
    last = 0;
  }
  const candidates = last > 0 ? [last, HOST_PORT_DEFAULT, 0] : [HOST_PORT_DEFAULT, 0];
  for (const candidate of candidates) {
    const port = await tryPort(candidate);
    if (port > 0) {
      try {
        writeFileSync(file, `${port}\n`);
      } catch (exc) {
        log(`port: could not remember ${port}: ${String(exc)}`);
      }
      return port;
    }
  }
  throw new Error("no free loopback port for the host");
}

/**
 * A GUI launch on macOS and Linux inherits the session's environment, not the shell's, so
 * the agent's bash and `nanomuse` on PATH would miss Homebrew and the like. Ask the login
 * shell once for its PATH, as the harness's own desktop does; anything else is left as is.
 */
function loginShellPath(): string | undefined {
  if (process.platform === "win32") return undefined;
  const sh = process.env.SHELL || "/bin/sh";
  try {
    const out = spawnSync(sh, ["-ilc", 'printf "%s" "$PATH"'], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, DISABLE_AUTO_UPDATE: "true", ZSH_TMUX_AUTOSTART: "false" },
    });
    const path = (out.stdout || "").trim();
    return out.status === 0 && path.includes("/") ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Start the Host and resolve with the web app's URL (its one-time token included). */
function startHost(): Promise<string> {
  const dshDir = join(resourcesDir(), "dsh");
  const bin = join(dshDir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (!existsSync(bin)) {
    return Promise.reject(new Error(`the harness is not bundled: ${bin} is missing (run scripts/prepare-dsh.mjs)`));
  }
  const home = harnessHome();
  mkdirSync(home, { recursive: true });
  ensureProfile(dshDir);
  return new Promise<string>((resolve, reject) => {
    hostPort(home)
      .then((port) => {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          DSH_HOME: home,
          // One secret per launch, shared by the bundle and the runtime's `nanomuse mcp`
          // server: a hands step the person must agree to is confirmed with a ticket only
          // the bundle can make (after the permission card), never by the model's own word.
          NANOMUSE_MCP_CONFIRM: randomBytes(24).toString("hex"),
        };
        const shellPath = loginShellPath();
        if (shellPath) env.PATH = shellPath;
        const runtime = bundledRuntime();
        if (!env.NANOMUSE_PY && runtime) env.NANOMUSE_PY = runtime;
        // Loud when the hands have nothing to run: a packaged build without its runtime, or
        // NANOMUSE_PY (from the login shell) pointing at a file that is not there. The
        // Computer-use page shows the same with the fix; this is for the log people send in.
        if (env.NANOMUSE_PY && !existsSync(env.NANOMUSE_PY)) {
          log(`runtime: NANOMUSE_PY=${env.NANOMUSE_PY} does not exist — the hands are off until it is fixed or unset`);
        } else if (!env.NANOMUSE_PY && app.isPackaged) {
          log(`runtime: no bundled runtime at ${join(resourcesDir(), "runtime")} and NANOMUSE_PY is not set — the hands are off (rebuild with the runtime, or install nanomuse and set NANOMUSE_PY)`);
        }
        const args = ["--expose-internals", bin, PROFILE, "--no-open", "--port", String(port)];
        log(`host: ${process.execPath} ${args.join(" ")} (DSH_HOME=${home}${env.NANOMUSE_PY ? `, NANOMUSE_PY=${env.NANOMUSE_PY}` : ""})`);
        const proc = spawn(process.execPath, args, { cwd: homedir(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        child = proc;
        hostStderr = "";
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`the host did not announce its address within ${READY_TIMEOUT_MS / 1000} s`));
        }, READY_TIMEOUT_MS);
        let out = "";
        proc.stdout?.setEncoding("utf8");
        proc.stdout?.on("data", (chunk: string) => {
          out = (out + chunk).slice(-16_384);
          const m = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(out);
          if (m && m[1] && !settled) {
            settled = true;
            clearTimeout(timer);
            resolve(m[1]);
          }
          for (const line of chunk.split("\n")) if (line.trim()) log(`dsh: ${line.replace(/token=\S+/, "token=…")}`);
        });
        proc.stderr?.setEncoding("utf8");
        proc.stderr?.on("data", (chunk: string) => {
          hostStderr = (hostStderr + chunk).slice(-65_536);
          for (const line of chunk.split("\n")) if (line.trim()) log(`dsh! ${line}`);
        });
        proc.on("error", (exc) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(exc);
        });
        proc.on("exit", (code, signal) => {
          log(`host exited: code=${code} signal=${signal}`);
          child = null;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`the host exited before it was ready (code ${code ?? signal})`));
          } else if (!quitting) {
            void hostStopped();
          }
        });
      })
      .catch(reject);
  });
}

function stopHost(): Promise<void> {
  const proc = child;
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    proc.once("exit", done);
    if (process.platform === "win32" && proc.pid) {
      // the Host's own children (shells, the runtime for the hands) go with it
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
      }, 3000).unref();
    }
    setTimeout(done, 5000).unref();
  });
}

function details(message: string): string {
  const s = shipped();
  return [
    message,
    "",
    `nanoMuse Desktop ${app.getVersion()} · dsh ${s.dsh ?? "?"} · ${BUNDLE} ${s.bundle ?? "?"}`,
    `Electron ${process.versions.electron} · ${process.platform} ${process.arch}`,
    `home: ${harnessHome()}`,
    "",
    "--- shell ---",
    logs.slice(-30).join("\n"),
    "",
    "--- host stderr ---",
    hostStderr.slice(-4000),
  ].join("\n");
}

async function reportStartupFailure(exc: unknown): Promise<void> {
  const message = String((exc as Error).message ?? exc);
  for (;;) {
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: T.notReady,
      message: T.notReady,
      detail: `${message}\n\n${T.reportHint} ${ISSUES_PAGE}`,
      buttons: [T.copyDetails, T.openLogFolder, T.quit],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 0) {
      clipboard.writeText(details(message));
      await dialog.showMessageBox({ type: "info", title: "nanoMuse", message: T.copied, buttons: ["OK"] });
      continue;
    }
    if (response === 1) {
      shell.showItemInFolder(join(harnessHome(), "desktop.log"));
      continue;
    }
    return;
  }
}

/** The Host died under a running window: offer a restart (once by itself, then by hand). */
async function hostStopped(): Promise<void> {
  if (quitting) return;
  if (restarts === 0) {
    restarts += 1;
    log("host stopped; starting it again");
    try {
      await boot();
      return;
    } catch (exc) {
      log(`restart failed: ${String(exc)}`);
    }
  }
  const { response } = await dialog.showMessageBox({
    type: "error",
    title: T.stopped,
    message: T.stopped,
    detail: hostStderr.slice(-1500),
    buttons: [T.restart, T.copyDetails, T.quit],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) {
    restarts = 0;
    try {
      await boot();
    } catch (exc) {
      await reportStartupFailure(exc);
      app.quit();
    }
  } else if (response === 1) {
    clipboard.writeText(details(T.stopped));
    void hostStopped();
  } else {
    app.quit();
  }
}

function iconPath(): string {
  return join(ownResources(), "app-icon.png");
}

/** The Muse window colours: near-black in the dark, paper in the light (the bundle's stylesheet agrees). */
const BASE_DARK = "#171717";
const BASE_LIGHT = "#f9f9f9";
/** The height of the Windows caption-button overlay; the page's top clearance matches it. */
const OVERLAY_HEIGHT = 40;

/** The Windows caption buttons: transparent over the page, symbols in the scheme's ink. */
function overlayColors(dark = nativeTheme.shouldUseDarkColors): Electron.TitleBarOverlay {
  return { color: dark ? BASE_DARK : BASE_LIGHT, symbolColor: dark ? "#e5e5e5" : "#262626", height: OVERLAY_HEIGHT };
}

type PermissionKind = "accessibility" | "screen" | "microphone";
type PermissionState = "granted" | "denied" | "not-determined" | "not-needed";

/** Where one permission the hands use stands; only macOS gates them. */
function permissionState(kind: PermissionKind): PermissionState {
  if (process.platform !== "darwin") return "not-needed";
  if (kind === "accessibility") return systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "denied";
  const status = systemPreferences.getMediaAccessStatus(kind);
  if (status === "granted") return "granted";
  if (status === "not-determined") return "not-determined";
  return "denied";
}

const PERMISSION_PANES: Record<PermissionKind | "files", string> = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  // Full Disk Access: the Files page points here when the agent cannot read a protected folder
  files: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
};

/** The only links that leave the app: http(s) with a host. */
const EXTERNAL_URL = /^https?:\/\/[^/]/;
let awakeBlocker: number | null = null;

function releaseAwake(): void {
  if (awakeBlocker !== null) {
    powerSaveBlocker.stop(awakeBlocker);
    awakeBlocker = null;
  }
}

// ---- app behaviour: the General page's switches ------------------------------------------

/** What Muse's General page calls App behavior: start with the system, live in the menu bar, the quick-chat key. */
interface Prefs {
  openAtLogin: boolean;
  menuBar: boolean;
  quickChat: boolean;
  /** The person's own quick-chat combination (an Electron accelerator); absent means the platform's default. */
  quickChatKey?: string;
}
const PREFS_DEFAULT: Prefs = { openAtLogin: false, menuBar: true, quickChat: true };
/** ⌥ Space on macOS as in Muse; Ctrl+Alt+Space where Alt+Space is the window menu. */
const QUICK_CHAT_DEFAULT = process.platform === "darwin" ? "Alt+Space" : "Ctrl+Alt+Space";
/** One or more modifiers and a key, in Electron's accelerator words; a function key may stand alone. */
const ACCELERATOR = /^((?:(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|Shift|Super|Meta)\+)*)(Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|F(?:[1-9]|1[0-9]|2[0-4])|[A-Z0-9]|[`\-=\[\]\\;',.\/])$/;
let prefs: Prefs = PREFS_DEFAULT;
let tray: Tray | null = null;
/** Whether the last registration failed because another app holds the combination. */
let quickChatTaken = false;

function validAccelerator(text: string): boolean {
  const m = ACCELERATOR.exec(text);
  return Boolean(m) && (Boolean(m?.[1]) || /^F\d+$/.test(m?.[2] ?? ""));
}

/** The combination in force: the person's, when it parses, else the platform's default. */
function quickChatKey(): string {
  return prefs.quickChatKey && validAccelerator(prefs.quickChatKey) ? prefs.quickChatKey : QUICK_CHAT_DEFAULT;
}

function prefsPath(): string {
  return join(harnessHome(), "desktop.json");
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(readFileSync(prefsPath(), "utf8")) as Partial<Prefs>;
    return { ...PREFS_DEFAULT, ...(typeof raw === "object" && raw ? raw : {}) };
  } catch {
    return PREFS_DEFAULT;
  }
}

function writePrefs(): void {
  try {
    mkdirSync(harnessHome(), { recursive: true });
    writeFileSync(prefsPath(), `${JSON.stringify(prefs, null, 2)}\n`);
  } catch (exc) {
    log(`prefs: could not save: ${String(exc)}`);
  }
}

/** Bring the window up (make one if it was closed) and focus it. */
function showWindow(): BrowserWindow | null {
  if (!mainWindow && hostUrl) {
    mainWindow = createWindow();
    void mainWindow.loadURL(hostUrl);
  }
  if (!mainWindow) return null;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

/** The quick-chat key: the window comes up with a fresh chat and the composer focused; pressed while it is in front, it steps aside. */
function quickChat(): void {
  if (mainWindow && mainWindow.isFocused() && mainWindow.isVisible()) {
    if (process.platform === "darwin") app.hide();
    else mainWindow.minimize();
    return;
  }
  const win = showWindow();
  win?.webContents.send("nanomuse:quick-chat");
}

function applyQuickChat(): void {
  globalShortcut.unregisterAll();
  quickChatTaken = false;
  if (!prefs.quickChat) return;
  const key = quickChatKey();
  let ok = false;
  try {
    ok = globalShortcut.register(key, quickChat);
  } catch (exc) {
    log(`quick chat: ${key}: ${String(exc)}`);
  }
  quickChatTaken = !ok;
  if (!ok) log(`quick chat: ${key} is taken by another app`);
}

function applyMenuBar(): void {
  if (!prefs.menuBar) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  let icon = nativeImage.createFromPath(iconPath());
  if (!icon.isEmpty()) icon = icon.resize({ width: process.platform === "darwin" ? 18 : 22, height: process.platform === "darwin" ? 18 : 22 });
  try {
    tray = new Tray(icon);
  } catch (exc) {
    log(`menu bar: ${String(exc)}`);
    return;
  }
  tray.setToolTip("nanoMuse");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: T.open, click: () => void showWindow() },
      { label: T.newChat, accelerator: prefs.quickChat ? quickChatKey() : undefined, click: () => showWindow()?.webContents.send("nanomuse:quick-chat") },
      { type: "separator" },
      { label: T.quit, click: () => app.quit() },
    ]),
  );
  if (process.platform !== "darwin") tray.on("click", () => void showWindow());
}

function applyOpenAtLogin(): void {
  if (process.platform === "linux") {
    // freedesktop autostart: a .desktop entry pointing at this executable (the AppImage or the installed binary)
    const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "autostart");
    const file = join(dir, "nanomuse-desktop.desktop");
    try {
      if (prefs.openAtLogin) {
        mkdirSync(dir, { recursive: true });
        const exe = process.env.APPIMAGE || process.execPath;
        writeFileSync(file, `[Desktop Entry]\nType=Application\nName=nanoMuse\nExec="${exe}"\nIcon=nanomuse-desktop\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`);
      } else rmSync(file, { force: true });
    } catch (exc) {
      log(`open at login: ${String(exc)}`);
    }
    return;
  }
  if (!app.isPackaged) return; // a dev checkout should not register itself
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, ...(process.platform === "darwin" ? { openAsHidden: true } : {}) });
}

function applyPrefs(): void {
  applyMenuBar();
  applyQuickChat();
  applyOpenAtLogin();
}

/** What the General page shows: the values, the key in force and the default, whether another app holds it, and which of the three this platform can do. */
function prefsView(): Prefs & { quickChatKey: string; quickChatDefault: string; quickChatTaken: boolean; supports: { openAtLogin: boolean; menuBar: boolean; quickChat: boolean } } {
  return { ...prefs, quickChatKey: quickChatKey(), quickChatDefault: QUICK_CHAT_DEFAULT, quickChatTaken, supports: { openAtLogin: process.platform !== "linux" || Boolean(process.env.APPIMAGE) || app.isPackaged, menuBar: true, quickChat: true } };
}

/**
 * Report a bug the way Muse does: a screenshot of the window goes to Downloads, the
 * issue page opens with the build's facts filled in; the person drags the picture in.
 */
async function reportBug(): Promise<{ screenshot: string; url: string }> {
  const s = shipped();
  const facts = [
    `nanoMuse Desktop ${app.getVersion()} · ${process.platform} ${process.arch}`,
    `DeepSeek Harness ${s.dsh ?? "?"} · dsh-nanomuse ${s.bundle ?? "?"} · Electron ${process.versions.electron}`,
  ];
  let screenshot = "";
  if (mainWindow) {
    try {
      const image = await mainWindow.webContents.capturePage();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      screenshot = join(app.getPath("downloads"), `nanoMuse-${stamp}.png`);
      writeFileSync(screenshot, image.toPNG());
    } catch (exc) {
      log(`report: no screenshot: ${String(exc)}`);
      screenshot = "";
    }
  }
  const body = [
    "## What happened",
    "",
    "",
    "## What I expected",
    "",
    "",
    "## Where",
    "",
    ...facts,
    "",
    screenshot ? `(Drag the screenshot nanoMuse saved to Downloads — ${screenshot.split(/[\\/]/).pop()} — in here.)` : "",
  ].join("\n");
  const url = `${ISSUES_PAGE}/new?labels=desktop&body=${encodeURIComponent(body)}`;
  void shell.openExternal(url);
  return { screenshot, url };
}

/** The requests the preload bridge forwards from the web client (see preload.ts). */
function registerBridge(): void {
  ipcMain.handle("nanomuse:info", () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch }));
  ipcMain.handle("nanomuse:permissions", () => ({
    accessibility: permissionState("accessibility"),
    screen: permissionState("screen"),
    microphone: permissionState("microphone"),
  }));
  ipcMain.handle("nanomuse:permissions:request", async (_e, kind: PermissionKind) => {
    if (process.platform !== "darwin") return "not-needed" satisfies PermissionState;
    if (!(kind in PERMISSION_PANES)) return "denied" satisfies PermissionState;
    if (kind === "accessibility") {
      // the system's own dialog, which also lists the app in the Accessibility pane
      if (!systemPreferences.isTrustedAccessibilityClient(true)) void shell.openExternal(PERMISSION_PANES.accessibility);
    } else if (kind === "microphone") {
      await systemPreferences.askForMediaAccess("microphone").catch(() => false);
    } else {
      // Screen Recording has no prompt API. A first capture attempt is what puts the app on
      // the pane's list (and shows the system's own notice); without it the user finds
      // nothing to switch on. Then the pane, where the switch is.
      try {
        await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
      } catch {
        /* no sources without the permission — that attempt was the point */
      }
      void shell.openExternal(PERMISSION_PANES.screen);
      watchScreenGrant();
    }
    return permissionState(kind);
  });
  // macOS applies Screen Recording only to freshly started processes: after granting it, the
  // runtime that takes the screenshots has to start again.
  ipcMain.handle("nanomuse:relaunch", () => {
    relaunchNow();
  });
  ipcMain.handle("nanomuse:permissions:settings", (_e, kind: PermissionKind | "files") => {
    if (process.platform === "darwin" && typeof kind === "string" && kind in PERMISSION_PANES) void shell.openExternal(PERMISSION_PANES[kind]);
  });
  ipcMain.handle("nanomuse:open-external", (_e, url: string) => {
    if (typeof url === "string" && EXTERNAL_URL.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle("nanomuse:keep-awake", (_e, on: boolean) => {
    if (on === true && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start("prevent-display-sleep");
    else if (on !== true) releaseAwake();
  });
  ipcMain.handle("nanomuse:theme", (_e, theme: string) => {
    mainWindow?.setBackgroundColor(theme === "dark" ? BASE_DARK : BASE_LIGHT);
    // the Windows caption buttons follow the page's colour scheme
    if (process.platform === "win32") mainWindow?.setTitleBarOverlay?.(overlayColors(theme === "dark"));
  });
  ipcMain.handle("nanomuse:prefs", () => prefsView());
  ipcMain.handle("nanomuse:prefs:set", (_e, patch: Partial<Prefs>) => {
    if (patch && typeof patch === "object") {
      for (const key of ["openAtLogin", "menuBar", "quickChat"] as const) if (typeof patch[key] === "boolean") prefs = { ...prefs, [key]: patch[key] };
      if (typeof patch.quickChatKey === "string") {
        // the person's combination; an empty string or the default puts the default back
        const key = patch.quickChatKey.trim();
        const { quickChatKey: _drop, ...rest } = prefs;
        prefs = !key || key === QUICK_CHAT_DEFAULT ? rest : validAccelerator(key) ? { ...rest, quickChatKey: key } : prefs;
      }
      writePrefs();
      applyPrefs();
    }
    return prefsView();
  });
  ipcMain.handle("nanomuse:report-bug", () => reportBug());
  ipcMain.handle("nanomuse:permissions:guide", () => guidePermissions());
  ipcMain.handle("nanomuse:content-protection", (e, on: boolean) => {
    // The main window too, while the hands work: the agent should not read its own chat off the screen.
    if (e.sender === mainWindow?.webContents) mainWindow?.setContentProtection(on === true);
  });
  ipcMain.handle("nanomuse:reveal", (_e, path: string) => {
    if (typeof path === "string" && path && existsSync(path)) shell.showItemInFolder(path);
  });
}

// ---- the overlays while the hands work (0.1.34) ---------------------------------------------
//
// Two windows the web client drives over IPC, both with content protection on so neither is
// ever in a screenshot the hands take (UI-TARS does the same with its ScreenMarker):
//   • the glow — transparent, click-through, always on top, over the whole display: an
//     animated border says "the agent has the hands", the agent's face follows the pointer;
//   • the capsule — a small always-on-top card with the question the agent asked before a
//     step (Allow once / Deny) or the hold ("Your turn — Done"), shown when the main window
//     is not the one in front, so the person can answer from wherever they are.

interface OverlayCard {
  id: string;
  kind: "approval" | "hold";
  title: string;
  text: string;
  actions: { id: string; label: string; tone?: "on" | "no" }[];
}

interface OverlayState {
  hands: { active: boolean; held: boolean; x: number; y: number; kind: string; text: string; face: string } | null;
  cards: OverlayCard[];
}

let glowWindow: BrowserWindow | null = null;
let capsuleWindow: BrowserWindow | null = null;
let overlayState: OverlayState = { hands: null, cards: [] };
let glowHideTimer: NodeJS.Timeout | null = null;

const OVERLAY_PREFS = { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: join(__dirname, "overlay-preload.js") };

function overlayWindow(kind: "glow" | "capsule"): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const glow = kind === "glow";
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: !glow,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    ...(glow ? { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height } : { width: 360, height: 120, x: display.workArea.x + display.workArea.width - 376, y: display.workArea.y + 16 }),
    webPreferences: OVERLAY_PREFS,
  });
  // Never in a screenshot: the hands must not see our own marks on the screen.
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (glow) win.setIgnoreMouseEvents(true, { forward: true });
  win.on("page-title-updated", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void win.loadFile(join(ownResources(), `${kind}.html`));
  return win;
}

function sendOverlay(win: BrowserWindow | null, state: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send("nanomuse:overlay:state", state);
}

function applyOverlay(): void {
  const hands = overlayState.hands;
  // the glow: up while the hands are active (or held), down a moment after they stop
  if (hands && (hands.active || hands.held)) {
    if (glowHideTimer) { clearTimeout(glowHideTimer); glowHideTimer = null; }
    if (!glowWindow || glowWindow.isDestroyed()) glowWindow = overlayWindow("glow");
    const display = screen.getPrimaryDisplay();
    glowWindow.setBounds(display.bounds);
    if (!glowWindow.isVisible()) glowWindow.showInactive();
    sendOverlay(glowWindow, { ...hands, active: true });
  } else if (glowWindow && !glowWindow.isDestroyed() && glowWindow.isVisible()) {
    sendOverlay(glowWindow, { active: false });
    if (!glowHideTimer) glowHideTimer = setTimeout(() => { glowHideTimer = null; glowWindow?.hide(); }, 400);
  }
  // the capsule: the cards, but only when the main window is not in front (the page shows them itself then)
  const mainInFront = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && mainWindow.isVisible());
  const cards = mainInFront ? [] : overlayState.cards;
  if (cards.length) {
    if (!capsuleWindow || capsuleWindow.isDestroyed()) capsuleWindow = overlayWindow("capsule");
    capsuleWindow.setFocusable(true);
    if (!capsuleWindow.isVisible()) capsuleWindow.showInactive();
    sendOverlay(capsuleWindow, { cards });
  } else if (capsuleWindow && !capsuleWindow.isDestroyed() && capsuleWindow.isVisible()) {
    sendOverlay(capsuleWindow, { cards: [] });
    capsuleWindow.hide();
  }
}

function registerOverlays(): void {
  ipcMain.on("nanomuse:overlay", (e, state: OverlayState) => {
    if (e.sender !== mainWindow?.webContents || !state || typeof state !== "object") return;
    const hands = state.hands && typeof state.hands === "object" ? state.hands : null;
    overlayState = {
      hands: hands
        ? {
            active: hands.active === true,
            held: hands.held === true,
            x: typeof hands.x === "number" ? hands.x : -1,
            y: typeof hands.y === "number" ? hands.y : -1,
            kind: String(hands.kind ?? "").slice(0, 32),
            text: String(hands.text ?? "").slice(0, 120),
            face: typeof hands.face === "string" && /^(data:image\/[a-z+]+;base64,|https?:\/\/127\.0\.0\.1|https?:\/\/localhost)/.test(hands.face) ? hands.face.slice(0, 400_000) : "",
          }
        : null,
      cards: Array.isArray(state.cards)
        ? state.cards.slice(0, 3).map((c) => ({
            id: String(c.id ?? "").slice(0, 80),
            kind: c.kind === "hold" ? "hold" : "approval",
            title: String(c.title ?? "").slice(0, 60),
            text: String(c.text ?? "").slice(0, 400),
            actions: (Array.isArray(c.actions) ? c.actions : []).slice(0, 4).map((a) => ({ id: String(a.id ?? "").slice(0, 32), label: String(a.label ?? "").slice(0, 40), ...(a.tone === "on" || a.tone === "no" ? { tone: a.tone } : {}) })),
          }))
        : [],
    };
    applyOverlay();
  });
  ipcMain.on("nanomuse:overlay:ready", (e) => {
    if (e.sender === glowWindow?.webContents) sendOverlay(glowWindow, overlayState.hands ? { ...overlayState.hands } : { active: false });
    if (e.sender === capsuleWindow?.webContents) sendOverlay(capsuleWindow, { cards: overlayState.cards });
  });
  ipcMain.on("nanomuse:overlay:act", (e, payload: { card?: string; action?: string }) => {
    if (e.sender !== capsuleWindow?.webContents || !payload) return;
    mainWindow?.webContents.send("nanomuse:overlay:action", { card: String(payload.card ?? ""), action: String(payload.action ?? "") });
  });
  ipcMain.on("nanomuse:overlay:resize", (e, height: number) => {
    if (e.sender !== capsuleWindow?.webContents || typeof height !== "number") return;
    const h = Math.max(60, Math.min(480, Math.round(height)));
    const b = capsuleWindow.getBounds();
    if (b.height !== h) capsuleWindow.setBounds({ ...b, height: h });
  });
  app.on("browser-window-focus", applyOverlay);
  app.on("browser-window-blur", applyOverlay);
}

/**
 * The first time the hands are about to be used on macOS: the two system permissions, asked
 * for in order with a word on why (Codex does the same), the panel live-updating as they are
 * granted. Returns what is granted now; the page decides whether to go on.
 */
async function guidePermissions(): Promise<Record<PermissionKind, PermissionState>> {
  const state = () => ({ accessibility: permissionState("accessibility"), screen: permissionState("screen"), microphone: permissionState("microphone") });
  if (process.platform !== "darwin") return state();
  if (permissionState("accessibility") !== "granted") {
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: zh ? "nanoMuse 需要「辅助功能」权限" : "nanoMuse needs Accessibility",
      detail: zh
        ? "动手操作电脑要靠它移动鼠标和输入。系统会弹出请求；在「系统设置 → 隐私与安全性 → 辅助功能」里打开 nanoMuse Desktop 即可——它附带的运行时作为应用的一部分运行，不会单独出现在列表里。"
        : "The hands move the mouse and type through it. The system asks next; in System Settings → Privacy & Security → Accessibility, switch on nanoMuse Desktop. The runtime it bundles runs as part of the app and does not appear separately.",
      buttons: [zh ? "继续" : "Continue", zh ? "以后再说" : "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0 && !systemPreferences.isTrustedAccessibilityClient(true)) void shell.openExternal(PERMISSION_PANES.accessibility);
  }
  if (permissionState("screen") !== "granted") {
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: zh ? "nanoMuse 需要「屏幕录制」权限" : "nanoMuse needs Screen Recording",
      detail: zh
        ? "它靠截图看到屏幕上有什么。系统没有弹窗；点「继续」后在「屏幕录制」面板里打开 nanoMuse Desktop（只需要这一项），然后重新启动应用——macOS 的这项权限只对重新启动后的应用生效。"
        : "It sees the screen through screenshots. There is no system prompt: after Continue, switch on nanoMuse Desktop in the Screen Recording pane (that one entry is all), then relaunch the app — macOS applies this permission to freshly started apps only.",
      buttons: [zh ? "继续" : "Continue", zh ? "以后再说" : "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      try {
        await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
      } catch {
        /* the attempt is what lists the app in the pane */
      }
      void shell.openExternal(PERMISSION_PANES.screen);
      watchScreenGrant();
    }
  }
  return state();
}

/** Quit and start again; the host and its `nanomuse mcp` go with the process tree, the new app starts them afresh. */
function relaunchNow(): void {
  app.relaunch();
  app.exit(0);
}

let screenGrantWatch: NodeJS.Timeout | null = null;

/**
 * After the Screen Recording pane was opened for the person: watch for the switch to flip
 * (the system has no event for it) and, when it does, say the one thing the pane does not —
 * that the grant reaches only freshly started apps — with the restart button right there.
 * Gives up quietly after five minutes; the Computer-use page keeps its own notice.
 */
function watchScreenGrant(): void {
  if (process.platform !== "darwin" || screenGrantWatch) return;
  if (permissionState("screen") === "granted") return;
  const started = Date.now();
  screenGrantWatch = setInterval(() => {
    if (permissionState("screen") !== "granted") {
      if (Date.now() - started > 5 * 60_000 && screenGrantWatch) {
        clearInterval(screenGrantWatch);
        screenGrantWatch = null;
      }
      return;
    }
    if (screenGrantWatch) clearInterval(screenGrantWatch);
    screenGrantWatch = null;
    log("permissions: Screen Recording granted while running — offering a relaunch");
    void dialog
      .showMessageBox({
        type: "info",
        message: zh ? "屏幕录制已允许，重新启动后生效" : "Screen Recording is on; it takes effect after a restart",
        detail: zh
          ? "macOS 只对重新启动后的应用应用这项权限。现在重新启动 nanoMuse，手就能看到屏幕；否则截图仍是一片黑。"
          : "macOS applies this permission to freshly started apps only. Restart nanoMuse now and the hands see the screen; until then screenshots come back black.",
        buttons: [zh ? "立即重启" : "Restart now", zh ? "稍后" : "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) relaunchNow();
      })
      .catch(() => undefined);
  }, 1500);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    title: "nanoMuse",
    icon: process.platform === "darwin" ? undefined : nativeImage.createFromPath(iconPath()),
    backgroundColor: nativeTheme.shouldUseDarkColors ? BASE_DARK : BASE_LIGHT,
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    // macOS: no title bar, the traffic lights sit over the rail (Muse's window); the
    // web app marks its drag regions once the preload tells it the platform.
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
    // Windows: the same window, with the system's own caption buttons drawn over the top
    // right corner (the overlay); the page leaves them room. Linux keeps its system bar —
    // every desktop draws it differently and the overlay is not available there.
    ...(process.platform === "win32" ? { titleBarStyle: "hidden" as const, titleBarOverlay: overlayColors() } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: join(__dirname, "preload.js") },
  });
  win.once("ready-to-show", () => win.show());
  win.on("enter-full-screen", () => win.webContents.send("nanomuse:fullscreen", true));
  win.on("leave-full-screen", () => win.webContents.send("nanomuse:fullscreen", false));
  // the harness names its document after itself; the window keeps ours
  win.on("page-title-updated", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_URL.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (hostUrl && url.startsWith(new URL(hostUrl).origin)) return;
    // our own pages (the loading page) and nothing else from disk
    if (url.startsWith("file:") && url.startsWith(pathToFileURL(ownResources()).href)) return;
    e.preventDefault();
    if (EXTERNAL_URL.test(url)) void shell.openExternal(url);
  });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    // the microphone for voice input; nothing else is asked for
    callback(permission === "media");
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  const face = splashFace();
  void win.loadFile(join(ownResources(), "loading.html"), { query: { lang: zh ? "zh" : "en", ...(face ? { face } : {}) } });
  return win;
}

/** The splash may show a face only when it is the person's own (C6): a drawn one, as a data URL. */
const SPLASH_FACE_MAX = 600 * 1024;
function splashFace(): string | undefined {
  const store = join(harnessHome(), "nanomuse");
  const candidates: string[] = [];
  try {
    const profile = JSON.parse(readFileSync(join(store, "profile.json"), "utf8")) as { avatar?: string; faceId?: string };
    if (profile.avatar === "face" && profile.faceId && /^[\w.-]+$/.test(profile.faceId)) {
      for (const ext of ["webp", "png", "jpg"]) candidates.push(join(store, "faces", profile.faceId, `idle.${ext}`));
    }
  } catch {
    /* no profile yet, or not a face: nothing in the disc */
  }
  for (const ext of ["webp", "png", "jpg"]) candidates.push(join(store, "avatar", `base.${ext}`));
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path);
      if (bytes.length === 0 || bytes.length > SPLASH_FACE_MAX) continue;
      const ext = path.slice(path.lastIndexOf(".") + 1);
      return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`;
    } catch {
      /* unreadable: try the next */
    }
  }
  return undefined;
}

async function boot(): Promise<void> {
  if (!mainWindow) mainWindow = createWindow();
  try {
    hostUrl = await startHost();
  } catch (exc) {
    log(`start failed: ${String(exc)}`);
    await mainWindow?.webContents.executeJavaScript(`window.__failed && window.__failed(${JSON.stringify(String((exc as Error).message ?? exc))})`).catch(() => undefined);
    throw exc;
  }
  log(`ready: ${hostUrl.replace(/token=\S+/, "token=…")}`);
  await mainWindow?.loadURL(hostUrl);
  if (screenshotFlag && mainWindow) {
    // the web app loads its plugins after the document; give it a moment
    await new Promise((r) => setTimeout(r, 8000));
    // `--screenshot-click=<aria-label>[,<aria-label>…]`: press buttons first (a rail room, a row…)
    const clicks = process.argv.find((a) => a.startsWith("--screenshot-click="))?.slice("--screenshot-click=".length);
    for (const label of clicks ? clicks.split(",") : []) {
      await mainWindow.webContents
        .executeJavaScript(`(() => { const b = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); if (b) b.click(); return !!b })()`)
        .then((hit) => log(`screenshot: click ${label} → ${hit ? "ok" : "not found"}`))
        .catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2500));
    }
    // `--screenshot-js=<file>`: run a script in the page (dev: drive the composer, open a sheet…);
    // `--screenshot-delay=<ms>`: wait that long before capturing (the agent's turn, an animation)
    const script = process.argv.find((a) => a.startsWith("--screenshot-js="))?.slice("--screenshot-js=".length);
    if (script) {
      const { readFileSync } = await import("node:fs");
      await mainWindow.webContents
        .executeJavaScript(readFileSync(script, "utf8"))
        .then((value) => log(`screenshot: script → ${String(value).slice(0, 200)}`))
        .catch((exc) => log(`screenshot: script failed: ${String(exc)}`));
    }
    const delay = Number(process.argv.find((a) => a.startsWith("--screenshot-delay="))?.slice("--screenshot-delay=".length) ?? 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const image = await mainWindow.webContents.capturePage();
    writeFileSync(screenshotFlag, image.toPNG());
    log(`screenshot: ${screenshotFlag}`);
    app.quit();
  }
}

function about(): void {
  const s = shipped();
  const lines = [
    // the same version line as the web client's About (About.tsx `versionLine`)
    `nanoMuse Desktop ${app.getVersion()} · harness ${s.bundle ?? "?"}`,
    zh ? "一个开源的个人智能体，装在你的每一台设备上。" : "An open-source personal agent for every device you own.",
    "",
    `DeepSeek Harness ${s.dsh ?? "?"} (MIT) · ${BUNDLE} ${s.bundle ?? "?"} (GPL-3.0-or-later)`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    "",
    zh
      ? "nanoMuse 是社区项目，与 Meta 无关；Muse 是 Meta 的商标。基于 DeepSeek Harness 构建，DeepSeek Harness 是 DeepSeek 的名称。"
      : "nanoMuse is a community project with no affiliation to Meta; Muse is a trademark of Meta. Built on DeepSeek Harness, a name of DeepSeek's.",
  ];
  void dialog.showMessageBox({
    type: "info",
    title: T.about,
    message: "nanoMuse",
    detail: lines.join("\n"),
    buttons: ["OK"],
    icon: nativeImage.createFromPath(iconPath()),
  });
}

function buildMenu(): void {
  const help: Electron.MenuItemConstructorOptions[] = [
    { label: T.website, click: () => void shell.openExternal("https://nanomuse.cn/") },
    { label: T.docs, click: () => void shell.openExternal(DOCS_PAGE) },
    { label: T.releases, click: () => void shell.openExternal(RELEASES_PAGE) },
    { label: T.issue, click: () => void shell.openExternal(ISSUES_PAGE) },
    { type: "separator" },
    { label: T.builtOn, click: () => void shell.openExternal(HARNESS_PAGE) },
    { label: T.openLogFolder, click: () => shell.showItemInFolder(join(harnessHome(), "desktop.log")) },
  ];
  if (process.platform !== "darwin") help.push({ type: "separator" }, { label: T.about, click: about });
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "nanoMuse",
            submenu: [
              { label: T.about, click: about },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),
    {
      label: T.edit,
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: T.view,
      submenu: [
        { label: T.reload, accelerator: "CmdOrCtrl+R", click: () => mainWindow?.webContents.reload() },
        { label: T.devtools, accelerator: process.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I", click: () => mainWindow?.webContents.toggleDevTools() },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: T.window, role: "windowMenu" },
    { label: T.help, submenu: help },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.setAboutPanelOptions({
    applicationName: "nanoMuse",
    applicationVersion: app.getVersion(),
    copyright: "GPL-3.0-or-later · the nanoMuse community · built on DeepSeek Harness (MIT)",
    website: "https://nanomuse.cn/",
  });
  app.whenReady().then(async () => {
    registerBridge();
    registerOverlays();
    buildMenu();
    prefs = readPrefs();
    applyPrefs();
    log(`nanoMuse Desktop ${app.getVersion()} starting (${process.platform} ${process.arch}, packaged=${app.isPackaged})`);
    try {
      await boot();
    } catch (exc) {
      await reportStartupFailure(exc);
      app.quit();
    }
  });
  app.on("activate", () => {
    if (!mainWindow && hostUrl) {
      mainWindow = createWindow();
      void mainWindow.loadURL(hostUrl);
    }
  });
  app.on("window-all-closed", () => {
    // the Host keeps running on macOS while the app is in the Dock, as apps there do
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (e) => {
    releaseAwake();
    globalShortcut.unregisterAll();
    if (quitting) return;
    quitting = true;
    if (child) {
      e.preventDefault();
      void stopHost().then(() => app.quit());
    }
  });
}
