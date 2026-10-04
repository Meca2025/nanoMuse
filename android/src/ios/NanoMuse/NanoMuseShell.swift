//
//  NanoMuseShell.swift
//  nanoMuse
//
//  The Muse shell on iPhone and iPad: one main chat pinned to the Chat tab,
//  a bottom bar for Chat / Feed / Ideas / Goals / Library, and a side
//  drawer with the other chats. The upstream split layout (ContentView)
//  stays reachable from the drawer and from the Settings switch. The first
//  run (NanoMuseFirstRun) shows in front of it all until the account and a
//  model are in. Android: ui/home/*.
//

import SwiftUI
import Combine

// MARK: - Preferences

enum NanoMuseShellPrefs {
    private static let shellKey = "nanomuse.shell.enabled"
    private static let headerKey = "nanomuse.header.enabled"

    /// The Muse shell on phones (off → the upstream OpenMinis layout).
    static var shell: Bool {
        get { UserDefaults.standard.object(forKey: shellKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: shellKey) }
    }

    /// The face · name · status header in the chat's navigation bar.
    static var museHeader: Bool {
        get { UserDefaults.standard.object(forKey: headerKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: headerKey) }
    }
}

// MARK: - Tabs

enum NanoMuseTab: String, CaseIterable, Identifiable {
    case chat, feed, ideas, goals, library
    var id: String { rawValue }

    var title: String {
        switch self {
        case .chat: return AppLocalized("Chat")
        case .feed: return AppLocalized("Feed")
        case .ideas: return AppLocalized("Ideas")
        case .goals: return AppLocalized("Goals")
        case .library: return AppLocalized("Library")
        }
    }

    var symbol: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right"
        case .feed: return "newspaper"
        case .ideas: return "lightbulb"
        case .goals: return "target"
        case .library: return "books.vertical"
        }
    }

    var selectedSymbol: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .feed: return "newspaper.fill"
        case .ideas: return "lightbulb.fill"
        case .goals: return "target"
        case .library: return "books.vertical.fill"
        }
    }
}

// MARK: - Root

/// What MinisApp shows: the Muse shell on phones, the upstream split
/// layout elsewhere. Also hosts the avatar studio sheet when the shell is
/// not around to do it.
struct NanoMuseRoot: View {
    @AppStorage("nanomuse.shell.enabled") private var shellEnabled = true
    @ObservedObject private var store = ProviderConfigStore.shared
    @State private var hasSessions: Bool?
    @State private var setupDone = NanoMuseFirstRun.isDone
    @State private var showClassicSettings = false

    /// The Muse shell on iPhone and iPad alike; off → the upstream layout.
    private var usesShell: Bool { shellEnabled }

    /// The setup in front of everything until the account and a model are in (see NanoMuseFirstRun.needed).
    private var needsSetup: Bool {
        guard let hasSessions else { return false }
        let providers = store.instances.contains { $0.isEnabled }
        return NanoMuseFirstRun.needed(signedIn: NanoMuseCloud.isSignedIn, hasProviders: providers, hasSessions: hasSessions, done: setupDone)
    }

    var body: some View {
        Group {
            if needsSetup {
                NanoMuseFirstRunView(
                    onStart: { setupDone = true },
                    onSettings: { showClassicSettings = true }
                )
                .sheet(isPresented: $showClassicSettings) {
                    NanoMuseClassicCover(wantsSettings: true)
                }
            } else if usesShell {
                NanoMuseHomeView()
            } else {
                ContentView()
                    .nanoMuseStudioPresenter(enabled: true)
                    .nanoMuseAgentPagePresenter(enabled: true, onOpenSession: { id in
                        NotificationCenter.default.post(name: .openSessionFromIntent, object: nil, userInfo: ["sessionId": id])
                    }, onPrefillChat: { text in
                        NotificationCenter.default.post(name: .nanoMuseComposerPrefill, object: nil, userInfo: ["text": text])
                    }, onOpenRoutines: nil)
            }
        }
        .onAppear {
            NanoMuseProfileSync.shared.start()
            NanoMuseStarWatch.shared.start()
        }
        .task {
            hasSessions = !(await ChatStore.shared.listSessions()).isEmpty
            // The feed's daily routine exists from the start, as on Android (a no-op without a model).
            if !needsSetup { await NanoMuseFeedFlow.ensureRoutine() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sessionDidCreate)) { _ in
            hasSessions = true
        }
    }
}

