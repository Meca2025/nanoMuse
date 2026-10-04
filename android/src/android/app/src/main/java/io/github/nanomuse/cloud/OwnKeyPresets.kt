package io.github.nanomuse.cloud

import com.openminis.app.data.model.ProviderType
import com.openminis.app.data.model.VoiceProviderTemplate

/**
 * "Use your own key": the vendors the app can pre-fill the provider form for, so that the
 * way on from a spent allowance is one tap plus a paste. Only the public endpoints are
 * written here; the key is the person's own.
 *
 * The form's pre-fill hook is the voice-template slot (name, protocol, base URL, `/v1`), so a
 * preset is expressed as one — with no models of its own, the vendor's list is fetched live.
 * Both vendors serve the app's two defaults (contract C4): `deepseek-v4.1-flash` for chat and
 * `qwen3.8-27b` for the hands (`deepseek/deepseek-v4.1-flash`, `qwen/qwen3.8-27b` on
 * OpenRouter); `Hands.screenModel` finds the latter by name once the list is in.
 *
 * Which one comes first is the region's call (contract C5, `Region`): 阿里云百炼 only signs up
 * accounts from mainland China, so outside it OpenRouter is the one to show first — and
 * OpenRouter also has a sign-in without a paste, `OpenRouterOAuthManager`.
 */
object OwnKeyPresets {
    /** Alibaba Cloud Bailian (阿里云百炼): OpenAI-compatible, one key for chat, pictures and video. */
    const val BAILIAN = "bailian"

    /** OpenRouter: one account, one key, most models, pay as you go; signs up anywhere. */
    const val OPENROUTER = "openrouter"

    /** Where a key is made (the console opens on the API-key page). */
    const val BAILIAN_KEY_URL = "https://bailian.console.aliyun.com/?apiKey=1"
    const val OPENROUTER_KEY_URL = "https://openrouter.ai/settings/keys"

    fun template(preset: String?): VoiceProviderTemplate? = when (preset?.trim()?.lowercase()) {
        BAILIAN -> VoiceProviderTemplate(
            id = BAILIAN,
            name = "阿里云百炼 Bailian",
            providerType = ProviderType.openAI,
            baseURL = "https://dashscope.aliyuncs.com/compatible-mode",
            appendV1 = true,
            capability = VoiceProviderTemplate.Capability.BOTH,
            baseURLMarkers = emptyList(),
            mockModels = emptyList(),
        )
        OPENROUTER -> VoiceProviderTemplate(
            id = OPENROUTER,
            name = "OpenRouter",
            providerType = ProviderType.openRouter,
            baseURL = "https://openrouter.ai/api",
            appendV1 = true,
            capability = VoiceProviderTemplate.Capability.BOTH,
            baseURLMarkers = emptyList(),
            mockModels = emptyList(),
        )
        else -> null
    }
}
