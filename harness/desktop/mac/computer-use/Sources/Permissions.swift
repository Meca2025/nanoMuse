// The two TCC grants, as this process sees them — which is the point: the grant is ours,
// not the Electron app's.

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

enum Permissions {
    /// The live grant (`CGPreflightScreenCaptureAccess`), no prompt.
    static func screenGranted() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func accessibilityGranted() -> Bool {
        AXIsProcessTrusted()
    }

    /// The system's own request: its dialog the first time, and this app on the pane's list.
    /// Both calls return at once; the dialog is tccd's. On the main thread, where UI belongs.
    static func request(_ what: String) {
        DispatchQueue.main.sync {
            if what == "screen" {
                // Active first: tccd has been seen to show the Screen Recording dialog for a
                // request from a backgrounded process and still leave the process off the
                // pane's list (Omi's PERM-02). This app is started with `open -g`, so it is in
                // the background until it asks; an accessory app is active without a window.
                NSApp.activate(ignoringOtherApps: true)
                // the result is the current grant, which /status reports — the call is for the prompt
                _ = CGRequestScreenCaptureAccess()
            } else {
                let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
                _ = AXIsProcessTrustedWithOptions(options)
            }
        }
    }

    /// System Settings → Privacy & Security, at the pane where the switch is.
    static func openPane(_ what: String) {
        let pane = what == "screen" ? "Privacy_ScreenCapture" : "Privacy_Accessibility"
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") else { return }
        DispatchQueue.main.async {
            _ = NSWorkspace.shared.open(url)
        }
    }
}
