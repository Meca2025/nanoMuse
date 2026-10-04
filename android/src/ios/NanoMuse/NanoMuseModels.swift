//
//  NanoMuseModels.swift
//  nanoMuse
//
//  Which model answers, and how a pick sticks (contract C4): the relay's
//  menu says `for: ["chat"] | ["gui"] | ["chat","gui"]`; the chat opens on
//  `deepseek-v4.1-flash`; a model picked in the chat's picker moves to the
//  front of the nanoMuse Cloud group so new chats follow it. Own-key
//  presets for Alibaba Cloud Bailian and OpenRouter, and whether a model
//  sees pictures judged from its name when nobody said.
//  Android: cloud/NanoMuseCloud.kt (followPick, recommendedChat),
//  cloud/OwnKeyPresets.kt, chat/VisionFamilies.kt.
//

import Foundation
import SwiftUI

// MARK: - The relay's menu (pure, tested)

enum NanoMuseModelMenu {
    static let defaultChatModel = "deepseek-v4.1-flash"
    static let defaultGuiModel = "qwen3.8-27b"

    /// The relay's `for` on a menu entry — under `nanomuse` with its other flags (relay 0.17),
    /// a top-level `for` read too; nil when it did not say (a relay from before 0.17).
    static func lanes(_ model: [String: Any]) -> [String]? {
        ((model["nanomuse"] as? [String: Any])?["for"] as? [String]) ?? (model["for"] as? [String])
    }

    static func isRecommended(_ model: [String: Any]) -> Bool {
        ((model["nanomuse"] as? [String: Any])?["recommended"] as? Bool) == true
    }

    /// The lanes the relay recommends the model in (`nanomuse.recommended_for`); nil when it did not say.
    static func recommendedLanes(_ model: [String: Any]) -> [String]? {
        (model["nanomuse"] as? [String: Any])?["recommended_for"] as? [String]
    }

    static func forChat(_ model: [String: Any]) -> Bool {
        lanes(model)?.contains("chat") != false
    }

    static func drawsOnly(_ model: [String: Any]) -> Bool {
        let arch = model["architecture"] as? [String: Any]
        let outputs = arch?["output_modalities"] as? [String] ?? []
        return outputs.contains("image") && !outputs.contains("text")
    }

    /// The chat model the menu opens on: the one recommended *for chat* (`recommended_for`, else
    /// a recommended one that is not hands-only), then the recommended one, then the known
    /// default by name, then the first chat model.
    static func recommendedChat(_ models: [[String: Any]]) -> [String: Any]? {
        let chats = models.filter { !drawsOnly($0) }
        return chats.first { recommendedLanes($0)?.contains("chat") == true }
            ?? chats.first { isRecommended($0) && forChat($0) && lanes($0)?.contains("gui") != true }
            ?? chats.first { isRecommended($0) && forChat($0) }
            ?? chats.first { ($0["id"] as? String) == defaultChatModel }
            ?? chats.first { forChat($0) }
    }

    /// The model for looking at a screen: the one recommended for `gui`, else any `for: ["gui"]`,
    /// else the known default by name.
    static func guiModel(_ models: [[String: Any]]) -> String? {
        (models.first { recommendedLanes($0)?.contains("gui") == true }?["id"] as? String)
            ?? (models.first { lanes($0)?.contains("gui") == true }?["id"] as? String)
            ?? (models.first { ($0["id"] as? String) == defaultGuiModel }?["id"] as? String)
    }

    // MARK: Following the pick

    private static var observer: NSObjectProtocol?

    /// Start moving a pick made in the chat's picker to the front of the Cloud group.
    @MainActor
    static func startFollowingPicks() {
        guard observer == nil else { return }
        observer = NotificationCenter.default.addObserver(forName: .sessionModelBindingChanged, object: nil, queue: .main) { note in
            guard let sid = note.userInfo?["sessionId"] as? String else { return }
            Task { @MainActor in
                guard let binding = ProviderConfigStore.shared.binding(for: sid) else { return }
                let entryId: String
                switch binding.primarySource {
                case .group(_, let resolved): entryId = resolved
                case .directEntry(let id, _): entryId = id
                }
                NanoMuseCloud.followPick(entryId: entryId)
            }
        }
    }
}

