import { Cloud, Hand, MonitorSmartphone, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "../components/Avatar";
import { CommunityNotice } from "../components/CommunityNotice";
import { SignIn } from "../components/SignIn";
import { useT } from "../i18n";
import { useStore } from "../store";

/**
 * The door: this runtime insists on a nanoMuse Cloud account (cloud.required, the default),
 * so before anything else the person signs in — a code the first time, the password once
 * one is set. What comes with it is said plainly; the choice between the Cloud model and
 * a key of their own follows in setup.
 */
export function SignInGate() {
  const { state, refreshSettings, refreshHub, toast } = useStore();
  const t = useT();
  const name = state.profile?.name ?? "nanoMuse";
  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[760px] flex-col overflow-hidden bg-bg sm:border-x sm:border-border">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] bg-[radial-gradient(ellipse_at_top,rgba(0,100,212,0.18),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(23,147,255,0.22),transparent_65%)]" />
      <div className="relative flex-1 overflow-y-auto px-6 pb-8">
        <div className="safe-top flex flex-col items-center pt-14 text-center">
          <div className="rounded-full bg-surface p-3 shadow-[0_20px_60px_-24px_rgba(0,100,212,0.55)]">
            <Avatar profile={state.profile} size={88} still />
          </div>
          <h1 className="mt-6 text-[28px] font-bold tracking-tight">{t("Sign in to {name}", { name })}</h1>
          <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">{t("One free account. It is what lets your phone and computers work as one and brings a model to start with.")}</p>
        </div>

        <div className="mt-8 rounded-[28px] border border-border/70 bg-surface p-5 shadow-sm">
          <SignIn
            onSignedIn={async () => {
              toast(t("Signed in to nanoMuse Cloud."));
              await Promise.all([refreshSettings(), refreshHub()]);
            }}
          />
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-2 text-[12.5px]">
          <Perk icon={<MonitorSmartphone size={15} />} text={t("Every device of yours, one nanoMuse")} />
          <Perk icon={<Cloud size={15} />} text={t("A model with a daily allowance, or your own key")} />
          <Perk icon={<Hand size={15} />} text={t("It uses your phone and computers for you")} />
          <Perk icon={<ShieldCheck size={15} />} text={t("Keys in your vault; nothing you say is kept on the relay")} />
        </ul>
        <CommunityNotice compact className="mt-6" />
        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
          {t("The relay keeps an account id, a masked identifier and usage counts — no message content.")}
          <br />
          {t("Running it yourself without an account? Set cloud.required to false.")}
        </p>
      </div>
    </div>
  );
}

function Perk({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-2xl bg-surface-2/60 px-3 py-2.5 text-fg/80">
      <span className="mt-0.5 text-accent">{icon}</span>
      <span className="leading-snug">{text}</span>
    </li>
  );
}
