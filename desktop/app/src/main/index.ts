import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StageReport } from "../shared/types";
import { Runtime } from "./runtime";
import { Stage } from "./stage";

/**
 * nanoMuse for the desktop — the window, and what a browser tab cannot do.
 *
 * The app you see is the web app the runtime serves (web/ → nanomuse/server/static),
 * loaded from 127.0.0.1 with the same token the phone gets from the QR code. Around it:
 * a tray that keeps the runtime going when the window is closed, a global Stop that takes
 * the mouse back from the hands, native notifications, and the stage (stage.ts) that
 * shows where the hands are about to click.
 *
 * Development only for now: `npm run dev` here with the runtime's .venv next door.
 * Nothing is packaged in this stage (docs/every-device.md).
 */

const runtime = new Runtime();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stage: Stage | null = null;
let quitting = false;
const logs: string[] = [];

const STOP_SHORTCUT = "CommandOrControl+Shift+Escape";
const SHOW_SHORTCUT = "CommandOrControl+Shift+M";
/** dev flag: `--screenshot=/tmp/x.png` writes the window and quits (a headless check) */
const screenshotFlag = process.argv.find((a) => a.startsWith("--screenshot="))?.slice("--screenshot=".length);
/** dev flag: `--stage-demo` plays a scripted hands run into the stage (with --screenshot: captures it) */
const stageDemo = process.argv.includes("--stage-demo");

function log(line: string): void {
  logs.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (logs.length > 200) logs.shift();
  console.log(`[nanomuse-desktop] ${line}`);
}

const zh = (app.getLocale() || "").toLowerCase().startsWith("zh");
const T = {
  show: zh ? "打开 nanoMuse" : "Open nanoMuse",
  devices: zh ? "设备" : "Devices",
  stop: zh ? "停止操作（Ctrl+Shift+Esc）" : "Stop the hands (Ctrl+Shift+Esc)",
  browser: zh ? "在浏览器中打开" : "Open in the browser",
  logs: zh ? "打开日志文件夹" : "Open the log folder",
  quit: zh ? "退出（同时停止 nanomuse serve）" : "Quit (stops nanomuse serve too)",
  quitAttached: zh ? "退出（nanomuse serve 继续运行）" : "Quit (nanomuse serve keeps running)",
  working: zh ? "正在操作这台电脑" : "using this computer",
  stopped: zh ? "已把鼠标交还给你。" : "The mouse is yours again.",
  stoppedTitle: zh ? "操作已停止" : "Hands stopped",
  notReady: zh ? "nanoMuse 没能启动" : "nanoMuse could not start",
};

function iconPath(name: string): string {
  // out/main → ../../resources in dev and in the built app alike
  return join(__dirname, "..", "..", "resources", name);
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: "nanoMuse",
    icon: iconPath("icon.png"),
    backgroundColor: "#F3F3F5",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  void win.loadURL(runtime.appUrl());
  // links to elsewhere open in the system browser; the app stays on its own origin
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(runtime.base)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(runtime.base)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on("close", (e) => {
    // closing the window keeps the Muse working; the tray brings it back
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  return win;
}

function showMain(): void {
  if (!mainWindow) mainWindow = createMainWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function openDevices(): void {
  showMain();
  // the web app reads the hash on load and switches tabs (no-op on older builds)
  void mainWindow?.loadURL(`${runtime.appUrl()}#devices`);
}

async function stopHands(): Promise<void> {
  const ok = await runtime.post("/api/hands/stop");
  log(`stop hands → ${ok}`);
  if (Notification.isSupported()) new Notification({ title: T.stoppedTitle, body: T.stopped, silent: true }).show();
}

function buildTray(): void {
  const img = nativeImage.createFromPath(iconPath("tray.png"));
  tray = new Tray(process.platform === "darwin" ? img.resize({ width: 18, height: 18 }) : img);
  tray.setToolTip("nanoMuse");
  refreshTray({ active: false });
  tray.on("click", () => showMain());
  tray.on("double-click", () => showMain());
}

function refreshTray(report: StageReport): void {
  if (!tray) return;
  const busy = report.active ? ` — ${T.working}${report.text ? `: ${report.text}` : ""}` : "";
  tray.setToolTip(`nanoMuse${busy}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: T.show, click: () => showMain() },
      { label: T.devices, click: () => openDevices() },
      { type: "separator" },
      { label: T.stop, enabled: report.active, click: () => void stopHands() },
      { type: "separator" },
      { label: T.browser, click: () => void shell.openExternal(runtime.appUrl()) },
      { label: T.logs, click: () => void shell.openPath(runtime.home) },
      { type: "separator" },
      {
        label: runtime.owned ? T.quit : T.quitAttached,
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

app.setName("nanoMuse");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMain());

  app.whenReady().then(async () => {
    try {
      await runtime.ensure(log);
    } catch (exc) {
      log(String(exc));
      dialog.showErrorBox(T.notReady, String((exc as Error).message ?? exc));
      app.quit();
      return;
    }
    const health = await runtime.health();
    if (health?.auth && !runtime.token) {
      log(`warning: the runtime wants a token and none was found in ${runtime.home}/server_token`);
    }

    ipcMain.on("hands:stop", () => void stopHands());

    const devUrl = process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/stage/index.html` : null;
    stage = new Stage(
      { base: runtime.base, token: runtime.token, locale: app.getLocale() || "en" },
      join(__dirname, "../preload/index.js"),
      devUrl,
      join(__dirname, "../renderer/stage/index.html"),
      (r) => refreshTray(r),
    );
    stage.create();

    if (stageDemo) {
      stage.demo(async (win) => {
        if (screenshotFlag) {
          const img = await win.webContents.capturePage();
          writeFileSync(screenshotFlag, img.toPNG());
          log(`stage screenshot → ${screenshotFlag}`);
          quitting = true;
          app.quit();
        }
      });
    }

    buildTray();
    mainWindow = createMainWindow();

    if (!globalShortcut.register(STOP_SHORTCUT, () => void stopHands())) log(`could not register ${STOP_SHORTCUT}`);
    if (!globalShortcut.register(SHOW_SHORTCUT, () => showMain())) log(`could not register ${SHOW_SHORTCUT}`);

    if (screenshotFlag && !stageDemo) {
      mainWindow.webContents.once("did-finish-load", () => {
        setTimeout(async () => {
          try {
            const img = await mainWindow!.webContents.capturePage();
            writeFileSync(screenshotFlag, img.toPNG());
            log(`screenshot → ${screenshotFlag}`);
          } finally {
            quitting = true;
            app.quit();
          }
        }, 2500);
      });
    }
  });

  app.on("activate", () => showMain());

  app.on("window-all-closed", () => {
    // the tray keeps the app alive; without a tray (unsupported desktop) closing quits
    if (!tray) app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    globalShortcut.unregisterAll();
    stage?.destroy();
    runtime.stop();
  });
}
