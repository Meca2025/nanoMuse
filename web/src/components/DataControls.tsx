import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useStore } from "../store";
import type { CloudMe } from "../types";
import { cx } from "../util";
import { MuseCaption, MuseCard, MuseDivider, MuseRow, MuseSwitchRow } from "./MuseList";

/** The policy the apps link when the relay has not said where its own is. */
export const PRIVACY_URL = "https://nanomuse.cn/privacy/";

/**
 * Settings → Data controls, in the shape of Muse's: one switch, *Help improve nanoMuse's AI
 * models*, with what it means written under it in full — what the relay keeps while it is
 * on (what you wrote, what the model answered, the tool calls it chose), what it never
 * keeps (the system prompt, tool results, pictures, who you are), the relay's default for
 * new accounts, how many turns are kept so far — and the delete. It applies to the nanoMuse
 * Cloud account only: with your own key nothing passes through the relay, and the switch is
 * shown but cannot be moved until you sign in.
 */
export function DataControls({ me: given, onChanged, flush = false }: { me?: CloudMe | null; onChanged?: () => void; /** the parent already pads 16px: pull the cards out to its edge */ flush?: boolean }) {
  const t = useT();
  const { state, toast } = useStore();
  const signedIn = !!state.hub?.account.signed_in;
  const [loaded, setLoaded] = useState<CloudMe | null>(null);
  const [busy, setBusy] = useState(false);
  const me = given ?? loaded;

  const load = async () => {
    if (!signedIn || given) return;
    try {
      setLoaded(await api.cloudMe());
    } catch {
      /* offline: the switch stays as it was */
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, given]);

  const ct = me?.contribute ?? { on: false, samples: 0 };
  const samples = ct.samples ?? 0;
  const privacy = ct.privacy_url || PRIVACY_URL;

  const flip = async (on: boolean) => {
    setBusy(true);
    try {
      await api.cloudContribute(on);
      toast(on ? t("On. Turn it off here at any time.") : t("Off. Nothing more is kept."));
      if (given) onChanged?.();
      else await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const wipe = async () => {
    if (!window.confirm(t("The kept conversations are removed from the server. This cannot be undone."))) return;
    setBusy(true);
    try {
      const r = await api.cloudDeleteSamples();
      toast(t("{n} turns deleted", { n: String(r.deleted) }));
      if (given) onChanged?.();
      else await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx(flush && "-mx-4")}>
      <MuseCard>
        <MuseSwitchRow label={t("Help improve nanoMuse's AI models")} checked={signedIn && ct.on} disabled={busy || !signedIn || !me} onChange={(v) => void flip(v)} />
      </MuseCard>
      <MuseCaption>
        {t(
          "While this is on, the text of your chats with the nanoMuse Cloud models — what you wrote, what it answered and the tools it chose to call — is kept on the relay to train the community's own open model. Not your memory or SOUL (the system prompt), not what tools returned, not pictures, and never next to who you are. Your own API key never passes through the relay.",
        )}{" "}
        {!signedIn
          ? t("Sign in to nanoMuse Cloud to use it.")
          : ct.default_on !== undefined && (ct.default_on ? t("New accounts start with it on.") : t("New accounts start with it off."))}{" "}
        {signedIn && samples > 0 && t("{n} turns kept so far.", { n: String(samples) })}{" "}
        <a href={privacy} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
          {t("Privacy policy")}
        </a>
      </MuseCaption>
      {signedIn && samples > 0 && (
        <MuseCard className="mt-3">
          <MuseRow icon={busy ? <Loader2 size={22} className="animate-spin" /> : <Trash2 size={22} />} label={t("Delete the kept conversations")} value={t("{n} turns", { n: String(samples) })} onClick={() => void wipe()} chevron={false} />
          <MuseDivider inset={16} />
          <MuseCaption className="px-4 pb-2.5 pt-2">{t("Removes every turn kept from this account, whether the switch is on or off now. Turning the switch off keeps what was kept until you delete it here.")}</MuseCaption>
        </MuseCard>
      )}
    </div>
  );
}
