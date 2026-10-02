import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerSaveBlocker, shell, systemPreferences } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * nanoMuse Harness — the nanoMuse desktop built on DeepSeek Harness.
 *
 * The window shows the harness's own web app, served by a dsh Host this shell starts as a
 * child process: the Electron binary in Node mode (`ELECTRON_RUN_AS_NODE`, as the harness's
 * own desktop does), running the `dsh` that ships under `resources/dsh` with the nanoMuse
 * bundle (`harness/dsh-nanomuse`) installed next to it. The profile the Host boots lives
 * under `~/.nanomuse/harness` and names the bundle; nothing is installed at first run and
 * no Node or pnpm is needed on the machine. When the runtime for the hands is bundled
 * (`resources/runtime`, the PyInstaller build the other desktop app carries too), the
 * preset's `nanomuse mcp` points at it, so the hands work out of the box.
 *
 * What the shell adds is small on purpose: a loading page with the face, the Host's URL
 * loaded once it is ready, external links in the browser, a menu with About and the
 * places to report a problem, and a clear dialog — with the log's tail on the clipboard —
 * when the Host does not come up. Everything else is the harness's and the bundle's
 * (docs/harness.md).
 */

const PROFILE = "nanomuse";
const BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-nanomuse"];
const BUNDLE = "dsh-nanomuse";
const READY_TIMEOUT_MS = 120_000;
const RELEASES_PAGE = "https://github.com/nano-muse/nanoMuse/releases/latest";
const ISSUES_PAGE = "https://github.com/nano-muse/nanoMuse/issues";
const DOCS_PAGE = "https://github.com/nano-muse/nanoMuse/blob/main/docs/harness.md";
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
  about: zh ? "关于 nanoMuse Harness" : "About nanoMuse Harness",
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

/** `~/.nanomuse/harness`, the harness home of this app alone — the CLI's `~/.dsh` is left alone. */
function harnessHome(): string {
  return process.env.NANOMUSE_HARNESS_HOME || join(homedir(), ".nanomuse", "harness");
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
  console.log(`[nanomuse-harness] ${line}`);
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
 * The profile the Host boots: `~/.nanomuse/harness/profiles/nanomuse`. Three small files the
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
      "# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries. nanoMuse Harness and dsh\n# write settings here; you may edit it too.\n[]\n",
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
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
    freePort()
      .then((port) => {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          DSH_HOME: home,
        };
        const shellPath = loginShellPath();
        if (shellPath) env.PATH = shellPath;
        const runtime = bundledRuntime();
        if (!env.NANOMUSE_PY && runtime) env.NANOMUSE_PY = runtime;
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
    `nanoMuse Harness ${app.getVersion()} · dsh ${s.dsh ?? "?"} · ${BUNDLE} ${s.bundle ?? "?"}`,
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
      await dialog.showMessageBox({ type: "info", title: "nanoMuse Harness", message: T.copied, buttons: ["OK"] });
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

const PERMISSION_PANES: Record<PermissionKind, string> = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

let awakeBlocker: number | null = null;

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
    if (kind === "accessibility") {
      // the system's own dialog, which also lists the app in the Accessibility pane
      if (!systemPreferences.isTrustedAccessibilityClient(true)) void shell.openExternal(PERMISSION_PANES.accessibility);
    } else if (kind === "microphone") {
      await systemPreferences.askForMediaAccess("microphone").catch(() => false);
    } else {
      // Screen Recording has no prompt API: the pane is where the switch is
      void shell.openExternal(PERMISSION_PANES.screen);
    }
    return permissionState(kind);
  });
  ipcMain.handle("nanomuse:permissions:settings", (_e, kind: PermissionKind) => {
    if (process.platform === "darwin" && PERMISSION_PANES[kind]) void shell.openExternal(PERMISSION_PANES[kind]);
  });
  ipcMain.handle("nanomuse:open-external", (_e, url: string) => {
    if (typeof url === "string" && /^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle("nanomuse:keep-awake", (_e, on: boolean) => {
    if (on && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start("prevent-display-sleep");
    else if (!on && awakeBlocker !== null) {
      powerSaveBlocker.stop(awakeBlocker);
      awakeBlocker = null;
    }
  });
  ipcMain.handle("nanomuse:theme", (_e, theme: string) => {
    mainWindow?.setBackgroundColor(theme === "dark" ? BASE_DARK : BASE_LIGHT);
  });
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: join(__dirname, "preload.js") },
  });
  win.once("ready-to-show", () => win.show());
  // the harness names its document after itself; the window keeps ours
  win.on("page-title-updated", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (hostUrl && url.startsWith(new URL(hostUrl).origin)) return;
    if (url.startsWith("file:")) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    // the microphone for voice input; nothing else is asked for
    callback(permission === "media");
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  void win.loadFile(join(ownResources(), "loading.html"), { query: { lang: zh ? "zh" : "en" } });
  return win;
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
    const image = await mainWindow.webContents.capturePage();
    writeFileSync(screenshotFlag, image.toPNG());
    log(`screenshot: ${screenshotFlag}`);
    app.quit();
  }
}

function about(): void {
  const s = shipped();
  const lines = [
    `nanoMuse Harness ${app.getVersion()}`,
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
    message: "nanoMuse Harness",
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
            label: "nanoMuse Harness",
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
    applicationName: "nanoMuse Harness",
    applicationVersion: app.getVersion(),
    copyright: "GPL-3.0-or-later · the nanoMuse community · built on DeepSeek Harness (MIT)",
    website: "https://nanomuse.cn/",
  });
  app.whenReady().then(async () => {
    registerBridge();
    buildMenu();
    log(`nanoMuse Harness ${app.getVersion()} starting (${process.platform} ${process.arch}, packaged=${app.isPackaged})`);
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
    if (quitting) return;
    quitting = true;
    if (child) {
      e.preventDefault();
      void stopHost().then(() => app.quit());
    }
  });
}
