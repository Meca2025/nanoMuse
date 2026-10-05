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

    /// Whether the chat view is on screen (its onAppear / onDisappear).
    var visible = false {
        didSet { if !visible { check?.cancel() } }
    }

    private var attached: Set<ObjectIdentifier> = []
    private var hostHeight: CGFloat = 0
    /// The last height the input bar's geometry callback reported; -1 until the first.
    private var frameHeight: CGFloat = -1
    private var check: Task<Void, Never>?
    private var lastRebuild: CFAbsoluteTime = 0

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
        let healthy = !attached.isEmpty && hostHeight > 0
        if healthy {
            if frameHeight == 0 {
                Self.log.info("composer check (\(reason, privacy: .public)): host is up (h=\(self.hostHeight)) although the bar's last frame was 0 — leaving it")
            }
            return
        }
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastRebuild > Self.cooldown else { return }
        lastRebuild = now
        Self.log.error("composer self-heal: rebuilding the composer host — \(reason, privacy: .public) (attached=\(self.attached.count) hostH=\(self.hostHeight) frameH=\(self.frameHeight))")
        attached = []
        hostHeight = 0
        frameHeight = -1
        rebuildTick &+= 1
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
