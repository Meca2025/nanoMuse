//
//  NanoMuseShell.swift
//  nanoMuse
//
//  The Muse shell on iPhone: one main chat pinned to the Chat tab, a bottom
//  bar for Chat / Feed / Ideas / Goals / Library, and a side drawer with
//  the other chats. iPad keeps the upstream split layout (ContentView),
//  which also stays reachable from the drawer. Android: ui/home/*.
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
    @State private var showStudio = false

    private var usesShell: Bool {
        shellEnabled && UIDevice.current.userInterfaceIdiom == .phone
    }

    var body: some View {
        Group {
            if usesShell {
                NanoMuseHomeView()
            } else {
                ContentView()
                    .nanoMuseStudioPresenter(enabled: true)
            }
        }
        .onAppear {
            NanoMuseProfileSync.shared.start()
            NanoMuseStarWatch.shared.start()
        }
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
                onSettings: {
                    classicWantsSettings = true
                    showClassic = true
                }
            )
        }
        .nanoMuseStudioPresenter(enabled: !showClassic)
        .sheet(isPresented: $showClassic) {
            NanoMuseClassicCover(wantsSettings: classicWantsSettings)
                .onDisappear { classicWantsSettings = false }
        }
        .onAppear {
            if main.chatId == nil { main.resolve() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .nanoMuseOpenChat)) { note in
            guard let id = note.object as? String else { return }
            openSideChat(id)
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
            NanoMuseFeedRoom(onMenu: { drawerOpen = true })
        case .ideas:
            NanoMuseIdeasRoom(onMenu: { drawerOpen = true }) { prompt in
                startChat(with: prompt)
            }
        case .goals:
            NanoMuseGoalsRoom(onMenu: { drawerOpen = true }) { prompt in
                startChat(with: prompt)
            }
        case .library:
            NanoMuseLibraryRoom(onMenu: { drawerOpen = true }, sessionId: main.isDraft ? nil : main.chatId)
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
