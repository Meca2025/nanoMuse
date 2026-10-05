//
//  NanoMuseFromDeviceCaption.swift
//  nanoMuse
//
//  C8: a text that came down through account sync is shown as an ordinary
//  bubble with one small line under it — "From Pixel 8" — nothing else marks
//  it. The chat list carries no such badge; the caption is the whole story.
//

import SwiftUI

/// The "From {device}" line under a synced bubble. Renders nothing for this phone's own rows.
struct NanoMuseFromDeviceCaption: View {
    /// `ChatMessage.nmFromDevice`: the other device's name, or nil.
    let device: String?

    init(_ device: String?) {
        self.device = device
    }

    var body: some View {
        if let device, !device.isEmpty {
            Text(String(format: AppLocalized("From %@"), device))
                .font(.system(size: FontSettings.shared.scaledMessage(11.5)))
                .foregroundStyle(ChatColors.secondaryText)
                .padding(.horizontal, 4)
                .accessibilityLabel(String(format: AppLocalized("From %@"), device))
        }
    }
}