extension NanoMuseCloud {
    /// The picker's binding is per chat and a new chat starts from the default group — ours,
    /// with the recommended model first — so a choice made in the picker was undone by the
    /// next "New chat". Moving the pick to the front of our group makes it stick; a group of
    /// the person's own is never touched. True when new chats will follow the pick.
    @discardableResult
    static func followPick(entryId: String) -> Bool {
        let store = ProviderConfigStore.shared
        guard let inst = instance, let entry = store.entry(for: entryId), entry.providerInstanceId == inst.id else { return false }
        let modalities = entry.model.capabilities.supportedModalities
        if !modalities.contains(.textOutput) && (modalities.contains(.imageOutput) || modalities.contains(.videoOutput)) { return false }
        if NanoMuseImageGen.drawsNatively(entry.model.id) { return false }
        guard let group = store.modelGroups.first(where: { $0.id == store.defaultPrimaryGroupId && $0.name == label }) else { return false }
        if group.memberEntryIds.first == entryId { return true }
        var g = group
        g.memberEntryIds = [entryId] + group.memberEntryIds.filter { $0 != entryId }
        store.updateGroup(g)
        return true
    }
}

// MARK: - Vision (pure, tested)

enum NanoMuseVision {
    /// Names that mean text only however the rest of the name reads.
    private static let textOnly = [
        "embed", "whisper", "tts", "rerank", "moderation", "transcri", "speech",
        "-coder", "codestral", "deepseek-chat", "deepseek-reasoner", "deepseek-v3", "deepseek-r1",
        "qwen2.5-", "qwen2-", "qwen1.5", "qwq", "qwen-long", "qwen-math", "qwen-coder", "qwen3-coder", "qwen3-235b", "qwen3-32b", "qwen3-30b", "qwen3-14b", "qwen3-8b", "qwen3-4b",
        "llama-3", "llama3", "mistral-7b", "mixtral", "phi-", "gemma-2", "gemma2", "glm-4-", "glm-4.5-air", "glm-4.6", "glm-4.7",
        "text-", "davinci", "babbage", "kimi-k2-", "kimi-k2.1", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k",
        "minimax-m", "minimax-text", "abab", "hunyuan-lite", "hunyuan-turbo", "ernie-speed", "ernie-lite",
    ]

    /// Families that see. Checked after `textOnly`, so `qwen2.5-vl` still passes via "-vl".
    private static let sees = [
        "kimi-vl", "glm-4v", "glm-4.5v", "glm-4.6v", "glm-5",
        "qwen3", "qwen-max", "qwen-plus", "qwen-turbo", "qwen-flash", "qvq",
        "gpt-4o", "gpt-4.1", "gpt-4.5", "gpt-5", "gpt-4-turbo", "chatgpt-4o",
        "claude-3", "claude-4", "claude-opus", "claude-sonnet", "claude-haiku",
        "gemini", "gemma-3", "gemma3", "grok-2-vision", "grok-3", "grok-4",
        "llama-4", "llama4", "mistral-medium", "mistral-large-2", "mistral-small-3", "magistral",
        "minimax-h", "minimax-vl", "kimi-k2.5", "kimi-k3", "doubao-seed", "doubao-1.5-vision", "doubao-1.6", "seed-1",
        "step-1v", "step-1o", "step-3", "hunyuan-vision", "hunyuan-t1", "hunyuan-large-vision", "ernie-4.5",
    ]

    private static let oSeries = try! NSRegularExpression(pattern: "(^|[^a-z0-9])o[134](?=$|[^a-z0-9])")
    private static let deepSeekVersion = try! NSRegularExpression(pattern: "v(\\d+)(?:\\.(\\d+))?")

    /// DeepSeek's rule (contract C4): text only unless the id names a version from `v4.1` on,
    /// or says `vision` / `ocr`. Nil when the id is not DeepSeek's.
    static func deepSeekSees(_ hay: String) -> Bool? {
        guard hay.contains("deepseek") else { return nil }
        if hay.contains("vision") || hay.contains("ocr") { return true }
        let ns = hay as NSString
        guard let m = deepSeekVersion.firstMatch(in: hay, range: NSRange(location: 0, length: ns.length)) else { return false }
        let major = Int(ns.substring(with: m.range(at: 1))) ?? 0
        let minor = m.range(at: 2).location == NSNotFound ? 0 : (Int(ns.substring(with: m.range(at: 2))) ?? 0)
        return major > 4 || (major == 4 && minor >= 1)
    }

