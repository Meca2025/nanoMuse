import SwiftUI

/// Settings › Providers › nanoMuse Cloud. Signed out: a phone number or an e-mail address, a
/// code, done. Signed in: what is left of the starter allowance, a refresh, the way out.
/// Mirror of the Android `CloudSignInScreen` / `CloudAccountScreen`.
struct NanoMuseCloudView: View {
    @ObservedObject private var store = ProviderConfigStore.shared
    @State private var account: NanoMuseCloudAccount?
    @State private var identifier = ""
    @State private var code = ""
    @State private var codeSent = false
    /// The other way in: the account's password instead of a code.
    @State private var usePassword = false
    @State private var password = ""
    /// A friend's invite code, optional, with the six digits.
    @State private var invite = ""
    @State private var inviteOpen = false
    /// What the relay gives on sign-up (relay 0.15), for the line above the form.
    @State private var config = NanoMuseConfig()
    @State private var busy = false
    @State private var message: String?
    @State private var failed = false
    @State private var confirmSignOut = false
    @State private var relayBase = ""

    private var signedIn: Bool {
        _ = store.instances  // re-evaluate when the provider is removed elsewhere
        return NanoMuseCloud.isSignedIn
    }

    var body: some View {
        Form {
            if signedIn {
                accountSections
                NanoMuseDevicesSection()
                NanoMuseReachSection()
            } else {
                signInSections
            }
            if NanoMuseCloud.canOverrideBase {
                relaySection
            }
        }
        .navigationTitle(NanoMuseCloud.label)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            account = NanoMuseCloud.account
            relayBase = NanoMuseCloud.baseURL == NanoMuseCloud.defaultBase ? "" : NanoMuseCloud.baseURL
            if signedIn { await refresh(quiet: true) } else { config = await NanoMuseCloud.config() }
        }
    }

    // MARK: - Signed in

    @ViewBuilder
    private var accountSections: some View {
        Section {
            if let account {
                LabeledContent(AppLocalized("Signed in as"), value: account.hint)
            } else {
                Text(AppLocalized("Signed in."))
                    .foregroundStyle(.secondary)
            }
            Button {
                Task { await refresh(quiet: false) }
            } label: {
                Label(AppLocalized("Refresh"), systemImage: "arrow.clockwise")
            }
            .disabled(busy)
        } footer: {
            if let message {
                Text(message).foregroundStyle(failed ? Color.red : Color.secondary)
            }
        }

        // The rest of the account — the pool in yuan with the ways on, the invite, usage,
        // password, the devices holding a key, the timeline, deletion — read live from the relay.
        NanoMuseAccountSections(account: $account) {
            account = nil
            message = nil
            failed = false
        }

        if let inst = NanoMuseCloud.instance {
            Section {
                NavigationLink {
                    NanoMuseDataControlsView()
                } label: {
                    Label(AppLocalized("Data controls"), systemImage: "hand.raised")
                }
                NavigationLink {
                    NanoMuseAvatarStudioView(embedded: true)
                } label: {
                    Label(AppLocalized("Avatar"), systemImage: "face.smiling")
                }
                NavigationLink {
                    ProviderInstanceDetailView(instanceId: inst.id)
                } label: {
                    Label(AppLocalized("Provider settings"), systemImage: "slider.horizontal.3")
                }
            } footer: {
                Text(AppLocalized("The relay is an ordinary provider named \"nanoMuse Cloud\": its models can join any model group, and a key of your own can sit next to it."))
            }
        }

        Section {
            Button(role: .destructive) {
                confirmSignOut = true
            } label: {
                Label(AppLocalized("Sign out"), systemImage: "rectangle.portrait.and.arrow.right")
            }
            .disabled(busy)
            .confirmationDialog(
                AppLocalized("Sign out of nanoMuse Cloud?"),
                isPresented: $confirmSignOut,
                titleVisibility: .visible
            ) {
                Button(AppLocalized("Sign out"), role: .destructive) {
                    Task { await signOut() }
                }
            } message: {
                Text(AppLocalized("This phone's key is revoked and the provider is removed. What is left of the allowance stays with the account."))
            }
        } footer: {
            privacyFooter
        }
    }

    // MARK: - Signed out

    @ViewBuilder
    private var signInSections: some View {
        Section {
            Text(AppLocalized("Sign in with a phone number or an e-mail address and start right away with a starter allowance — no key of your own needed. A provider of your own can be added at any time."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let allowance = config.allowanceCny, allowance > 0 {
                let amount = "¥" + allowance.formatted(.number.precision(.fractionLength(allowance.rounded() == allowance ? 0 : 2)))
                Label(AppLocalized("Free to start: \(amount) of credit comes with the account. No card."), systemImage: "gift")
                    .font(.subheadline)
            }
        }

        Section {
            TextField(AppLocalized("Phone number or e-mail"), text: $identifier)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .disabled(busy || codeSent)
            if usePassword {
                SecureField(AppLocalized("Password"), text: $password)
                    .textContentType(.password)
                    .disabled(busy)
            } else if codeSent {
                TextField(AppLocalized("Verification code"), text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .disabled(busy)
                if inviteOpen {
                    TextField(AppLocalized("Invite code (optional)"), text: $invite)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .disabled(busy)
                } else {
                    Button(AppLocalized("Have an invite code?")) { inviteOpen = true }
                        .font(.subheadline)
                        .disabled(busy)
                }
            }
        } footer: {
            if let message {
                Text(message).foregroundStyle(failed ? Color.red : Color.secondary)
            } else if inviteOpen && codeSent && !usePassword {
                let bonus = "¥" + (config.inviteeBonusCny ?? 5).formatted(.number.precision(.fractionLength(0)))
                Text(AppLocalized("A friend’s code adds \(bonus) for both of you on a first sign-in."))
            }
        }

        Section {
            if usePassword {
                Button {
                    Task { await signInWithPassword() }
                } label: {
                    HStack {
                        Text(AppLocalized("Sign in"))
                        if busy { Spacer(); ProgressView() }
                    }
                }
                .disabled(busy || password.isEmpty || identifier.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(AppLocalized("Use a code instead")) {
                    usePassword = false
                    password = ""
                    message = nil
                }
                .disabled(busy)
            } else if codeSent {
                Button {
                    Task { await signIn() }
                } label: {
                    HStack {
                        Text(AppLocalized("Sign in"))
                        if busy { Spacer(); ProgressView() }
                    }
                }
                .disabled(busy || code.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(AppLocalized("Use a password instead")) {
                    usePassword = true
                    message = nil
                }
                .disabled(busy)
                Button(AppLocalized("Use another number or address")) {
                    codeSent = false
                    code = ""
                    message = nil
                }
                .disabled(busy)
            } else {
                Button {
                    Task { await sendCode() }
                } label: {
                    HStack {
                        Text(AppLocalized("Send code"))
                        if busy { Spacer(); ProgressView() }
                    }
                }
                .disabled(busy || identifier.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(AppLocalized("Sign in with a password")) {
                    usePassword = true
                    message = nil
                }
                .disabled(busy || identifier.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } footer: {
            privacyFooter
        }
    }

    private var privacyFooter: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(AppLocalized("The relay keeps a hashed identifier and token counts. Messages are passed to the model and not stored."))
            Link(AppLocalized("How nanoMuse Cloud works"), destination: URL(string: "https://github.com/nano-muse/nanoMuse/blob/main/docs/cloud.md")!)
        }
    }

    // MARK: - Debug

    private var relaySection: some View {
        Section {
            TextField(NanoMuseCloud.defaultBase, text: $relayBase)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { NanoMuseCloud.setBaseURL(relayBase) }
                .onChange(of: relayBase) { newValue in NanoMuseCloud.setBaseURL(newValue) }
        } header: {
            Text("Relay (debug builds only)")
        } footer: {
            Text("Another relay to sign in against, for example one running on a laptop on the same Wi-Fi. Empty means the default.")
        }
    }

    // MARK: - Actions

    private func sendCode() async {
        busy = true
        failed = false
        defer { busy = false }
        do {
            try await NanoMuseCloud.requestCode(identifier: identifier)
            codeSent = true
            message = AppLocalized("Code sent. Enter it below.")
        } catch {
            failed = true
            message = NanoMuseCloud.describe(error)
        }
    }

    private func signIn() async {
        busy = true
        failed = false
        defer { busy = false }
        do {
            account = try await NanoMuseCloud.verify(identifier: identifier, code: code, invite: invite)
            message = nil
            code = ""
            invite = ""
            inviteOpen = false
            codeSent = false
        } catch {
            failed = true
            message = NanoMuseCloud.describe(error)
        }
    }

    private func signInWithPassword() async {
        busy = true
        failed = false
        defer { busy = false }
        do {
            account = try await NanoMuseCloud.login(identifier: identifier, password: password)
            message = nil
            password = ""
            usePassword = false
            codeSent = false
        } catch {
            failed = true
            message = NanoMuseCloud.describe(error)
        }
    }

    private func refresh(quiet: Bool) async {
        busy = true
        defer { busy = false }
        do {
            account = try await NanoMuseCloud.refresh()
            if !quiet {
                failed = false
                message = nil
            }
        } catch {
            if !quiet {
                failed = true
                message = NanoMuseCloud.describe(error)
            }
        }
    }

    private func signOut() async {
        busy = true
        defer { busy = false }
        await NanoMuseCloud.signOut()
        account = nil
        message = nil
        failed = false
    }
}

/// The row in the providers list that leads to `NanoMuseCloudView`.
struct NanoMuseCloudRow: View {
    @ObservedObject private var store = ProviderConfigStore.shared

    var body: some View {
        _ = store.instances
        let account = NanoMuseCloud.isSignedIn ? NanoMuseCloud.account : nil
        return HStack(spacing: 12) {
            Image(systemName: "cloud.fill")
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(NanoMuseCloud.label)
                if let account {
                    let hint = account.hint
                    let left = account.fraction.formatted(.percent.precision(.fractionLength(0)))
                    Text(AppLocalized("\(hint) · \(left) of the allowance left"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if NanoMuseCloud.isSignedIn {
                    Text(AppLocalized("Signed in"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text(AppLocalized("Phone or e-mail sign-in, no key needed"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