/// Presents the agent's page when the header's face is tapped.
struct NanoMuseAgentPagePresenter: ViewModifier {
    var enabled: Bool
    var onOpenSession: (String) -> Void
    var onPrefillChat: (String) -> Void
    /// nil → the page's "Manage routines" opens the routines list in place.
    var onOpenRoutines: (() -> Void)?
    @State private var shown = false
    @State private var showRoutines = false

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenAgentPage)) { _ in
                guard enabled else { return }
                shown = true
            }
            .sheet(isPresented: $shown) {
                NanoMuseAgentPage(
                    onOpenSession: { id in shown = false; onOpenSession(id) },
                    onPrefillChat: { text in shown = false; onPrefillChat(text) },
                    onOpenRoutines: {
                        shown = false
                        if let onOpenRoutines { onOpenRoutines() } else { showRoutines = true }
                    }
                )
            }
            .sheet(isPresented: $showRoutines) {
                NavigationStack {
                    NanoMuseRoutinesView()
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(AppLocalized("Done")) { showRoutines = false } } }
                }
            }
    }
}

extension View {
    func nanoMuseAgentPagePresenter(enabled: Bool, onOpenSession: @escaping (String) -> Void, onPrefillChat: @escaping (String) -> Void, onOpenRoutines: (() -> Void)?) -> some View {
        modifier(NanoMuseAgentPagePresenter(enabled: enabled, onOpenSession: onOpenSession, onPrefillChat: onPrefillChat, onOpenRoutines: onOpenRoutines))
    }
}

/// Presents the avatar studio when the header's face is tapped.
struct NanoMuseStudioPresenter: ViewModifier {
    var enabled: Bool
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenAvatarStudio)) { _ in
                guard enabled else { return }
                shown = true
            }
            .sheet(isPresented: $shown) {
                NanoMuseAvatarStudioView()
            }
    }
}

extension View {
    func nanoMuseStudioPresenter(enabled: Bool) -> some View {
        modifier(NanoMuseStudioPresenter(enabled: enabled))
    }
}

// MARK: - Main chat

/// The one conversation the Chat tab always shows. Remembered across
/// launches (UserDefaults); resolved as: the remembered session when it
/// still exists → the most recent session → a fresh draft.
@MainActor
final class NanoMuseMainChat: ObservableObject {
    static let key = "nanomuse.main_chat.session"
    static let draftPrefix = "__new__"

    @Published private(set) var chatId: String?
    @Published private(set) var isDraft = false

    private var cancellables: Set<AnyCancellable> = []

    init() {
        NotificationCenter.default.publisher(for: .sessionDidCreate)
            .receive(on: RunLoop.main)
            .sink { [weak self] note in self?.sessionCreated(note) }
            .store(in: &cancellables)
    }

    func resolve() {
        Task { @MainActor [self] in
            let remembered = UserDefaults.standard.string(forKey: Self.key)
            if let remembered, await ChatStore.shared.sessionExists(id: remembered) {
                set(remembered, draft: false)
                return
            }
            let sessions = await ChatStore.shared.listSessions()
            if let latest = sessions.filter({ !$0.isRemote }).max(by: { $0.updatedAt < $1.updatedAt }) {
                UserDefaults.standard.set(latest.id, forKey: Self.key)
                set(latest.id, draft: false)
                return
            }
            set(Self.draftPrefix + UUID().uuidString, draft: true)
        }
    }

    /// Pin another conversation to the Chat tab.
    func pin(_ id: String) {
        UserDefaults.standard.set(id, forKey: Self.key)
        set(id, draft: false)
    }

    /// Start the main chat over with an empty draft.
    func startFresh() {
        UserDefaults.standard.removeObject(forKey: Self.key)
        set(Self.draftPrefix + UUID().uuidString, draft: true)
    }

    private func set(_ id: String, draft: Bool) {
        isDraft = draft
        chatId = id
    }

    private func sessionCreated(_ note: Notification) {
        guard isDraft, let realId = note.object as? String else { return }
        let draftId = (note.userInfo as? [String: String])?["draftId"]
        guard draftId == chatId else { return }
        // The draft became a real session: remember it, keep the view as is
        // (the view model is already cached under the real id).
        UserDefaults.standard.set(realId, forKey: Self.key)
    }
}

