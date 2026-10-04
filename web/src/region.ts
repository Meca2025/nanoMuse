/**
 * Where the person is, for the "ways on" copy (contract C5): mainland China gets Alibaba
 * Cloud Bailian first (its console only signs up accounts from the mainland); everyone
 * else gets OpenRouter first — one account, one key, pay as you go.
 *
 * Mainland = the UI language is 简体中文, or the account was signed in with a phone
 * number (codes reach mainland numbers only), or the relay says `region: "cn"`. A relay
 * that does not say yet is fine: the other two signs still work.
 */
import { getLocale } from "./i18n";
import type { CloudAccount, ProviderPreset } from "./types";

export function isMainland(account?: Pick<CloudAccount, "channel" | "region" | "signed_in"> | null): boolean {
  if (account?.region) return account.region === "cn";
  if (account?.signed_in && account.channel === "sms") return true;
  return getLocale() === "zh-CN";
}

export interface OwnKeyWay {
  /** the preset id in Connections: "qwen" (Bailian) or "openrouter" */
  preset: "qwen" | "openrouter";
  label: string;
  keyUrl: string;
  baseUrl: string;
  chatModel: string;
  guiModel: string;
}

const BAILIAN: OwnKeyWay = {
  preset: "qwen",
  label: "Alibaba Cloud Bailian",
  keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  chatModel: "deepseek-v4.1-flash",
  guiModel: "qwen3.8-27b",
};

const OPENROUTER: OwnKeyWay = {
  preset: "openrouter",
  label: "OpenRouter",
  keyUrl: "https://openrouter.ai/keys",
  baseUrl: "https://openrouter.ai/api/v1",
  chatModel: "deepseek/deepseek-v4.1-flash",
  guiModel: "qwen/qwen3.8-27b",
};

/** The own-key provider to lead with for this person. */
export function ownKeyWay(account?: Pick<CloudAccount, "channel" | "region" | "signed_in"> | null): OwnKeyWay {
  return isMainland(account) ? BAILIAN : OPENROUTER;
}

/**
 * The one sentence under "Use your own model key" (contract C5). English first, then
 * 简体中文 through the dictionary.
 */
export function ownKeyLine(t: (s: string) => string, account?: Pick<CloudAccount, "channel" | "region" | "signed_in"> | null): string {
  return isMainland(account)
    ? t("Alibaba Cloud Bailian is a good start: a new account comes with a free quota, set-up takes about two minutes, and one key covers chat, pictures and video.")
    : t("Alibaba Cloud Bailian only signs up accounts from mainland China. Outside, OpenRouter is the easy way: one account, one key, pay as you go.");
}

/** Whether a model id says it sees pictures (the runtime's rule, mirrored for the pickers). */
export function modelSees(id: string): boolean | null {
  const name = (id || "").toLowerCase().split("/").pop() ?? "";
  if (!name) return null;
  if (name.startsWith("deepseek")) return /v4\.1|vision|ocr/.test(name);
  if (name.startsWith("qwen")) return name.includes("-vl") || name.startsWith("qwen3.8") ? true : null;
  return null;
}

/** The presets in the order to show them: the region's own-key provider first. */
export function orderPresets(ids: string[], presets: Record<string, ProviderPreset>, account?: Pick<CloudAccount, "channel" | "region" | "signed_in"> | null): string[] {
  const first = ownKeyWay(account).preset;
  if (!ids.includes(first)) return ids;
  const mainland = isMainland(account);
  // outside the mainland, the mainland-only vendor goes last in its group
  const rest = ids.filter((id) => id !== first);
  if (mainland) return [first, ...rest];
  const cn = rest.filter((id) => presets[id]?.region === "cn");
  return [first, ...rest.filter((id) => !cn.includes(id)), ...cn];
}
