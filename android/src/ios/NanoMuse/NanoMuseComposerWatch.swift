//
//  NanoMuseComposerWatch.swift
//  nanoMuse
//
//  The composer that disappears. The chat's composer stack (cards, the tool
//  strip, the input bar) sits in an `.overlay` of the message list and is
//  hosted by UIKit through the text field's representable. On the device the
//  host has been seen to survive with no subviews — after a tool strip's
//  sheet, a keyboard dismissed on the iPad, a background pass — while SwiftUI
//  has nothing to re-render for, since no state of the subtree changed. The
//  tool strip then sits straight on the tab bar: no field, no mic, nothing to
//  focus, "the keyboard is lost". Upstream's probe (AIChatView,
//  `[InputBarHealth]`) detects the silence and logs it; this makes the
//  self-heal real.
//
//  How: a probe `UIView` in the stack's background says when it is attached
//  to a window and how tall the stack really is; the input bar's geometry
//  callback reports every frame, zero included. Whenever one of them looks
//  wrong — detached while the chat is on screen, a zero-height host, a zero
//  frame, no wake-up after a foreground — the state is re-checked a second
//  later and, if still wrong, `rebuildTick` moves. AIChatView puts `.id(tick)`
//  on the stack, so SwiftUI tears the host down and builds it again: the same
//  recovery as leaving and re-entering the session, without the trip. The text
//  being typed lives in the view model and survives; the focus does not, which
//  is why a healthy composer is never rebuilt.
//
//  0.1.38 (round three, the maintainer's iPhone after the naming): the field
//  itself is SwiftUI's now (NanoMuseComposerField), so the pill no longer
//  stands on a representable; the watch stays as the last net, with two
//  holes closed — a check that fell inside the rebuild cooldown was dropped
//  instead of deferred, and nothing confirmed that a rebuilt host came up —
//  and a visible fail-safe: one second after the chat appears or a message
//  goes out, a composer that still reports no height is shown anyway, in a
//  different attachment point (`failSafe` → AIChatView hosts the stack as a
//  bottom safe-area inset instead of the message list's overlay).
//

import os
import SwiftUI
import UIKit

@MainActor
final class NanoMuseComposerWatch: ObservableObject {
    /// One line of the field, so the pill never collapses to its padding when the text view
    /// reports nothing (a torn-down host measures 0). Equal to the field's natural one-line
    /// height, so the healthy composer looks exactly as before.
    static var fieldFloor: CGFloat {
        UIFont.systemFont(ofSize: FontSettings.shared.scaledChatInput(16.5)).lineHeight.rounded(.up)
    }

    private static let log = Logger(subsystem: "io.github.nanomuse.app", category: "nm.composer")
    /// How long a wrong state may last before the stack is rebuilt.
    private static let patience: TimeInterval = 1.0
    /// Two rebuilds are never closer than this.
    private static let cooldown: TimeInterval = 3.0

    /// AIChatView keys the composer stack on this.
    @Published private(set) var rebuildTick = 0
    /// The composer is shown through the fail-safe path (a safe-area inset, not the overlay).
    /// Set when a check one second after the chat appeared, a message went out or a rebuild
    /// ran still finds no composer; cleared when the chat leaves the screen.
    @Published private(set) var failSafe = false

    /// Whether the chat view is on screen (its onAppear / onDisappear).
    var visible = false {
        didSet {
            if !visible {
                check?.cancel()
                expectation?.cancel()
                failSafe = false
            }
        }
    }

    private var attached: Set<ObjectIdentifier> = []
    private var hostHeight: CGFloat = 0
    /// The last height the input bar's geometry callback reported; -1 until the first.
    private var frameHeight: CGFloat = -1
    private var check: Task<Void, Never>?
    private var expectation: Task<Void, Never>?
    private var lastRebuild: CFAbsoluteTime = 0

    /// Pure form of the fail-safe rule, for the tests: no probe in a window, a host of no
    /// height, or an input bar that never reported a height (or reported 0) one second later.
    nonisolated static func needsFailSafe(attached: Int, hostHeight: CGFloat, frameHeight: CGFloat) -> Bool {
        attached == 0 || hostHeight <= 0 || frameHeight <= 0
    }

    // MARK: Signals

    /// The input bar's `onGeometryChange`, every sample (upstream drops the zero ones before use).
    func geometry(height: CGFloat) {
        frameHeight = height
        if height <= 0, visible { schedule("zero-height input bar frame") }
    }

    /// The probe view entered a window.
    func probeAttached(_ id: ObjectIdentifier) {
        attached.insert(id)
    }