// MARK: - Keyboard

/// Hides the bottom bar while the keyboard is up, as Android's IME does.
@MainActor
final class NanoMuseKeyboardWatcher: ObservableObject {
    @Published private(set) var visible = false
    private var cancellables: Set<AnyCancellable> = []

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.visible = true }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.visible = false }
            .store(in: &cancellables)
    }
}

// MARK: - Home

struct NanoMuseHomeView: View {
    @StateObject private var main = NanoMuseMainChat()
    @StateObject private var keyboard = NanoMuseKeyboardWatcher()
    @ObservedObject private var star = NanoMuseStarWatch.shared

    @State private var tab: NanoMuseTab = .chat
    @State private var drawerOpen = false
    @State private var chatPath: [String] = []
    @State private var showClassic = false
    @State private var classicWantsSettings = false
    @State private var showNanoMuseSettings = false
    @State private var showCoding = false

    var body: some View {
        ZStack {
            chatLayer
                .opacity(tab == .chat ? 1 : 0)
                .allowsHitTesting(tab == .chat)
                .accessibilityHidden(tab != .chat)
            if tab != .chat {
                roomLayer
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.15), value: tab)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !keyboard.visible {
                NanoMuseBottomBar(selected: $tab) { picked in
                    if picked == tab, picked != .chat { return }
                    tab = picked
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: keyboard.visible)
        .overlay {
            NanoMuseDrawer(
                isOpen: $drawerOpen,
                currentId: chatPath.last ?? main.chatId,
                mainId: main.chatId,
                onOpenSession: { id in openSideChat(id) },
                onNewChat: { openSideChat(NanoMuseMainChat.draftPrefix + UUID().uuidString) },
                onPinMain: { id in
                    chatPath.removeAll()
                    main.pin(id)
                    tab = .chat
                },
                onAllChats: { showClassic = true },
                onSettings: { showNanoMuseSettings = true }
            )
        }
        .nanoMuseStudioPresenter(enabled: !showClassic)
        .nanoMuseAgentPagePresenter(
            enabled: !showClassic,
            onOpenSession: { id in openSideChat(id) },
            onPrefillChat: { text in prefillMainChat(text) },
            onOpenRoutines: { tab = .goals }
        )
        .sheet(isPresented: $showClassic) {
            NanoMuseClassicCover(wantsSettings: classicWantsSettings)
                .onDisappear { classicWantsSettings = false }
        }
        .sheet(isPresented: $showCoding) {
            NavigationStack {
                NanoMuseCodingView()
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button(AppLocalized("Done")) { showCoding = false } } }
            }
        }
        .sheet(isPresented: $showNanoMuseSettings) {
            NavigationStack {
                NanoMuseSettingsView(onAllSettings: {
                    showNanoMuseSettings = false
                    classicWantsSettings = true
                    showClassic = true
                })
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(AppLocalized("Done")) { showNanoMuseSettings = false } } }
            }
        }
        .onAppear {
            if main.chatId == nil { main.resolve() }
            // A notification tap that launched the app cold: the conversation it named.
            if let id = NotificationNavigationStore.shared.takePending() { openSideChat(id) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenChat)) { note in
            guard let id = note.object as? String else { return }
            openSideChat(id)
        }
        .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenRoom)) { note in
            // A fence card's "See in Goals" / "Open the feed".
            switch note.object as? String {
            case "goals": tab = .goals
            case "feed": tab = .feed
            case "ideas": tab = .ideas
            case "library": tab = .library
            default: break
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenRoutines)) { _ in
            tab = .goals
        }
        .onReceive(NotificationCenter.default.publisher(for: .openSessionFromIntent)) { note in
            // A notification tap ("Check-in: … — open to run it") or a Shortcut: show that conversation.
            guard let id = note.userInfo?["sessionId"] as? String, !id.isEmpty else { return }
            openSideChat(id)
        }
    }

    /// Words in the main chat's composer ("Change your avatar to "), with the chat on screen.
    private func prefillMainChat(_ text: String) {
        chatPath.removeAll()
        tab = .chat
        NotificationCenter.default.post(name: .nanoMuseComposerPrefill, object: main.chatId, userInfo: ["text": text])
    }

    /// A message sent in the main chat on the person's behalf (a goal's opener, as Android's sendToMainChat).
    private func sendToMainChat(_ text: String) {
        chatPath.removeAll()
        tab = .chat
        if let id = main.chatId, !main.isDraft, let vm = ViewModelCache.shared.get(for: id) {
            vm.nmSendNow(text)
        } else {
            NotificationCenter.default.post(name: .nanoMuseComposerPrefill, object: main.chatId, userInfo: ["text": text, "send": true])
        }
    }

    private func openSideChat(_ id: String) {
        drawerOpen = false
        tab = .chat
        if id == main.chatId {
            chatPath.removeAll()
            return
        }
        chatPath = [id]
    }

    // MARK: Chat layer

    private var chatLayer: some View {
        NavigationStack(path: $chatPath) {
            Group {
                if let id = main.chatId {
                    AIChatView(sessionId: main.isDraft ? nil : id, draftId: main.isDraft ? id : nil)
                        .id(id)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        drawerOpen = true
                    } label: {
                        Image(systemName: "line.3.horizontal")
                    }
                    .accessibilityLabel(Text(AppLocalized("Chats and settings")))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    // Android: the Chat room's ••• menu — the coding agents, then the shared rows.
                    Menu {
                        Button { showCoding = true } label: { Label(AppLocalized("Coding agents"), systemImage: "chevron.left.forwardslash.chevron.right") }
                        Button { tab = .goals } label: { Label(AppLocalized("Scheduled tasks"), systemImage: "clock") }
                        Divider()
                        Button { showNanoMuseSettings = true } label: { Label(AppLocalized("Settings"), systemImage: "gearshape") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel(Text(AppLocalized("More")))
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if let moment = star.card {
                    NanoMuseStarCard(text: NanoMuseStar.text(moment)) {
                        star.dismiss()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(NanoMuseTones.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 12)
                    .padding(.top, 6)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: star.card)
            .navigationDestination(for: String.self) { id in
                let draft = id.hasPrefix(NanoMuseMainChat.draftPrefix)
                AIChatView(sessionId: draft ? nil : id, draftId: draft ? id : nil)
                    .id(id)
            }
        }
    }

    // MARK: Rooms

    @ViewBuilder
    private var roomLayer: some View {
        switch tab {
        case .chat:
            EmptyView()
        case .feed:
            NanoMuseFeedRoom(
                onMenu: { drawerOpen = true },
                onDiscuss: { post in discussPost(post) },
                onOpenSession: { id in openSideChat(id) }
            )
        case .ideas:
            NanoMuseIdeasRoom(
                onMenu: { drawerOpen = true },
                onSend: { prompt in startChat(with: prompt) },
                onCreateRoutine: { idea in createRoutine(from: idea) },
                onStartGoal: { category, seed in startGoal(category, seed: seed) },
                onMore: { showNanoMuseSettings = true }
            )
        case .goals:
            NanoMuseGoalsRoom(
                onMenu: { drawerOpen = true },
                onStartGoal: { category in startGoal(category) },
                onOpenSession: { id in openSideChat(id) },
                onMore: { showNanoMuseSettings = true }
            )
        case .library:
            NanoMuseLibraryRoom(onMenu: { drawerOpen = true }, sessionId: main.isDraft ? nil : main.chatId, onMore: { showNanoMuseSettings = true })
        }
    }

    /// "Create a goal › Health": the opener goes to the main chat; the model takes it from there (GoalFlow).
    private func startGoal(_ category: NanoMuseGoalCategory, seed: String? = nil) {
        guard let id = main.chatId else { return }
        let opener = NanoMuseGoalFlow.startCreation(session: id, category: category)
        let trimmed = (seed ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        sendToMainChat(trimmed.isEmpty ? opener : opener + " " + trimmed)
    }

    /// A routine from an idea: created at the idea's time (9:00 when it has none), then the editor.
    private func createRoutine(from idea: NanoMuseIdea) {
        let at = NanoMuseDay.parseClock(idea.time) ?? (hour: 9, minute: 0)
        let routine = NanoMuseScheduler.shared.create(NanoMuseRoutine(
            label: String(idea.title.prefix(40)),
            prompt: idea.promptText,
            hour: at.hour,
            minute: at.minute,
            repeatMode: .daily
        ))
        NotificationCenter.default.post(name: .nanoMuseEditRoutine, object: routine.id)
    }

    /// "Discuss" on a feed card: a side chat that opens on the post.
    private func discussPost(_ post: NanoMusePost) {
        Task { @MainActor in
            let vm = ViewModelCache.shared.createDraft()
            let id = await vm.ensureSessionReturningId()
            await ChatStore.shared.updateSessionTitle(id, title: String(post.title.prefix(40)))
            ViewModelCache.shared.cacheDraft(vm, sessionId: id)
            openSideChat(id)
            vm.nmSendNow(NanoMuseFeedFlow.discussOpener(post))
        }
    }

    /// A new side chat with the text already in the composer.
    private func startChat(with prompt: String) {
        let draftId = NanoMuseMainChat.draftPrefix + UUID().uuidString
        ViewModelCache.pendingTransfer = ViewModelCache.PendingTransfer(targetId: draftId, inputText: prompt, attachments: [])
        openSideChat(draftId)
    }
}

extension Notification.Name {
    /// `object` is a session id (or a `__new__…` draft id): the shell shows it.
    static let nanoMuseOpenChat = Notification.Name("nanoMuse.openChat")
    /// `object` is a routine id: the Goals room opens its editor.
    static let nanoMuseEditRoutine = Notification.Name("nanoMuse.editRoutine")
}

/// The upstream layout, presented from the drawer as a sheet (swipe down
/// to come back). Opening Settings goes through the deep-link coordinator
/// once the view is on screen.
private struct NanoMuseClassicCover: View {
    var wantsSettings: Bool

    var body: some View {
        ContentView()
            .nanoMuseStudioPresenter(enabled: true)
            .onAppear {
                guard wantsSettings else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    DeepLinkCoordinator.shared.pendingSettingsTarget = .home
                }
            }
    }
}

// MARK: - Bottom bar

struct NanoMuseBottomBar: View {
    @Binding var selected: NanoMuseTab
    var onPick: (NanoMuseTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(NanoMuseTab.allCases) { tab in
                Button {
                    onPick(tab)
                } label: {
                    Image(systemName: selected == tab ? tab.selectedSymbol : tab.symbol)
                        .font(.system(size: 22, weight: selected == tab ? .semibold : .regular))
                        .foregroundStyle(selected == tab ? Color.primary : Color.secondary)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(tab.title))
                .accessibilityAddTraits(selected == tab ? .isSelected : [])
            }
        }
        .background(.bar)
        .overlay(alignment: .top) {
            NanoMuseTones.hairline.frame(height: 0.5)
        }
    }
}

// MARK: - Room header

/// The title row at the top of Feed / Ideas / Goals / Library: hamburger,
/// title, optional trailing content.
struct NanoMuseTabHeader<Trailing: View>: View {
    var title: String
    var onMenu: () -> Void
    @ViewBuilder var trailing: () -> Trailing

    init(title: String, onMenu: @escaping () -> Void, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title
        self.onMenu = onMenu
        self.trailing = trailing
    }

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onMenu) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .medium))
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(AppLocalized("Chats and settings")))
            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .lineLimit(1)
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }
}

