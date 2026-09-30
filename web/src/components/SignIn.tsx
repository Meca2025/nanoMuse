import { KeyRound, Loader2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { cx } from "../util";
import { inputCls, primaryBtn, secondaryBtn } from "./Form";

/**
 * Signing in to nanoMuse Cloud: a code sent to an e-mail address or a mobile number, or —
 * once one is set — the account password. The same form everywhere it is needed (first run,
 * the gate, the account screen); the key lands in the vault on the machine running nanoMuse.
 */
export function SignIn({
  onSignedIn,
  /** after signing in, make the relay the model provider as well */
  useAsModel = false,
  /** the button label for the final step */
  cta,
  autoFocus = true,
}: {
  onSignedIn: () => void | Promise<void>;
  useAsModel?: boolean;
  cta?: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<"code" | "password">("code");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"code" | "verify" | "login" | "model" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (useAsModel) {
      setBusy("model");
      try {
        await api.cloudUseAsModel();
      } catch {
        /* the account is in; the model can be picked in Connections */
      }
    }
    await onSignedIn();
  };

  const sendCode = async () => {
    const id = identifier.trim();
    if (!id) return;
    setBusy("code");
    setError(null);
    try {
      await api.cloudCode(id);
      setSent(true);
    } catch (e) {
      setError(t((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    const id = identifier.trim();
    if (!id || code.trim().length < 4) return;
    setBusy("verify");
    setError(null);
    try {
      await api.cloudVerify(id, code.trim());
      setCode("");
      setSent(false);
      await finish();
    } catch (e) {
      setError(t((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const login = async () => {
    const id = identifier.trim();
    if (!id || !password) return;
    setBusy("login");
    setError(null);
    try {
      await api.cloudLogin(id, password);
      setPassword("");
      await finish();
    } catch (e) {
      setError(t((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const submit = () => void (mode === "password" ? login() : sent ? verify() : sendCode());
  const label = cta ?? (useAsModel ? t("Sign in and use its model") : t("Sign in"));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2/70 p-1 text-[13px] font-medium">
        <ModeButton active={mode === "code"} onClick={() => setMode("code")} icon={<MessageSquareText size={14} />} label={t("With a code")} />
        <ModeButton active={mode === "password"} onClick={() => setMode("password")} icon={<KeyRound size={14} />} label={t("With a password")} />
      </div>
      <div>
        <label className="text-[12px] text-muted">{t("E-mail or mobile number")}</label>
        <input
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setSent(false);
          }}
          inputMode="email"
          autoComplete="username"
          autoFocus={autoFocus}
          placeholder="you@example.com"
          className={cx(inputCls, "mt-1")}
        />
      </div>
      {mode === "password" ? (
        <div>
          <label className="text-[12px] text-muted">{t("Password")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={cx(inputCls, "mt-1")}
          />
          <p className="mt-1.5 text-[12px] text-muted">{t("No password yet? Sign in with a code first, then set one under Account.")}</p>
        </div>
      ) : (
        sent && (
          <div>
            <label className="text-[12px] text-muted">{t("The code you received")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
              className={cx(inputCls, "mt-1 tracking-[0.3em]")}
            />
          </div>
        )
      )}
      {error && <div className="rounded-2xl bg-rose-500/12 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">{error}</div>}
      <div className="flex gap-2">
        {mode === "code" && sent ? (
          <>
            <button type="button" disabled={busy !== null} onClick={() => void sendCode()} className={secondaryBtn}>
              {t("Send again")}
            </button>
            <button type="submit" disabled={busy !== null || code.trim().length < 4} className={cx(primaryBtn, "flex-1 py-3")}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} {label}
            </button>
          </>
        ) : mode === "code" ? (
          <button type="submit" disabled={busy !== null || !identifier.trim()} className={cx(primaryBtn, "flex-1 py-3")}>
            {busy === "code" ? <Loader2 size={15} className="animate-spin" /> : null} {t("Send me a code")}
          </button>
        ) : (
          <button type="submit" disabled={busy !== null || !identifier.trim() || !password} className={cx(primaryBtn, "flex-1 py-3")}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} {label}
          </button>
        )}
      </div>
    </form>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx("flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 transition", active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
    >
      {icon} {label}
    </button>
  );
}
