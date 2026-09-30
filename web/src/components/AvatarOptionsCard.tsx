import { Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { api, fileUrl } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import type { AvatarEvent } from "../types";
import { cx } from "../util";
import { primaryBtn, secondaryBtn } from "./Form";

const MOOD_ORDER = ["idle", "working", "waiting", "happy", "error"];

/**
 * The avatar studio's card in the chat: first what a new face costs and a *Draw* button;
 * then the four candidates 2×2 (a spinner where one is still coming) with *redraw*; then the
 * poses landing one by one; then the new face, on. The runtime updates the event in place
 * (`avatar.*` patches over the socket); a tap here calls `/api/avatar/*`.
 */
export function AvatarOptionsCard({ event, name = "nanoMuse" }: { event: AvatarEvent; name?: string }) {
  const t = useT();
  const { toast } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const cost = event.cost ?? {};
  const candidates = event.candidates ?? [null, null, null, null];
  const moods = event.moods ?? {};
  const act = async (what: string, run: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await run();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const live = event.stage === "estimate" || event.stage === "drawing" || event.stage === "choose" || event.stage === "posing";

  const costLine = (() => {
    if (cost.cloud === false) return t("{n} pictures, drawn with your own key at your provider's prices.", { n: cost.pictures ?? 8 });
    if (cost.error) return t("The cost could not be checked: {error}", { error: cost.error });
    if (typeof cost.cny !== "number") return t("Checking the cost…");
    if (cost.unlimited) return t("About ¥{cny} for {n} pictures; your account has no limit.", { cny: cost.cny.toFixed(2), n: cost.pictures ?? 8 });
    const left = typeof cost.left_cny === "number" ? cost.left_cny.toFixed(2) : "?";
    return cost.affordable === false
      ? t("About ¥{cny} for {n} pictures — more than the ¥{left} left in your allowance.", { cny: cost.cny.toFixed(2), n: cost.pictures ?? 8, left })
      : t("About ¥{cny} for {n} pictures; ¥{left} left in your allowance.", { cny: cost.cny.toFixed(2), n: cost.pictures ?? 8, left });
  })();

  return (
    <div className="rise flex justify-start pr-8">
      <div className={cx("w-full max-w-[360px] overflow-hidden rounded-3xl rounded-tl-lg border bg-surface shadow-sm", live ? "border-accent/50" : "border-border/70")}>
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
          <div className={cx("mt-0.5 rounded-full p-2", live ? "bg-accent/12 text-accent" : "bg-surface-2 text-fg/80")}>
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium text-muted">
              {event.stage === "estimate" && t("A new look for {name}", { name })}
              {event.stage === "drawing" && t("Drawing four to choose from…")}
              {event.stage === "choose" && t("Pick one — tap it, or say which")}
              {event.stage === "posing" && t("Drawing the poses…")}
              {event.stage === "done" && t("The new look is on")}
              {event.stage === "cancelled" && t("Not this time")}
              {event.stage === "failed" && t("That did not work")}
            </div>
            <div className="mt-0.5 text-[14px] leading-snug">{event.description}</div>
          </div>
        </div>

        {event.stage === "estimate" && (
          <div className="px-4 pb-3.5 space-y-2.5">
            <p className="text-[12.5px] text-muted">{costLine}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy !== null || (cost.cloud !== false && typeof cost.cny !== "number" && !cost.error)}
                onClick={() => act("start", () => api.avatarStart(event.session))}
                className={cx(primaryBtn, "inline-flex items-center gap-1.5 py-2")}
              >
                {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t("Draw")}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => act("cancel", () => api.avatarCancel(event.session))} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
                <X size={14} /> {t("Not now")}
              </button>
            </div>
          </div>
        )}

        {(event.stage === "drawing" || event.stage === "choose") && (
          <div className="px-4 pb-3.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              {candidates.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!c || event.stage !== "choose" || busy !== null}
                  onClick={() => act(`pick${i}`, () => api.avatarChoose(event.session, i))}
                  aria-label={t("Candidate {n}", { n: i + 1 })}
                  className={cx(
                    "relative aspect-square overflow-hidden rounded-2xl bg-[#f1efeb] transition",
                    c && event.stage === "choose" ? "hover:ring-2 hover:ring-accent" : "",
                  )}
                >
                  {c ? (
                    <img src={fileUrl(c)} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-muted">
                      {event.stage === "drawing" ? <Loader2 size={20} className="animate-spin" /> : <X size={18} className="opacity-50" />}
                    </span>
                  )}
                  {busy === `pick${i}` && (
                    <span className="absolute inset-0 flex items-center justify-center bg-bg/60">
                      <Loader2 size={20} className="animate-spin" />
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-bg/80 px-1.5 text-[10.5px] font-semibold text-fg/80">{i + 1}</span>
                </button>
              ))}
            </div>
            {event.errors && event.errors.length > 0 && <p className="text-[12px] text-rose-600 dark:text-rose-300">{event.errors[0]}</p>}
            {event.stage === "choose" && (
              <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => act("redraw", () => api.avatarStart(event.session))} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
                  {busy === "redraw" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t("Redraw")}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => act("cancel", () => api.avatarCancel(event.session))} className={cx(secondaryBtn, "inline-flex items-center gap-1.5")}>
                  <X size={14} /> {t("Not now")}
                </button>
              </div>
            )}
          </div>
        )}

        {(event.stage === "posing" || event.stage === "done") && (
          <div className="px-4 pb-3.5 space-y-2">
            <div className="flex gap-1.5">
              {MOOD_ORDER.map((m) => (
                <div key={m} className="relative aspect-square flex-1 overflow-hidden rounded-xl bg-[#f1efeb]">
                  {moods[m] ? (
                    <img src={fileUrl(moods[m])} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-muted">
                      <Loader2 size={14} className="animate-spin" />
                    </span>
                  )}
                </div>
              ))}
            </div>
            {event.stage === "done" ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Check size={14} className="text-emerald-600" /> {t("Idle, working, waiting, happy, sorry — the face follows what {name} is doing.", { name })}
              </p>
            ) : (
              <p className="text-[12.5px] text-muted">{t("Four more pictures from the one you picked; this takes a minute or two.")}</p>
            )}
            {event.errors && event.errors.length > 0 && event.stage === "done" && <p className="text-[12px] text-muted">{t("Some poses could not be drawn and show the idle picture instead.")}</p>}
          </div>
        )}

        {(event.stage === "failed" || event.stage === "cancelled") && event.message && <p className="px-4 pb-3.5 text-[12.5px] text-muted">{t(event.message)}</p>}
      </div>
    </div>
  );
}