    static func looksLikeItSees(id: String, displayName: String = "") -> Bool {
        let hay = (id + " " + displayName).lowercased()
        if ["-vl", "vl-", "vision", "omni", "llava", "pixtral", "internvl"].contains(where: { hay.contains($0) }) { return true }
        if let ds = deepSeekSees(hay) { return ds }
        if textOnly.contains(where: { hay.contains($0) }) { return false }
        if sees.contains(where: { hay.contains($0) }) { return true }
        return oSeries.firstMatch(in: hay, range: NSRange(location: 0, length: (hay as NSString).length)) != nil
    }

    /// What to assume when neither the provider nor models.dev said: `.vision` for a family that
    /// sees, `.textOnly` for a DeepSeek id the rule says is text-only, nil to leave the provider's default.
    static func guess(id: String, displayName: String = "") -> ModelModality? {
        let hay = (id + " " + displayName).lowercased()
        if let ds = deepSeekSees(hay) { return ds ? .vision : .textOnly }
        return looksLikeItSees(id: id, displayName: displayName) ? .vision : nil
    }
}

// MARK: - Own-key presets

enum NanoMuseOwnKeyPreset: String, CaseIterable, Identifiable {
    case bailian, openrouter
    var id: String { rawValue }

    var label: String {
        switch self {
        case .bailian: return "阿里云百炼 Bailian"
        case .openrouter: return "OpenRouter"
        }
    }

    var providerType: ProviderType {
        switch self {
        case .bailian: return .openAI
        case .openrouter: return .openRouter
        }
    }

    var baseURL: String {
        switch self {
        case .bailian: return "https://dashscope.aliyuncs.com/compatible-mode"
        case .openrouter: return "https://openrouter.ai/api"
        }
    }

    /// Where a key is made.
    var keyURL: URL {
        switch self {
        case .bailian: return URL(string: "https://bailian.console.aliyun.com/?apiKey=1")!
        case .openrouter: return URL(string: "https://openrouter.ai/settings/keys")!
        }
    }

    var chatModel: String {
        switch self {
        case .bailian: return NanoMuseModelMenu.defaultChatModel
        case .openrouter: return "deepseek/" + NanoMuseModelMenu.defaultChatModel
        }
    }

    var guiModel: String {
        switch self {
        case .bailian: return NanoMuseModelMenu.defaultGuiModel
        case .openrouter: return "qwen/" + NanoMuseModelMenu.defaultGuiModel
        }
    }

    var blurb: String {
        switch self {
        case .bailian: return AppLocalized("One key for chat, pictures and video. Signs up accounts from mainland China.")
        case .openrouter: return AppLocalized("One account, one key, most models, pay as you go. Signs up anywhere.")
        }
    }

    /// Bailian first for people in mainland China; OpenRouter first elsewhere (contract C5).
    @MainActor
    static var ordered: [NanoMuseOwnKeyPreset] {
        NanoMuseRegion.isMainland ? [.bailian, .openrouter] : [.openrouter, .bailian]
    }

    /// Mainland: "Outside, OpenRouter is the easy way"; elsewhere the same sentence, since it is true everywhere.
    static let regionNote = AppLocalized("Alibaba Cloud Bailian only signs up accounts from mainland China. Outside, OpenRouter is the easy way: one account, one key, pay as you go.")

    /// The instance of this preset already on the phone, if any.
    @MainActor
    var existingInstance: ProviderInstance? {
        let cloudId = NanoMuseCloud.instance?.id
        return ProviderConfigStore.shared.instances.first { inst in
            inst.id != cloudId && inst.providerType == providerType && (self == .openrouter || NanoMuseImageGen.speaksDashScope(inst.customBaseURL ?? ""))
        }
    }

