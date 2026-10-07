import { describe, expect, it } from "vitest";
import { CLOUD_ID, currentChoice, entryFor, mediaChoices, providerLabel, slotValue } from "./models";
import type { MediaSlotData } from "./types";

const BAILIAN = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function slot(over: Partial<MediaSlotData>): MediaSlotData {
  return {
    provider: "",
    provider_id: "",
    model: "",
    base_url: "",
    key_source: "none",
    configured: false,
    from_app: false,
    effective_provider: "",
    effective_model: "",
    effective_source: "",
    ...over,
  };
}

describe("the model slots (the Models contract)", () => {
  it("finds the catalogue entry a slot stands on, by id or by host", () => {
    expect(entryFor("bailian", "")?.id).toBe("bailian");
    expect(entryFor("openai", BAILIAN)?.id).toBe("bailian");
    expect(entryFor("openai", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")?.id).toBe("bailian");
    expect(entryFor("openai", "https://api.openai.com/v1")?.id).toBe("openai");
    expect(entryFor("openai", "https://gateway.example.com/v1")).toBeNull();
    expect(entryFor("openai", "")).toBeNull();
  });

  it("writes a row's value as provider · model", () => {
    expect(slotValue(slot({ effective_provider: CLOUD_ID, effective_model: "qwen-image-3.0" }), "en")).toBe("nanoMuse Cloud · qwen-image-3.0");
    expect(slotValue(slot({ effective_provider: "zhipu", effective_model: "glm-image" }), "zh-CN")).toBe("智谱 GLM · glm-image");
    expect(slotValue(slot({ effective_provider: "zhipu", effective_model: "glm-image" }), "en")).toBe("Zhipu GLM · glm-image");
    expect(slotValue(slot({ effective_provider: "custom", effective_model: "flux-2", base_url: "https://images.example.com/v1" }), "en")).toBe(
      "images.example.com · flux-2",
    );
    expect(slotValue(slot({}), "en")).toBe("");
    expect(providerLabel("nope", "en")).toBe("nope");
  });

  it("offers only providers with the capability: the account, the chat provider, then the rest", () => {
    const chat = { provider: "openai", base_url: BAILIAN, cloud: false };
    const video = mediaChoices("video", { signedIn: true, chat, region: "cn", locale: "en" });
    expect(video.map((c) => [c.value, c.group, c.needsKey])).toEqual([
      [CLOUD_ID, "cloud", false],
      ["bailian", "chat", false],
      ["custom", "add", false],
    ]);
    // signed out, a chat provider without the capability: the catalogue's own only
    const deepseek = { provider: "openai", base_url: "https://api.deepseek.com", cloud: false };
    const image = mediaChoices("image", { signedIn: false, chat: deepseek, region: "global", locale: "en" });
    expect(image.find((c) => c.value === CLOUD_ID)).toBeUndefined();
    expect(image.find((c) => c.group === "chat")).toBeUndefined();
    expect(image.filter((c) => c.group === "add" && c.entry).every((c) => c.entry?.capabilities.includes("image"))).toBe(true);
    expect(image.slice(0, 2).map((c) => c.value)).toEqual(["openrouter", "openai"]);
    expect(image.every((c) => c.value !== "deepseek")).toBe(true);
    // the relay as the chat model is not an own provider; nothing in the chat group
    const cloud = mediaChoices("video", { signedIn: true, chat: { provider: "openai", base_url: "https://relay.example/v1", cloud: true }, region: "global", locale: "en" });
    expect(cloud.map((c) => c.value)).toEqual([CLOUD_ID, "custom"]);
  });

  it("reads the picker's value back from what the runtime reports", () => {
    expect(currentChoice(slot({}), "https://relay.example/v1")).toBe("");
    expect(currentChoice(slot({ configured: true, provider: "zhipu", provider_id: "zhipu" }), "")).toBe("zhipu");
    expect(currentChoice(slot({ configured: true, provider: "openai", base_url: "https://relay.example/v1" }), "https://relay.example/v1")).toBe(CLOUD_ID);
    expect(currentChoice(slot({ configured: true, provider: "openai", base_url: "https://images.example.com/v1" }), "")).toBe("custom");
  });
});
