//
//  NanoMuseProviderReachCard.swift
//  nanoMuse
//
//  The card the chat shows for a failed turn when the provider could not be reached (DNS,
//  connect, TLS, a timeout, an interception page), OpenAI refused the region, the sign-in ran
//  out or the plan has nothing left: what happened in one sentence, what helps, and the
//  actions — Try again, the Network setting, Sign in again, a key of one's own. The raw line
//  sits behind "Details" for a bug report. Every other error keeps upstream's banner
//  (ChatMessageViews.inlineError).
//

import SwiftUI

struct NanoMuseProviderReachCard: View {
    let reach: NanoMuseProviderReach.Reach
    var onRetry: (() -> Void)?

    @Environment(\.openURL) private var openURL
    @State private var details = false
    @State private var network = false

    private var host: String { reach.host.isEmpty ? AppLocalized("the provider") : reach.host }
    private var plan: Bool { reach.isChatGPTPlan }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(tint)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.subheadline.weight(.semibold))
                    Text(explanation).font(.footnote).foregroundStyle(.secondary)
                    if !reach.detail.isEmpty, reach.kind != .unreachable {
                        Text(String(format: AppLocalized("The provider says: %@"), reach.detail))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if let s = reach.retryAfterS, s > 0 {
                        Text(String(format: AppLocalized("Resets in %@."), NanoMuseProviderReach.duration(s)))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }

            if !helps.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text(AppLocalized("What helps")).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                    ForEach(helps, id: \.self) { line in
                        HStack(alignment: .top, spacing: 6) {
                            Text("·").font(.footnote).foregroundStyle(.secondary)
                            Text(line).font(.footnote)
                        }
                    }
                }
            }

            actions

            if reach.kind == .unreachable, !reach.detail.isEmpty {
                Button { details.toggle() } label: {
                    Text(details ? AppLocalized("Hide details") : AppLocalized("Details"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                if details {
                    Text(reach.detail)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NanoMuseTones.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(NanoMuseTones.hairline, lineWidth: 1))
        .padding(.top, 4)
        .sheet(isPresented: $network) {
            NavigationStack { NanoMuseNetworkView() }
        }
    }

    // MARK: - Words

    private var icon: String {
        switch reach.kind {
        case .unreachable: return "wifi.exclamationmark"
        case .regionBlocked: return "globe"
        case .signedOut: return "key"
        case .quota, .rateLimited: return "hourglass"
        }
    }

    private var tint: Color {
        switch reach.kind {
        case .unreachable, .regionBlocked: return Color(red: 0.88, green: 0.47, blue: 0.17)
        case .signedOut: return NanoMuseTones.action
        case .quota, .rateLimited: return Color(red: 0.49, green: 0.36, blue: 1.0)
        }
    }

    private var title: String {
        switch reach.kind {
        case .unreachable: return String(format: AppLocalized("%@ cannot be reached from this network"), host)
        case .regionBlocked: return AppLocalized("OpenAI does not serve this region")
        case .signedOut: return plan ? AppLocalized("The ChatGPT sign-in is no longer valid") : String(format: AppLocalized("%@ refused this key"), host)
        case .quota: return plan ? AppLocalized("The ChatGPT plan has nothing left for now") : String(format: AppLocalized("%@ has no quota left for this key"), host)
        case .rateLimited: return AppLocalized("Too many requests at once")
        }
    }

    private var explanation: String {
        switch reach.kind {
        case .unreachable: return String(format: AppLocalized("Nothing answered at %@. This is the path from this phone to the provider; nanoMuse's own servers are not involved."), host)
        case .regionBlocked: return AppLocalized("The request reached OpenAI, which answered that it does not offer the service where this connection comes from.")
        case .signedOut: return plan ? AppLocalized("The token this phone kept has expired or was revoked. Sign in again to go on with the plan.") : AppLocalized("The provider answered that the key is not valid any more. Check it in the provider's settings.")
        case .quota: return plan ? AppLocalized("OpenAI counts the plan's use in windows of a few hours and of a week; this window is used up.") : AppLocalized("The provider answered that this key's quota is used up.")
        case .rateLimited: return AppLocalized("The provider asked to slow down for a moment.")
        }
    }

    private var helps: [String] {
        switch reach.kind {
        case .unreachable, .regionBlocked:
            return [
                AppLocalized("A VPN on this phone, switched on before you try again"),
                AppLocalized("A proxy this app uses for providers: Settings → Network"),
                AppLocalized("Another provider, with a key of your own"),
            ]
        case .quota: return [AppLocalized("Waiting for the window to pass"), AppLocalized("Another provider, with a key of your own")]
        case .rateLimited: return [AppLocalized("A moment, then trying again")]
        case .signedOut: return []
        }
    }

    // MARK: - Actions

    @ViewBuilder
    private var actions: some View {
        HStack(spacing: 8) {
            if reach.kind == .signedOut {
                Button(plan ? AppLocalized("Sign in again") : AppLocalized("Open providers")) {
                    openURL(URL(string: "minis://settings/providers")!)
                }
                .buttonStyle(.borderedProminent).tint(NanoMuseTones.action).controlSize(.small)
                if let onRetry { Button(AppLocalized("Try again"), action: onRetry).buttonStyle(.plain).font(.footnote).foregroundStyle(NanoMuseTones.action) }
            } else {
                if let onRetry {
                    Button(AppLocalized("Try again"), action: onRetry)
                        .buttonStyle(.borderedProminent).tint(NanoMuseTones.action).controlSize(.small)
                }
                if reach.kind == .unreachable || reach.kind == .regionBlocked {
                    Button {
                        network = true
                    } label: {
                        Label(AppLocalized("Network settings"), systemImage: "gearshape").font(.footnote)
                    }
                    .buttonStyle(.plain).foregroundStyle(NanoMuseTones.action)
                }
                if reach.kind != .rateLimited {
                    Button {
                        openURL(URL(string: "minis://settings/providers")!)
                    } label: {
                        Label(AppLocalized("Add a key of your own"), systemImage: "key").font(.footnote)
                    }
                    .buttonStyle(.plain).foregroundStyle(NanoMuseTones.action)
                }
            }
        }
        .padding(.top, 2)
    }
}
