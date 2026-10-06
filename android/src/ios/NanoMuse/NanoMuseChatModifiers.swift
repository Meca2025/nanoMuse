//
//  NanoMuseChatModifiers.swift
//  nanoMuse
//
//  Why these exist. `AIChatView.body` is one expression of some sixty chained
//  modifiers (sheets, alerts, listeners). Each link wraps the value so far in
//  another `ModifiedContent`: the body's value grows with every link, the
//  compiler holds the intermediate copies on the stack while the getter builds
//  the chain, and the Swift runtime — asked for the metadata of the finished
//  type the first time the body runs — recurses once per level of nesting.
//  0.1.38 added four links of ours (the composer's fail-safe host, the C9
//  presence hooks) and build 9 overflowed the main thread's stack on an iPad
//  the moment the chat appeared after onboarding, every launch: SIGSEGV in the
//  stack guard, `AIChatView.body.getter` →
//  `__swift_instantiateConcreteTypeFromMangledNameV2` →
//  `swift::Demangle::TypeDecoder::decodeMangledType` (Minis-2026-10-06-005159.ips,
//  symbolised with the dSYM of TestFlight run 9).
//
//  The cure: our links are grouped here into two modifiers, so the chain is
//  as long as 0.1.37's again, and the composer stack is boxed in an `AnyView`,
//  so the body's value carries one pointer for the largest subtree instead of
//  the subtree itself. New chat-wide behaviour goes into these modifiers (or a
//  third one), never as another link on `AIChatView.body`;
//  `NanoMuseRound6Tests.testChatBodyTypeStaysShallow` keeps the depth in check.
//

import SwiftUI

/// The composer stack at the bottom of the message list — as the list's overlay normally
/// and, on the fail-safe path (`NanoMuseComposerWatch.failSafe`), as a bottom safe-area inset:
/// a different host than the overlay's, so whatever left that one empty does not apply to it.
/// The list's own bottom inset is 0 then (`nmListInset`), the inset keeps the composer's room.
struct NanoMuseComposerHost: ViewModifier {
    let failSafe: Bool
    /// The stack, type-erased: its tree (the input bar, the tool strip, the popups) is the
    /// heaviest part of the chat's body, and a box keeps it out of the body's value and type.
    let stack: AnyView

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if !failSafe { stack }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if failSafe { stack }
            }
    }
}

/// The chat's listeners of ours, one link of the chain: the Muse header's ••• menu, the
/// composer's expectation when a message goes out or a turn ends, and presence (C9 — the
/// "{device} is working…" line under the last remote row, cleared when the reply arrives).
struct NanoMuseChatHooks: ViewModifier {
    let vm: AIChatViewModel
    /// `vm.isProcessing`, passed as a value so a change re-runs this body and `onChange` sees it.
    let processing: Bool
    let composer: NanoMuseComposerWatch
    let readOnly: Bool
    let perform: (NanoMuseChatAction) -> Void

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .nanoMuseChatAction)) { note in
                guard let action = NanoMuseChatAction.from(note, for: vm.nmSessionKey) else { return }
                perform(action)
            }
            .nmOnChange(of: processing) { running in
                // a message went out (any path: the pill, a card's pick, a flow) or a turn ended —
                // the composer must be there a second later
                if !readOnly { composer.expect(running ? "a message went out" : "the turn ended") }
            }
            .onReceive(NanoMusePresence.shared.$revision) { _ in vm.nmApplyPresence() }
            .onReceive(vm.$messages) { _ in vm.nmApplyPresence() }
    }
}
