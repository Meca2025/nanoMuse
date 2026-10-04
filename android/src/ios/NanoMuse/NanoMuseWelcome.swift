import SwiftUI

/// The first thing on the empty start screen: the way in that needs no key — sign in to
/// nanoMuse Cloud, free, with the allowance the relay says it gives. Opens the Cloud page as a
/// sheet; once signed in the provider and a model group exist, so the setup steps below are
/// done. Mirror of the Android first-run sheet and the desktop welcome ("Sign in — free").
struct NanoMuseCloudCTA: View {
    @ObservedObject private var store = ProviderConfigStore.shared
    @State private var open = false
    @State private var config = NanoMuseConfig()

    var body: some View {
        _ = store.instances
        return Group {
            if !NanoMuseCloud.isSignedIn {
                VStack(spacing: 8) {
                    Button {
                        open = true
                    } label: {
                        Label(AppLocalized("Sign in to nanoMuse Cloud — free"), systemImage: "cloud.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    Text(freeLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 8)
                .frame(maxWidth: 400)
                .sheet(isPresented: $open) {
                    NavigationStack { NanoMuseCloudView() }
                }
                .task { config = await NanoMuseCloud.config() }
            }
        }
    }

    private var freeLine: String {
        if let allowance = config.allowanceCny, allowance > 0 {
            let amount = "¥" + allowance.formatted(.number.precision(.fractionLength(allowance.rounded() == allowance ? 0 : 2)))
            return String(format: AppLocalized("A phone number or an e-mail, a code, and %@ of credit comes with the account. No card. Or add a key of your own below."), amount)
        }
        return AppLocalized("A phone number or an e-mail, a code, and the model is yours to use. No card. Or add a key of your own below.")
    }
}
