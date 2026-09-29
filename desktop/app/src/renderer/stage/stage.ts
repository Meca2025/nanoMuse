import trayUrl from "../../../resources/tray.png";
import type { HandsLive, StageConfig } from "../../shared/types";

/**
 * The stage. Listens on the runtime's /ws for `kind: "hands"` and draws:
 * - a ring where the next click lands, with a ripple that fades over ~1.2 s and the
 *   words under the cursor next to it (UI-TARS-desktop's ScreenMarker, HandsStage on
 *   Android);
 * - a line for a drag;
 * - a soft frame around the display while a task runs, brighter for the moment of a
 *   screenshot;
 * - a pill at the top saying what is going on and how to stop it.
 * The window is click-through; this page never takes input.
 */

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const pill = document.getElementById("pill")!;
const what = document.getElementById("what")!;
const step = document.getElementById("step")!;
const hint = document.getElementById("hint")!;
const frame = document.getElementById("frame")!;
(pill.querySelector(".avatar") as HTMLElement).style.backgroundImage = `url(${trayUrl})`;

const ACCENT = "#0A66E4";
const RING_MS = 1300;

interface Mark {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  label: string;
  born: number;
  kind: "point" | "drag" | "type" | "key";
}

let marks: Mark[] = [];
let config: StageConfig | null = null;
let active = false;
let zh = false;

const words = () => ({
  working: zh ? "nanoMuse 正在操作这台电脑" : "nanoMuse is using this computer",
  stop: zh ? "Ctrl+Shift+Esc 停止" : "Ctrl+Shift+Esc to stop",
  looking: zh ? "看一眼屏幕" : "looking at the screen",
  click: zh ? "点击" : "click",
  double: zh ? "双击" : "double-click",
  right: zh ? "右键" : "right-click",
  move: zh ? "移到" : "move to",
  drag: zh ? "拖动" : "drag",
  scroll: zh ? "滚动" : "scroll",
  type: zh ? "输入" : "type",
  key: zh ? "按键" : "press",
  open: zh ? "打开" : "open",
  wait: zh ? "等一下" : "wait",
  done: zh ? "完成" : "done",
  stopped: zh ? "已停止" : "stopped",
});

function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", fit);
fit();

function describe(ev: HandsLive): string {
  const w = words();
  const label = ev.label ? ` “${ev.label}”` : "";
  switch (ev.action) {
    case "click":
      return `${w.click}${label}`;
    case "double_click":
      return `${w.double}${label}`;
    case "right_click":
    case "middle_click":
      return `${w.right}${label}`;
    case "move":
      return `${w.move}${label}`;
    case "drag":
      return `${w.drag}${label}`;
    case "scroll":
      return w.scroll;
    case "type":
      return `${w.type} ${ev.text ? `${ev.text.length} ${zh ? "个字符" : "chars"}` : ""}`.trim();
    case "key":
      return `${w.key} ${(ev.keys ?? []).join("+")}`.trim();
    case "open_app":
      return `${w.open}${label}`;
    case "wait":
      return w.wait;
    default:
      return ev.action ?? "";
  }
}

function onHands(ev: HandsLive): void {
  const w = words();
  switch (ev.event) {
    case "begin":
      active = true;
      marks = [];
      what.textContent = w.working;
      step.textContent = ev.text ? `· ${ev.text}` : "";
      hint.textContent = w.stop;
      pill.classList.add("on");
      frame.classList.add("on");
      report(true, ev.text ?? "", "");
      break;
    case "screen":
      frame.classList.add("look");
      setTimeout(() => frame.classList.remove("look"), 320);
      if (!active) return;
      step.textContent = `· ${w.looking}`;
      break;
    case "act": {
      const text = describe(ev);
      step.textContent = text ? `· ${text}` : "";
      if (!active) {
        // a single computer_act outside a task: show the ring anyway, briefly
        pill.classList.add("on");
        frame.classList.add("on");
        report(true, "", text);
        setTimeout(() => {
          if (!active) {
            pill.classList.remove("on");
            frame.classList.remove("on");
            report(false);
          }
        }, RING_MS + 400);
      } else {
        report(true, undefined, text);
      }
      if (typeof ev.fx === "number" && typeof ev.fy === "number") {
        const kind: Mark["kind"] = ev.action === "drag" ? "drag" : "point";
        marks.push({
          x: ev.fx * window.innerWidth,
          y: ev.fy * window.innerHeight,
          x2: typeof ev.fx2 === "number" ? ev.fx2 * window.innerWidth : undefined,
          y2: typeof ev.fy2 === "number" ? ev.fy2 * window.innerHeight : undefined,
          label: ev.label ?? "",
          born: performance.now(),
          kind,
        });
      } else if (ev.action === "type" || ev.action === "key") {
        // no point on screen: a small note under the pill is enough
      }
      break;
    }
    case "notice":
      step.textContent = ev.text ? `· ${ev.text}` : "";
      break;
    case "end":
    case "stop":
      active = false;
      step.textContent = `· ${ev.event === "stop" ? w.stopped : w.done}`;
      setTimeout(() => {
        pill.classList.remove("on");
        frame.classList.remove("on");
      }, 700);
      report(false);
      break;
    default:
      break;
  }
}

