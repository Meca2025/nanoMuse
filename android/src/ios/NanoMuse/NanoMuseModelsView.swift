//
//  NanoMuseModelsView.swift
//  nanoMuse
//
//  Settings › Models (0.1.41 "Choice"): the four slots as four rows, each saying which
//  provider and model holds it; a picker per slot, grouped nanoMuse Cloud first and then
//  one group per provider of the person's own; "Add a provider" at the bottom. The
//  "Use it for" card that follows a saved key lives here too. Android: ui/models/
//  ModelsScreen.kt and UseItForSheet.kt; desktop: client/ModelsPage.tsx.
//

import SwiftUI

// MARK: - The page

struct NanoMuseModelsView: View {
    @State private var providers: [NanoMuseSlotProvider] = []
    @State private var lines: [NanoMuseSlot: String] = [:]
    @State private var videoOff = false
    @State private var chatChanged = false
    @State private var adding = false

    var body: some View {
        NanoMusePage(title: AppLocalized("Models")) {
            NanoMuseCard {
                ForEach(Array(NanoMuseSlot.allCases.enumerated()), id: \.element) { index, slot in
                    if index > 0 { NanoMuseRowDivider() }
                    row(slot)
                }
            }
            if chatChanged {
                NanoMuseCaption(text: AppLocalized("Applies to new chats."))
            }
            NanoMuseCard {
                NanoMuseActionRow(title: AppLocalized("Add a provider"), titleColor: NanoMuseTones.action, chevron: false) { adding = true }
            }
        }
        .task {
            reload()
            if NanoMuseCloud.isSignedIn, await NanoMuseRelayMenu.refresh() != nil { reload() }
        }
        .onReceive(NotificationCenter.default.publisher(for: NanoMuseModelSlots.changed)) { _ in reload() }
        .onReceive(NotificationCenter.default.publisher(for: NanoMuseMediaModels.changed)) { _ in reload() }
        .onReceive(NotificationCenter.default.publisher(for: .sessionModelBindingChanged)) { _ in reload() }
        .sheet(isPresented: $adding) {
            NanoMuseOwnKeySheet { _ in reload() }
        }
    }

    @ViewBuilder
    private func row(_ slot: NanoMuseSlot) -> some View {
        if slot == .hands {
            NanoMuseSlotRow(slot: slot, value: AppLocalized("Not on iPhone"), chevron: false)
                .opacity(0.55)
        } else {
            NavigationLink {
                NanoMuseSlotPickerView(slot: slot) {
                    if slot == .chat { chatChanged = true }
                    reload()
                }
            } label: {
                NanoMuseSlotRow(slot: slot, value: value(slot), chevron: true)
            }
            .buttonStyle(.plain)
        }
    }

    private func value(_ slot: NanoMuseSlot) -> String {
        if slot == .video, videoOff { return AppLocalized("Off") }
        return lines[slot] ?? AppLocalized("No model yet")
    }

    private func reload() {
        let list = NanoMuseModelSlots.providers()
        providers = list
        var next: [NanoMuseSlot: String] = [:]
        for slot in NanoMuseSlot.allCases {
            if let line = NanoMuseModelSlots.line(slot, providers: list) { next[slot] = line }
        }
        lines = next
        videoOff = NanoMuseMediaModels.videoChoice() == .off
    }
}

/// One slot's row: the title and what it does on the left, the provider and model on the right.
private struct NanoMuseSlotRow: View {
    let slot: NanoMuseSlot
    let value: String
    let chevron: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: slot.symbol)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(slot.title)
                    .font(.body)
                    .foregroundStyle(.primary)
                Text(slot.subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
                .truncationMode(.middle)
                .layoutPriority(-1)
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }
}

// MARK: - The picker for one slot

/// The models that can hold `slot`: nanoMuse Cloud's group first when signed in (the relay's
/// recommended one marked), then one group per provider of the person's own that covers the
/// slot. A tap sets the slot and goes back.
struct NanoMuseSlotPickerView: View {
    let slot: NanoMuseSlot
    var onPick: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var providers: [NanoMuseSlotProvider] = []
    @State private var current: NanoMuseSlotChoice?
    @State private var adding = false

    private var able: [NanoMuseSlotProvider] { providers.filter { $0.has(slot) } }