extension NanoMuseTabHeader where Trailing == EmptyView {
    init(title: String, onMenu: @escaping () -> Void) {
        self.init(title: title, onMenu: onMenu) { EmptyView() }
    }
}

// MARK: - Drawer

/// The side drawer: the other chats, a new one, and the way to the upstream
/// layout and Settings.
struct NanoMuseDrawer: View {
    @Binding var isOpen: Bool
    var currentId: String?
    var mainId: String?
    var onOpenSession: (String) -> Void
    var onNewChat: () -> Void
    var onPinMain: (String) -> Void
    var onAllChats: () -> Void
    var onSettings: () -> Void

    @State private var sessions: [ChatSession] = []
    @State private var query = ""
    @State private var dragOffset: CGFloat = 0

    private var width: CGFloat { min(320, UIScreen.main.bounds.width * 0.82) }

    var body: some View {
        ZStack(alignment: .leading) {
            if isOpen {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .onTapGesture { close() }
                    .transition(.opacity)
                panel
                    .frame(width: width)
                    .offset(x: min(0, dragOffset))
                    .transition(.move(edge: .leading))
                    .gesture(
                        DragGesture()
                            .onChanged { v in dragOffset = v.translation.width }
                            .onEnded { v in
                                if v.translation.width < -60 { close() }
                                dragOffset = 0
                            }
                    )
            }
        }
        .animation(.easeInOut(duration: 0.22), value: isOpen)
        .onChange(of: isOpen) { open in
            if open { refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sessionDidUpdate).throttle(for: .seconds(1), scheduler: RunLoop.main, latest: true)) { _ in
            if isOpen { refresh() }
        }
    }