    /// Add the provider with a pasted key, fetch its models, make the chat default the group's first.
    @MainActor
    @discardableResult
    func install(apiKey: String) async -> ProviderInstance? {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return nil }
        let store = ProviderConfigStore.shared
        let inst: ProviderInstance
        if let existing = existingInstance {
            inst = existing
        } else {
            inst = ProviderInstance(label: label, providerType: providerType, credentialType: .apiKey, customBaseURL: baseURL, appendV1Suffix: true)
            ProviderKeychainHelper.saveAPIKey(key, instanceId: inst.id)
            store.addInstance(inst)
        }
        ProviderKeychainHelper.saveAPIKey(key, instanceId: inst.id)
        await store.refreshModels(for: inst)
        adoptDefaults(inst)
        return inst
    }

    /// OpenRouter's sign-in without a paste: the OAuth flow leaves a key in the keychain.
    @MainActor
    func signInOpenRouter() async throws -> ProviderInstance? {
        guard self == .openrouter else { return nil }
        let store = ProviderConfigStore.shared
        let inst = existingInstance ?? {
            let fresh = ProviderInstance(label: label, providerType: .openRouter, credentialType: .oauth)
            store.addInstance(fresh)
            return fresh
        }()
        try await OpenRouterOAuthManager.shared.login(instanceId: inst.id)
        await store.refreshModels(for: inst)
        adoptDefaults(inst)
        return inst
    }

    /// A group named after the preset with the chat default first (only if none of ours exists);
    /// the default group is set when the person had none; Bailian also becomes the face's image route.
    @MainActor
    private func adoptDefaults(_ inst: ProviderInstance) {
        let store = ProviderConfigStore.shared
        let entries = store.entries(for: inst.id).filter { !$0.isHidden }
        let chat = entries.first { $0.model.id == chatModel }
            ?? entries.first { $0.model.id.lowercased().contains("deepseek") && NanoMuseVision.deepSeekSees($0.model.id.lowercased()) == true }
            ?? entries.first { !NanoMuseImageGen.drawsNatively($0.model.id) && $0.model.capabilities.supportedModalities.contains(.textOutput) }
        if let chat, !store.modelGroups.contains(where: { $0.memberEntryIds.contains(chat.id) }) {
            let group = ModelGroup(name: label, memberEntryIds: [chat.id])
            store.addGroup(group)
            if store.defaultPrimaryGroupId == nil { store.defaultPrimaryGroupId = group.id }
        }
        // Bailian draws too: the face's pictures come from this key from now on.
        if self == .bailian {
            NanoMuseImageGen.save(instanceId: inst.id, model: NanoMuseImageGen.suggestedModel(for: inst))
        }
    }
}

// MARK: - "Use your own key" sheet

/// Pick a vendor, paste the key (or sign in, for OpenRouter), done. Order follows the region.
struct NanoMuseOwnKeySheet: View {
    var onDone: (ProviderInstance?) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var preset: NanoMuseOwnKeyPreset = .openrouter
    @State private var key = ""
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(NanoMuseOwnKeyPreset.ordered) { p in
                        Button {
                            preset = p
                            message = nil
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: preset == p ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(preset == p ? NanoMuseTones.action : Color.secondary)
                                    .padding(.top, 2)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(p.label).font(.body.weight(.medium)).foregroundStyle(.primary)
                                    Text(p.blurb).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } footer: {
                    Text(NanoMuseOwnKeyPreset.regionNote)
                }
                Section {
                    if preset == .openrouter {
                        Button {
                            Task { await signIn() }
                        } label: {
                            HStack {
                                Label(AppLocalized("Sign in with OpenRouter"), systemImage: "person.crop.circle.badge.checkmark")
                                if busy { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(busy)
                    }
                    SecureField(AppLocalized("Paste the API key"), text: $key)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(busy)
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Text(AppLocalized("Use this key"))
                            if busy { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(busy || key.trimmingCharacters(in: .whitespaces).isEmpty)
                    Button {
                        openURL(preset.keyURL)
                    } label: {
                        Label(AppLocalized("Get a key"), systemImage: "arrow.up.right.square")
                    }
                } header: {
                    Text(preset.label)
                } footer: {
                    if let message {
                        Text(message).foregroundStyle(.red)
                    } else {
                        Text(String(format: AppLocalized("The key stays on this phone and is sent only to %@. Chat opens on %@; the hands use %@."), preset.label, preset.chatModel, preset.guiModel))
                    }
                }
            }
            .navigationTitle(AppLocalized("Use your own key"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(AppLocalized("Cancel")) { dismiss() } }
            }
            .onAppear {
                // Bailian first in mainland China, OpenRouter first elsewhere (contract C5).
                if let first = NanoMuseOwnKeyPreset.ordered.first { preset = first }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let inst = await preset.install(apiKey: key)
        if inst == nil {
            message = AppLocalized("Nothing to add")
            return
        }
        onDone(inst)
        dismiss()
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            let inst = try await preset.signInOpenRouter()
            onDone(inst)
            dismiss()
        } catch {
            message = error.localizedDescription
        }
    }
}