    /// The probe view left its window — the host is being torn down (or the chat is leaving).
    func probeDetached(_ id: ObjectIdentifier) {
        attached.remove(id)
        if attached.isEmpty, visible { schedule("composer host detached from the window") }
    }

    /// The probe laid out: its bounds are the composer stack's.
    func probeLaidOut(height: CGFloat) {
        hostHeight = height
        if height <= 0, visible { schedule("zero-height composer host") }
    }

    /// The scene came back to the front: iOS may have torn the host down while snapshotting.
    func sceneActive() {
        if visible { schedule("scene active", after: Self.patience + 0.3) }
    }

    /// Upstream's health probe found no geometry callback after a foreground.
    func stalled() {
        if visible { schedule("no geometry after foreground", after: 0.2) }
    }

    /// The chat appeared, or a message went out: a composer must be on screen a second from
    /// now. If it is not — nothing attached, no height, no frame — the fail-safe path shows it.
    func expect(_ reason: String) {
        guard visible else { return }
        expectation?.cancel()
        expectation = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(NanoMuseComposerWatch.patience * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.confirm(reason)
        }
    }

    // MARK: The check

    private func schedule(_ reason: String, after delay: TimeInterval = NanoMuseComposerWatch.patience) {
        check?.cancel()
        check = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.verify(reason)
        }
    }

    private func verify(_ reason: String) {
        guard visible else { return }
        if !attached.isEmpty && hostHeight > 0 {
            if frameHeight == 0 {
                Self.log.info("composer check (\(reason, privacy: .public)): host is up (h=\(self.hostHeight)) although the bar's last frame was 0 — leaving it")
            }
            return
        }
        let now = CFAbsoluteTimeGetCurrent()
        let since = now - lastRebuild
        if since <= Self.cooldown {
            // 0.1.37 dropped this check; a host that came back empty right after a rebuild then
            // had nothing left to wake it. Look again once the cooldown is over.
            schedule(reason, after: Self.cooldown - since + 0.1)
            return
        }
        rebuild(reason)
    }

    /// The expectation came due: the composer is either there or it is shown the other way.
    private func confirm(_ reason: String) {
        guard visible else { return }
        if !Self.needsFailSafe(attached: attached.count, hostHeight: hostHeight, frameHeight: frameHeight) { return }
        if failSafe {
            // Already on the fail-safe path and still nothing: one more identity, out of cooldown.
            Self.log.error("composer fail-safe: still no composer \(reason, privacy: .public) (attached=\(self.attached.count) hostH=\(self.hostHeight) frameH=\(self.frameHeight))")
            if CFAbsoluteTimeGetCurrent() - lastRebuild > Self.cooldown { rebuild("fail-safe, second look") }
            return
        }
        Self.log.error("composer fail-safe: no composer one second after \(reason, privacy: .public) (attached=\(self.attached.count) hostH=\(self.hostHeight) frameH=\(self.frameHeight)) — showing it as a safe-area inset")
        attached = []
        hostHeight = 0
        frameHeight = -1
        lastRebuild = CFAbsoluteTimeGetCurrent()
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            failSafe = true
            rebuildTick &+= 1
        }
        expect("the fail-safe host")
    }

    private func rebuild(_ reason: String) {
        lastRebuild = CFAbsoluteTimeGetCurrent()
        Self.log.error("composer self-heal: rebuilding the composer host — \(reason, privacy: .public) (attached=\(self.attached.count) hostH=\(self.hostHeight) frameH=\(self.frameHeight))")
        attached = []
        hostHeight = 0
        frameHeight = -1
        // Outside any running animation: a representable swapped under a transition is one of
        // the ways the host has been seen to come back empty.
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { rebuildTick &+= 1 }
        // The rebuilt host must prove itself; if it does not, the fail-safe path takes over.
        expect("the rebuild")
    }
}

// MARK: - The probe

/// A clear, non-interactive view in the composer stack's background: it tells the watch when
/// the stack is in a window and how tall it is laid out.
struct NanoMuseComposerProbe: UIViewRepresentable {
    let watch: NanoMuseComposerWatch

    func makeUIView(context: Context) -> NanoMuseComposerProbeView {
        let view = NanoMuseComposerProbeView()
        view.watch = watch
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        view.isAccessibilityElement = false
        return view
    }

    func updateUIView(_ uiView: NanoMuseComposerProbeView, context: Context) {
        uiView.watch = watch
    }
}

final class NanoMuseComposerProbeView: UIView {
    weak var watch: NanoMuseComposerWatch?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            watch?.probeAttached(ObjectIdentifier(self))
        } else {
            watch?.probeDetached(ObjectIdentifier(self))
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard window != nil else { return }
        watch?.probeLaidOut(height: bounds.height)
    }
}
