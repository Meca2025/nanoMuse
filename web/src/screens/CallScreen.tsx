import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "../api";
import { Camera, Microphone, Speaker } from "../call/audio";
import { Avatar } from "../components/Avatar";
import { useT } from "../i18n";
import { useStore } from "../store";
import type { CallView } from "../types";
import { cx } from "../util";

type Phase =
  | "connecting"
  | "listening"
  | "hearing"
  | "thinking"
  | "speaking"
  | "ended"
  | "failed";

interface Caption {
  who: "you" | "muse";
  text: string;
  final: boolean;
}

/**
 * A voice or video call with your nanoMuse, in real time: you talk, it answers in its
 * voice — no typing, no waiting for a transcript. The runtime bridges the socket to the
 * model (the relay when signed in, your own Bailian key otherwise) and writes what was said
 * into the chat. Full screen, one big presence in the middle, captions under it, three
 * controls at the bottom. Camera frames go along once a second on a video call.
 */
export function CallScreen({ mode }: { mode: "voice" | "video" }) {
  const { state, openCall, toast } = useStore();
  const t = useT();
  const name = state.profile?.name ?? "nanoMuse";
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(mode === "video");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [cost, setCost] = useState(0);
  const [turns, setTurns] = useState(0);
  const [level, setLevel] = useState(0);
  const [info, setInfo] = useState<CallView | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const mic = useRef<Microphone | null>(null);
  const spk = useRef<Speaker | null>(null);
  const cam = useRef<Camera | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const sentAudio = useRef(false);
  const phaseRef = useRef<Phase>("connecting");
  const startedAt = useRef(0);
  const closed = useRef(false);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const send = useCallback((obj: unknown) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(obj));
  }, []);

  const hangUp = useCallback((reason?: string) => {
    if (closed.current) return;
    closed.current = true;
    mic.current?.stop();
    spk.current?.stop();
    cam.current?.stop();
    try {
      ws.current?.close(1000, reason ?? "hang up");
    } catch {
      /* already closed */
    }
    go(reason === "failed" ? "failed" : "ended");
  }, []);

  const handle = useCallback(
    (obj: Record<string, unknown>) => {
      const type = String(obj.type ?? "");
      switch (type) {
        case "session.created":
        case "session.updated":
          if (phaseRef.current === "connecting") {
            startedAt.current = Date.now();
            go("listening");
          }
          break;
        case "input_audio_buffer.speech_started":
          spk.current?.interrupt();
          go("hearing");
          break;
        case "input_audio_buffer.speech_stopped":
          go("thinking");
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const text = String(obj.transcript ?? "").trim();
          if (text)
            setCaptions((c) =>
              [
                ...c.filter((x) => x.final),
                { who: "you" as const, text, final: true },
              ].slice(-6),
            );
          break;
        }
        case "response.created":
          if (phaseRef.current !== "speaking") go("thinking");
          break;
        case "response.audio_transcript.delta": {
          const delta = String(obj.delta ?? "");
          setCaptions((c) => {
            const last = c[c.length - 1];
            if (last && last.who === "muse" && !last.final)
              return [...c.slice(0, -1), { ...last, text: last.text + delta }];
            return [
              ...c,
              { who: "muse" as const, text: delta, final: false },
            ].slice(-6);
          });
          break;
        }
        case "response.audio_transcript.done": {
          const text = String(obj.transcript ?? "").trim();
          setCaptions((c) => {
            const last = c[c.length - 1];
            if (last && last.who === "muse" && !last.final)
              return [
                ...c.slice(0, -1),
                { who: "muse" as const, text: text || last.text, final: true },
              ];
            return text
              ? [...c, { who: "muse" as const, text, final: true }].slice(-6)
              : c;
          });
          break;
        }
        case "response.audio.delta":
          spk.current?.play(String(obj.delta ?? ""));
          if (phaseRef.current !== "speaking") go("speaking");
          break;
        case "response.done": {
          const nm = (obj.nanomuse ?? {}) as { cost_cny?: number };
          setTurns((n) => n + 1);
          if (typeof nm.cost_cny === "number") setCost((c) => c + nm.cost_cny!);
          break;
        }
        case "error": {
          const err = (obj.error ?? {}) as { code?: string; message?: string };
          const code = err.code ?? "";
          if (code === "no_call_route" || code === "offline") {
            setError(t(err.message ?? code));
            hangUp("failed");
          } else if (code === "daily_cap" || code === "out_of_tokens") {
            setError(t("The daily allowance is used up; the call ended."));
          } else if (code === "call_too_long") {
            setError(t("Calls are limited in length; this one reached it."));
          } else if (err.message && !/cancel/i.test(err.message)) {
            setError(t(err.message));
          }
          break;
        }
        default:
          break;
      }
    },
    [hangUp, t],
  );

  // the session: media first (permission prompt), then the socket
  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();
    (async () => {
      try {
        setInfo(await api.call().catch(() => null));
        const speaker = new Speaker();
        await speaker.start();
        spk.current = speaker;
        const microphone = new Microphone();
        await microphone.start((b64) => {
          sentAudio.current = true;
          send({ type: "input_audio_buffer.append", audio: b64 });
        });
        mic.current = microphone;
        if (cancelled) return;
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const token = getToken();
        const url = `${proto}://${window.location.host}/ws/call?token=${encodeURIComponent(token)}${mode === "video" ? "&video=1" : ""}`;
        const socket = new WebSocket(url);
        ws.current = socket;
        socket.onmessage = (ev) => {
          let obj: Record<string, unknown>;
          try {
            obj = JSON.parse(ev.data as string) as Record<string, unknown>;
          } catch {
            return;
          }
          handle(obj);
        };
        socket.onclose = (ev) => {
          if (closed.current) return;
          const why =
            ev.code === 4412
              ? t(
                  "Calls need nanoMuse Cloud (sign in) or a Bailian key as the model.",
                )
              : ev.code === 4502
                ? t("The call could not be connected; try again in a moment.")
                : ev.code === 4429
                  ? t("The daily allowance is used up; the call ended.")
                  : ev.code === 4408
                    ? t("Calls are limited in length; this one reached it.")
                    : phaseRef.current === "connecting"
                      ? t(
                          "The call could not be connected; try again in a moment.",
                        )
                      : null;
          if (why) setError(why);
          hangUp(
            why && phaseRef.current === "connecting" ? "failed" : "closed",
          );
        };
        socket.onerror = () => {
          /* onclose follows */
        };
      } catch (e) {
        // getUserMedia's DOMException names, in the person's words
        const name = (e as Error).name;
        const msg =
          name === "NotAllowedError" || name === "SecurityError"
            ? t(
                "Microphone access was refused. Allow it in the browser and try again.",
              )
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? t("No microphone was found on this device.")
              : name === "NotReadableError" || name === "AbortError"
                ? t(
                    "The microphone is in use by another app or could not be started.",
                  )
                : window.isSecureContext === false
                  ? t(
                      "Calls need a secure page (https or localhost); the browser will not open the microphone here.",
                    )
                  : t((e as Error).message);
        setError(msg);
        hangUp("failed");
      }
    })();
    return () => {
      cancelled = true;
      hangUp("left");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the camera follows the toggle
  useEffect(() => {
    if (!video || phase === "ended" || phase === "failed") {
      cam.current?.stop();
      cam.current = null;
      return;
    }
    const el = videoEl.current;
    if (!el) return;
    const camera = new Camera();
    cam.current = camera;
    camera
      .start(el, (jpeg) => {
        // the model wants audio before pictures
        if (sentAudio.current)
          send({ type: "input_image_buffer.append", image: jpeg });
      })
      .catch((e: Error) => {
        toast(
          e.name === "NotAllowedError"
            ? t("Camera access was refused.")
            : e.message,
        );
        setVideo(false);
      });
    return () => camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, phase === "ended" || phase === "failed"]);

  // clock and levels
  useEffect(() => {
    const id = window.setInterval(() => {
      if (phaseRef.current === "ended" || phaseRef.current === "failed") return;
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      const p = phaseRef.current;
      const l =
        p === "speaking"
          ? (spk.current?.level() ?? 0)
          : (mic.current?.level ?? 0);
      setLevel((prev) => prev * 0.6 + l * 0.4);
      // the speaker drained: back to listening
      if (p === "speaking" && (spk.current?.pending() ?? 0) <= 0.05)
        go("listening");
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    mic.current?.setMuted(m);
  };

  const done = phase === "ended" || phase === "failed";
  const statusText =
    phase === "connecting"
      ? t("Connecting…")
      : phase === "listening"
        ? muted
          ? t("Muted")
          : t("Listening")
        : phase === "hearing"
          ? t("Go on…")
          : phase === "thinking"
            ? t("Thinking")
            : phase === "speaking"
              ? t("Speaking")
              : phase === "failed"
                ? t("Could not connect")
                : t("Call ended");
  const ring =
    phase === "speaking"
      ? "call-ring-speak"
      : phase === "hearing"
        ? "call-ring-hear"
        : "call-ring-idle";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#0b0d14] text-white">
      {/* backdrop: two soft blobs that breathe with the voice */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cx(
            "absolute left-1/2 top-[38%] h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700",
            phase === "speaking"
              ? "bg-sky-500/30"
              : phase === "hearing"
                ? "bg-emerald-500/25"
                : "bg-indigo-500/20",
          )}
          style={{
            transform: `translate(-50%, -50%) scale(${1 + level * 0.35})`,
          }}
        />
        <div className="absolute -bottom-32 -right-24 h-[60vmin] w-[60vmin] rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]" />
      </div>

      {/* header */}
      <header className="safe-top relative z-10 flex items-center justify-between px-5 pt-4">
        <div className="text-[12.5px] font-medium text-white/60">
          {mode === "video" ? t("Video call") : t("Voice call")}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] tabular-nums text-white/60">
          {info?.source === "own" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
              {t("your key")}
            </span>
          )}
          {cost > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
              ¥{cost.toFixed(2)}
            </span>
          )}
          <span>{mmss(seconds)}</span>
        </div>
      </header>

      {/* the presence */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cx(
                "absolute rounded-full border transition-opacity duration-500",
                ring,
                done ? "opacity-0" : "",
              )}
              style={{
                width: 180 + i * 56 + level * (60 + i * 30),
                height: 180 + i * 56 + level * (60 + i * 30),
                opacity: done
                  ? 0
                  : Math.max(
                      0.08,
                      0.45 - i * 0.13 - (phase === "listening" ? 0.12 : 0),
                    ),
                transition:
                  "width 120ms ease-out, height 120ms ease-out, opacity 500ms",
              }}
            />
          ))}
          <div
            className={cx(
              "relative rounded-full bg-white/[0.06] p-4 shadow-[0_0_80px_-20px_rgba(56,189,248,0.6)] backdrop-blur",
              phase === "thinking" && "call-breathe",
            )}
            style={{
              transform: `scale(${1 + level * 0.06})`,
              transition: "transform 120ms ease-out",
            }}
          >
            <Avatar profile={state.profile} size={132} still={done} />
          </div>
        </div>
        <div className="mt-8 text-[22px] font-semibold tracking-tight">
          {name}
        </div>
        <div
          className={cx(
            "mt-1 flex items-center gap-2 text-[14px]",
            phase === "speaking"
              ? "text-sky-300"
              : phase === "hearing"
                ? "text-emerald-300"
                : "text-white/60",
          )}
        >
          {phase === "thinking" && <span className="call-dots" aria-hidden />}
          {statusText}
        </div>

        {/* captions */}
        <div className="mt-6 min-h-[84px] w-full max-w-md space-y-1.5 text-center">
          {captions.slice(-2).map((c, i) => (
            <p
              key={i}
              className={cx(
                "text-[15px] leading-snug transition-opacity",
                c.who === "you" ? "text-white/55" : "text-white/90",
                !c.final && "opacity-80",
              )}
            >
              {c.who === "you" ? (
                <span className="mr-1.5 text-white/35">{t("You")}</span>
              ) : null}
              {c.text}
            </p>
          ))}
          {error && (
            <p className="mx-auto max-w-sm rounded-2xl bg-rose-500/20 px-3 py-2 text-[13px] text-rose-200">
              {error}
            </p>
          )}
          {done && !error && (
            <p className="text-[13px] text-white/50">
              {t("{turns} turns · {time}", { turns, time: mmss(seconds) })}
              {cost > 0 ? ` · ¥${cost.toFixed(2)}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* self view */}
      <video
        ref={videoEl}
        className={cx(
          "absolute right-4 top-14 z-20 h-40 w-28 rounded-2xl object-cover shadow-xl ring-1 ring-white/20 transition-opacity",
          video && !done ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        playsInline
        muted
      />

      {/* controls */}
      <footer className="safe-bottom relative z-10 flex items-center justify-center gap-5 px-6 pb-8 pt-2">
        {done ? (
          <button
            type="button"
            onClick={() => openCall(false)}
            className="rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-black shadow-lg active:scale-95"
          >
            {t("Back to chat")}
          </button>
        ) : (
          <>
            <Control
              label={muted ? t("Unmute") : t("Mute")}
              active={muted}
              onClick={toggleMute}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </Control>
            <button
              type="button"
              onClick={() => hangUp("hang up")}
              aria-label={t("Hang up")}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_10px_40px_-10px_rgba(244,63,94,0.8)] transition active:scale-95"
            >
              <PhoneOff size={28} />
            </button>
            <Control
              label={video ? t("Camera off") : t("Camera")}
              active={video}
              onClick={() => setVideo((v) => !v)}
            >
              {video ? <Video size={22} /> : <VideoOff size={22} />}
            </Control>
          </>
        )}
      </footer>
    </div>
  );
}

function Control({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1.5"
    >
      <span
        className={cx(
          "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur transition active:scale-95",
          active
            ? "bg-white text-black"
            : "bg-white/12 text-white hover:bg-white/20",
        )}
      >
        {children}
      </span>
      <span className="text-[11.5px] text-white/60">{label}</span>
    </button>
  );
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