    var body: some View {
        NanoMusePage(title: slot.title) {
            if able.isEmpty {
                NanoMuseCaption(text: emptyLine)
            }
            ForEach(able, id: \.id) { provider in
                VStack(alignment: .leading, spacing: 6) {
                    Text(provider.label)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 32)
                    NanoMuseModelList(provider: provider, slot: slot, current: current) { model in
                        pick(provider, model)
                    }
                }
            }
            NanoMuseCard {
                NanoMuseActionRow(title: AppLocalized("Add a provider"), titleColor: NanoMuseTones.action, chevron: false) { adding = true }
            }
        }
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: NanoMuseMediaModels.changed)) { _ in reload() }
        .sheet(isPresented: $adding) {
            NanoMuseOwnKeySheet { _ in reload() }
        }
    }

    private var emptyLine: String {
        switch slot {
        case .chat, .hands: return AppLocalized("Sign in to nanoMuse Cloud or add a provider")
        case .image: return AppLocalized("None of your providers can draw. Sign in to nanoMuse Cloud, or add an Alibaba Cloud Bailian provider with an API key; the avatar is drawn with one of the two.")
        case .video: return AppLocalized("No provider that can make video yet — nanoMuse speaks Alibaba Cloud Model Studio's video API, which nanoMuse Cloud relays too. Sign in to nanoMuse Cloud, or add a Model Studio key (it can be the same one as the image model uses), and the avatar starts moving; until then it stays as still pictures.")
        }
    }

    private func load() async {
        reload()
        // a Model Studio key is asked once which video models it has; the list grows when it answers
        if slot == .video {
            for inst in NanoMuseImageGen.bailianInstances() where !NanoMuseMediaModels.videoCheckIsFresh(for: inst) {
                _ = await NanoMuseMediaModels.checkVideoModels(for: inst)
            }
            reload()
        }
    }

    private func reload() {
        let list = NanoMuseModelSlots.providers()
        providers = list
        switch slot {
        case .chat: current = NanoMuseModelSlots.chatChoice()
        case .hands: current = nil
        case .image: current = NanoMuseModelSlots.imageValue(providers: list)
        case .video: current = NanoMuseModelSlots.videoValue(providers: list)
        }
    }

    private func pick(_ provider: NanoMuseSlotProvider, _ model: String) {
        if slot == .chat, !NanoMuseModelSlots.useForChat(instanceId: provider.id, model: model) {
            // the relay's menu named a model the phone has no entry for yet: fetch the list, then set it
            Task {
                if let inst = ProviderConfigStore.shared.instance(for: provider.id) {
                    await ProviderConfigStore.shared.refreshModels(for: inst)
                }
                if NanoMuseModelSlots.useForChat(instanceId: provider.id, model: model) {
                    onPick()
                    dismiss()
                }
            }
            return
        }
        if slot != .chat { NanoMuseModelSlots.use(slot, providerId: provider.id, model: model) }
        onPick()
        dismiss()
    }
}

/// One provider's models for a slot, the chosen one ticked, the recommended one marked.
private struct NanoMuseModelList: View {
    let provider: NanoMuseSlotProvider
    let slot: NanoMuseSlot
    let current: NanoMuseSlotChoice?
    let onPick: (String) -> Void

    private var models: [String] {
        let list = provider.models(for: slot)
        // Cloud without a menu on the phone: one row, the relay's own choice
        return list.isEmpty && provider.isCloud ? [""] : list
    }

    var body: some View {
        NanoMuseCard {
            ForEach(Array(models.enumerated()), id: \.offset) { index, model in
                if index > 0 { NanoMuseRowDivider() }
                Button { onPick(model) } label: {
                    HStack(spacing: 12) {
                        Text(model.isEmpty ? provider.label : model)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer(minLength: 8)
                        if provider.isCloud, model == provider.defaults[slot.defaultsKey] ?? "" {
                            Text(AppLocalized("Recommended"))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if current?.providerId == provider.id, (current?.model == model || (model.isEmpty && current?.model.isEmpty == true)) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(NanoMuseTones.action)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - "Use it for"

/// After a key was saved: which slots it takes over. Every slot the provider covers is
/// ticked; "Use it" switches the ticked ones to the provider's default model for each,
/// "Not now" changes nothing. Pictures and clips go through Model Studio's endpoints, so
/// only a key on a DashScope host offers those two; the screen is never offered on iPhone.
struct NanoMuseUseItForView: View {
    let instance: ProviderInstance
    var onDone: () -> Void

    @State private var provider: NanoMuseSlotProvider?
    @State private var on: Set<NanoMuseSlot> = []

    /// True when the provider can hold at least one slot, so the card has something to ask.
    @MainActor
    static func worthAsking(_ inst: ProviderInstance) -> Bool {
        guard let p = NanoMuseModelSlots.ownProvider(inst) else { return false }
        return offered.contains { p.has($0) }
    }

    private static let offered: [NanoMuseSlot] = [.chat, .image, .video]

    private var slots: [NanoMuseSlot] {
        guard let provider else { return [] }
        return Self.offered.filter { provider.has($0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(NanoMuseCloud.isSignedIn
                     ? AppLocalized("Pick what this key should handle. nanoMuse Cloud keeps the rest.")
                     : AppLocalized("Pick what this key should handle."))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
                    .padding(.top, 8)
                NanoMuseCard {
                    ForEach(Array(slots.enumerated()), id: \.element) { index, slot in
                        if index > 0 { NanoMuseRowDivider() }
                        NanoMuseToggleRow(title: slot.title, subtitle: provider?.defaultModel(for: slot), isOn: binding(slot))
                    }
                }
                VStack(spacing: 10) {
                    Button(action: useIt) {
                        Text(AppLocalized("Use it"))
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NanoMuseTones.action)
                    .disabled(on.isEmpty)
                    Button(action: onDone) {
                        Text(AppLocalized("Not now"))
                            .font(.body)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                Text(AppLocalized("You can change this any time under Settings › Models."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
            }
            .padding(.bottom, 24)
        }
        .background(NanoMuseTones.canvas.ignoresSafeArea())
        .navigationTitle(AppLocalized("Use it for"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .onAppear {
            provider = NanoMuseModelSlots.ownProvider(instance)
            on = Set(slots)
        }
    }

    private func binding(_ slot: NanoMuseSlot) -> Binding<Bool> {
        Binding(
            get: { on.contains(slot) },
            set: { if $0 { on.insert(slot) } else { on.remove(slot) } }
        )
    }

    private func useIt() {
        guard let provider else { onDone(); return }
        for slot in slots where on.contains(slot) {
            guard let model = provider.defaultModel(for: slot) else { continue }
            NanoMuseModelSlots.use(slot, providerId: provider.id, model: model)
        }
        onDone()
    }
}