function report(on: boolean, text?: string, label?: string): void {
  window.nanomuseDesktop?.report({ active: on, text, label });
}

function draw(now: number): void {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  marks = marks.filter((m) => now - m.born < RING_MS);
  for (const m of marks) {
    const t = (now - m.born) / RING_MS; // 0 → 1
    const ease = 1 - Math.pow(1 - t, 3);
    // ripple
    ctx.beginPath();
    ctx.arc(m.x, m.y, 18 + ease * 64, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(10, 102, 228, ${(1 - t) * 0.55})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    // ring
    ctx.beginPath();
    ctx.arc(m.x, m.y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(10, 102, 228, ${Math.min(1, 1.6 - t)})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    if (m.kind === "drag" && typeof m.x2 === "number" && typeof m.y2 === "number") {
      const p = Math.min(1, t * 1.6);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + (m.x2 - m.x) * p, m.y + (m.y2 - m.y) * p);
      ctx.strokeStyle = `rgba(10, 102, 228, ${1 - t * 0.6})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (m.label && t < 0.85) {
      const text = m.label.length > 40 ? `${m.label.slice(0, 40)}…` : m.label;
      ctx.font = "600 13px -apple-system, 'PingFang SC', 'Noto Sans CJK SC', 'Segoe UI', system-ui, sans-serif";
      const wdt = ctx.measureText(text).width + 18;
      let lx = m.x + 30;
      let ly = m.y - 32;
      if (lx + wdt > window.innerWidth - 8) lx = m.x - 30 - wdt;
      if (ly < 8) ly = m.y + 30;
      ctx.globalAlpha = 1 - Math.max(0, (t - 0.6) / 0.25);
      ctx.fillStyle = "rgba(28, 28, 30, 0.88)";
      roundRect(lx, ly, wdt, 24, 12);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx + 9, ly + 12);
      ctx.globalAlpha = 1;
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------------ the socket
let socket: WebSocket | null = null;
let backoff = 800;

function connect(): void {
  if (!config) return;
  const url = new URL(config.base.replace(/^http/, "ws"));
  url.pathname = "/ws";
  if (config.token) url.searchParams.set("token", config.token);
  socket = new WebSocket(url.toString());
  socket.onopen = () => {
    backoff = 800;
  };
  socket.onmessage = (e) => {
    let msg: { kind?: string } & Partial<HandsLive>;
    try {
      msg = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (msg.kind === "hands") onHands(msg as HandsLive);
    else if (msg.kind === "hello") {
      const hands = (msg as { state?: { hands?: { task_active?: boolean; task_text?: string } } }).state?.hands;
      if (hands?.task_active) onHands({ kind: "hands", event: "begin", text: hands.task_text ?? "" });
    }
  };
  socket.onclose = () => {
    socket = null;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 1.7, 10_000);
  };
  socket.onerror = () => socket?.close();
}

window.nanomuseDesktop?.onHands((frame) => onHands(frame));
window.nanomuseDesktop?.onConfig((cfg) => {
  config = cfg;
  zh = (cfg.locale || navigator.language || "").toLowerCase().startsWith("zh");
  socket?.close();
  connect();
});