    private var filtered: [ChatSession] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let own = sessions.filter { !$0.isRemote }
        guard !q.isEmpty else { return own }
        return own.filter { ($0.title ?? "").lowercased().contains(q) || ($0.lastMessage ?? "").lowercased().contains(q) }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(AppLocalized("Chats"))
                    .font(.title3.weight(.semibold))
                Spacer()
                Button {
                    close()
                    onNewChat()
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 18, weight: .medium))
                }
                .accessibilityLabel(Text(AppLocalized("New chat")))
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)

            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(AppLocalized("Search chats"), text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(NanoMuseTones.fill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 6)

            List {
                ForEach(filtered) { session in
                    Button {
                        close()
                        onOpenSession(session.id)
                    } label: {
                        row(session)
                    }
                    .listRowBackground(session.id == currentId ? NanoMuseTones.fill : Color.clear)
                    .contextMenu {
                        if session.id != mainId {
                            Button {
                                close()
                                onPinMain(session.id)
                            } label: {
                                Label(AppLocalized("Pin as the main chat"), systemImage: "pin")
                            }
                        }
                    }
                }
                if filtered.isEmpty {
                    Text(AppLocalized("No chats yet"))
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)

            Divider()
            footerRow(AppLocalized("All chats"), symbol: "list.bullet.rectangle") {
                close()
                onAllChats()
            }
            footerRow(AppLocalized("Settings"), symbol: "gearshape") {
                close()
                onSettings()
            }
            .padding(.bottom, 8)
        }
        .background(NanoMuseTones.surface.ignoresSafeArea())
    }

    private func row(_ session: ChatSession) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text((session.title?.isEmpty == false ? session.title : nil) ?? AppLocalized("Untitled chat"))
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if session.id == mainId {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                }
                if let last = session.lastMessage, !last.isEmpty {
                    Text(last)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Text(Self.when(session.updatedAt))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func footerRow(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .frame(width: 24)
                Text(title)
                Spacer()
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func close() {
        isOpen = false
    }

    private func refresh() {
        Task { @MainActor [self] in
            let list = await ChatStore.shared.listSessions()
            sessions = list.sorted { $0.updatedAt > $1.updatedAt }
        }
    }

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()

    static func when(_ date: Date) -> String {
        relative.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Star moments

/// Counts finished tasks on the main thread's activity tracker and raises
/// the star card at the first and the tenth; `newLook` comes from the
/// avatar studio.
@MainActor
final class NanoMuseStarWatch: ObservableObject {
    static let shared = NanoMuseStarWatch()

    @Published private(set) var card: NanoMuseStar.Moment?

    private var active: Set<String> = []
    private var cancellable: AnyCancellable?

    private init() {}

    func start() {
        guard cancellable == nil else { return }
        active = SessionActivityTracker.shared.activeSessions
        cancellable = SessionActivityTracker.shared.$activeSessions
            .receive(on: RunLoop.main)
            .sink { [weak self] now in self?.activeChanged(now) }
    }

    func show(_ moment: NanoMuseStar.Moment) {
        guard NanoMuseStar.due(moment) else { return }
        NanoMuseStar.shown(moment)
        card = moment
    }

    func dismiss() {
        card = nil
    }

    private func activeChanged(_ now: Set<String>) {
        let ended = active.subtracting(now)
        active = now
        guard !ended.isEmpty else { return }
        for sid in ended {
            if let vm = ViewModelCache.shared.get(for: sid) {
                if vm.errorMessage != nil || vm.messages.last?.error != nil { continue }
                guard vm.messages.contains(where: { $0.role == .user }) else { continue }
            }
            let count = NanoMuseStar.countTask()
            if let moment = NanoMuseStar.moment(forTask: count), NanoMuseStar.due(moment) {
                show(moment)
            }
        }
    }
}
