/**
 * The model slots as the web console shows them (the Models contract, 0.1.41): a row's
 * value as `<provider> · <model>`, and what the picker of one capability offers — the
 * nanoMuse Cloud group when signed in, the chat model's provider when it has the
 * capability (its key serves), then every catalogue provider that has it (a key to add).
 * Pure functions; `models.test.ts` checks them.
 */
import { CATALOGUE, providerName, providersFor, type Capability, type Region } from "./providers";
import type { CatalogueProvider, MediaSlotData } from "./types";

/** what the account's model is called when it stands in a provider list (the runtime's id) */
export const CLOUD_ID = "nanomuse_cloud";
/** the vault reference the runtime keeps the account key under; a slot set to the relay names it */
export const CLOUD_KEY_REF = "{{vault:NANOMUSE_CLOUD_KEY}}";
/** the picker's entry for a host the catalogue does not list */
export const CUSTOM_ID = "custom";
/** the protocols a slot's `provider` may be instead of a catalogue id */
const PROTOCOLS = ["openai", "openai_responses"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The catalogue entry a slot stands on: the id `provider` names, else the entry whose host
 * `baseUrl` is (a regional subdomain counts); null for a protocol with an unlisted host.
 */
export function entryFor(provider: string, baseUrl: string, list: CatalogueProvider[] = CATALOGUE): CatalogueProvider | null {
  if (provider && !PROTOCOLS.includes(provider)) return list.find((p) => p.id === provider) ?? null;
  const host = hostOf(baseUrl);
  if (!host) return null;
  const hosts = (p: CatalogueProvider) => [p.base_url, p.base_url_global].map((u) => hostOf(u ?? "")).filter(Boolean);
  const exact = list.find((p) => hosts(p).includes(host));
  if (exact) return exact;
  return (
    list.find((p) =>
      hosts(p).some((h) => {
        const dot = h.indexOf(".");
        return dot > 0 && host.endsWith(h.slice(dot));
      }),
    ) ?? null
  );
}

/** The name a provider id shows in a row: nanoMuse Cloud, the catalogue's name, or the host. */
export function providerLabel(id: string, locale: string, baseUrl = "", list: CatalogueProvider[] = CATALOGUE): string {
  if (id === CLOUD_ID) return "nanoMuse Cloud";
  const entry = list.find((p) => p.id === id);
  if (entry && id !== CUSTOM_ID) return providerName(entry, locale);
  return hostOf(baseUrl) || id;
}

/** A row's value, `<provider> · <model>`; "" when nothing draws. */
export function slotValue(slot: Pick<MediaSlotData, "effective_provider" | "effective_model" | "base_url">, locale: string, list: CatalogueProvider[] = CATALOGUE): string {
  if (!slot.effective_provider) return "";
  const name = providerLabel(slot.effective_provider, locale, slot.base_url, list);
  return slot.effective_model ? `${name} · ${slot.effective_model}` : name;
}

export interface MediaChoice {
  /** `nanomuse_cloud`, a catalogue id, or `custom` */
  value: string;
  label: string;
  group: "cloud" | "chat" | "add";
  /** a key must be typed (the chat provider's key serves its own slot; the account needs none) */
  needsKey: boolean;
  entry: CatalogueProvider | null;
}

/**
 * What the picker of one slot offers, in order: nanoMuse Cloud when signed in; the chat
 * model's provider when it is an own provider with the capability; then every catalogue
 * provider with the capability for the region (the chat provider not twice), and a host of
 * one's own last. A provider without the capability is not offered at all.
 */
export function mediaChoices(
  cap: Capability,
  opts: {
    signedIn: boolean;
    /** the chat slot: the relay (`cloud`), or an own provider by `provider` / `base_url` */
    chat: { provider: string; base_url: string; cloud: boolean };
    region: Region;
    locale: string;
    list?: CatalogueProvider[];
  },
): MediaChoice[] {
  const list = opts.list ?? CATALOGUE;
  const out: MediaChoice[] = [];
  if (opts.signedIn) out.push({ value: CLOUD_ID, label: "nanoMuse Cloud", group: "cloud", needsKey: false, entry: null });
  const chat = opts.chat.cloud ? null : entryFor(opts.chat.provider, opts.chat.base_url, list);
  if (chat && chat.capabilities.includes(cap)) {
    out.push({ value: chat.id, label: providerName(chat, opts.locale), group: "chat", needsKey: false, entry: chat });
  }
  for (const p of providersFor(opts.region, cap, list)) {
    if (p.id === chat?.id) continue;
    out.push({ value: p.id, label: providerName(p, opts.locale), group: "add", needsKey: true, entry: p });
  }
  out.push({ value: CUSTOM_ID, label: "", group: "add", needsKey: false, entry: null });
  return out;
}

/**
 * The picker's value for a slot as the runtime reports it: "" for nothing chosen, the
 * relay when the slot names its URL, the catalogue id, else `custom`.
 */
export function currentChoice(slot: MediaSlotData, cloudBaseUrl: string): string {
  if (!slot.configured) return "";
  if (cloudBaseUrl && slot.base_url && hostOf(slot.base_url) === hostOf(cloudBaseUrl)) return CLOUD_ID;
  return slot.provider_id || CUSTOM_ID;
}
