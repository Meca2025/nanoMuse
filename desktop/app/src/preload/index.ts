import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, HandsLive, StageConfig, StageReport } from "../shared/types";

/**
 * The one bridge, for both windows. The web app sees `window.nanomuseDesktop` and can
 * tell it is in the desktop shell; the stage uses it for its config and to report the
 * run back to main (tray tooltip, show/hide).
 */
const bridge: DesktopBridge = {
  platform: process.platform,
  version: (() => {
    try {
      return String(ipcRenderer.sendSync("app:version") || "dev");
    } catch {
      return "dev";
    }
  })(),
  onConfig: (cb: (config: StageConfig) => void) => {
    ipcRenderer.on("config", (_event, config: StageConfig) => cb(config));
  },
  onHands: (cb: (frame: HandsLive) => void) => {
    ipcRenderer.on("hands", (_event, frame: HandsLive) => cb(frame));
  },
  report: (report: StageReport) => ipcRenderer.send("stage:report", report),
  stopHands: () => ipcRenderer.send("hands:stop"),
};

contextBridge.exposeInMainWorld("nanomuseDesktop", bridge);
