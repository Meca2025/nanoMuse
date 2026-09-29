/** What main hands the stage renderer once it is up: where the runtime is. */
export interface StageConfig {
  /** http://127.0.0.1:8787 */
  base: string;
  /** the access token, "" when the runtime runs with --no-auth */
  token: string;
  /** the display the stage covers, in CSS pixels */
  width: number;
  height: number;
  /** BCP-47 tag the stage should speak */
  locale: string;
}

/** One step of the hands, as the runtime publishes it on /ws (`kind: "hands"`). */
export interface HandsLive {
  kind: "hands";
  event: "begin" | "screen" | "act" | "end" | "stop" | "notice" | string;
  thread?: string;
  text?: string;
  action?: string;
  label?: string;
  fx?: number;
  fy?: number;
  fx2?: number;
  fy2?: number;
  keys?: string[];
  app?: string;
  title?: string;
  ts?: number;
}

/** What the stage tells main about the run, for the tray and for showing/hiding itself. */
export interface StageReport {
  active: boolean;
  text?: string;
  label?: string;
}

/** The bridge the preload exposes as `window.nanomuseDesktop`. */
export interface DesktopBridge {
  platform: string;
  version: string;
  onConfig: (cb: (config: StageConfig) => void) => void;
  /** hands frames pushed by main (the `--stage-demo` script); the runtime's come over /ws */
  onHands: (cb: (frame: HandsLive) => void) => void;
  report: (report: StageReport) => void;
  stopHands: () => void;
}

declare global {
  interface Window {
    nanomuseDesktop?: DesktopBridge;
  }
}
