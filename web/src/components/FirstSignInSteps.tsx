import { ArrowRight, HeartHandshake, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import { cx } from "../util";
import { inputCls, primaryBtn, secondaryBtn } from "./Form";

/**
 * Two short, skippable steps right after an account is *created* (the relay said
 * ``created: true``): a password, so the next device signs in without waiting for a code;
 * and the co-creation programme, which adds ¥10 to the allowance once. Both can be done or
 * undone later under Account. The flag lives in sessionStorage so a reload mid-way does not
 * lose the steps, and is cleared once they are done or skipped.
 */
const FLAG = "nm.cloud.first_sign_in";
const EVENT = "nm:first-sign-in";

/** Called by the sign-in form when the relay reports a new account. */
export function markFirstSignIn(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* storage may be off: the steps are simply not shown */
  }
  window.dispatchEvent(new Event(EVENT));
}

function clearFirstSignIn(): void {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function pending(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** True while the two steps are owed to a freshly created account. */
export function useFirstSignIn(): boolean {
  const [on, setOn] = useState(pending);
  useEffect(() => {
    const sync = () => setOn(pending());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return on;
}

export function FirstSignInSteps() {
  const t = useT();
  const { toast, refreshHub } = useStore();
  const [step, setStep] = useState<"password" | "contribute">("password");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bonus, setBonus] = useState<number | null>(null);
  useEffect(() => {
    // the relay's bonus figure, for the button; ¥10 when it has not said
    api
      .cloudMe()
      .then((me) => setBonus(me.spend?.contribute_bonus_cny ?? me.contribute?.bonus_cny ?? 10))
      .catch(() => setBonus(10));
  }, []);

  const done = async () => {
    clearFirstSignIn();
    await refreshHub().catch(() => undefined);
  };

  const setIt = async () => {
    if (password.length < 8 || password !== again) return;
    setBusy(true);
    setError(null);
    try {
      await api.cloudPassword(password);
      toast(t("Password set."));
      setPassword("");
      setAgain("");
      setStep("contribute");
    } catch (e) {
      setError(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.cloudContribute(true);
      toast(r.bonus_granted ? t("Joined — ¥{bonus} added to your allowance.", { bonus: String(r.bonus_cny ?? bonus ?? 10) }) : t("Joined the co-creation programme."));
      await done();
    } catch (e) {
      setError(t((e as Error).message));
      setBusy(false);
    }
  };

  const mismatch = again.length > 0 && again !== password;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true">
      <div className="safe-bottom w-full max-w-[520px] rounded-t-[28px] bg-bg p-6 shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex gap-1">
          <span className={cx("h-1.5 w-5 rounded-full bg-accent")} />
          <span className={cx("h-1.5 rounded-full transition-all", step === "contribute" ? "w-5 bg-accent" : "w-1.5 bg-border")} />
        </div>

        {step === "password" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void setIt();
            }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                <KeyRound size={20} />
              </span>
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{t("Set a password")}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{t("Your account is in. With a password, your phone and your other computers sign in at once, without waiting for a code. Optional — you can set one later under Account.")}</p>
              </div>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                placeholder={t("At least 8 characters")}
                className={inputCls}
              />
              <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" placeholder={t("Once more")} className={cx(inputCls, mismatch && "border-rose-400")} />
              {mismatch && <p className="text-[12px] text-rose-600 dark:text-rose-300">{t("The two do not match.")}</p>}
            </div>
            {error && <div className="rounded-2xl bg-rose-500/12 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">{error}</div>}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setStep("contribute")} className={secondaryBtn}>
                {t("Skip")}
              </button>
              <button type="submit" disabled={busy || password.length < 8 || password !== again} className={cx(primaryBtn, "flex-1 py-3")}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} {t("Set the password")} <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-300">
                <HeartHandshake size={20} />
              </span>
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">{t("Join the co-creation programme?")}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  {t("nanoMuse is built by its community. If you join, your conversations (messages and replies; pictures as a marker) help train the community's own open model, and ¥{n} is added to your allowance once. Never required, off by default; leave and delete what you gave at any time under Account.", {
                    n: String(bonus ?? 10),
                  })}
                </p>
              </div>
            </div>
            {error && <div className="rounded-2xl bg-rose-500/12 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">{error}</div>}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void done()} className={secondaryBtn}>
                {t("Not now")}
              </button>
              <button type="button" disabled={busy} onClick={() => void join()} className={cx(primaryBtn, "flex-1 py-3")}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} {t("Join, +¥{n}", { n: String(bonus ?? 10) })} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
