//
//  NanoMuseSettings.swift
//  nanoMuse
//
//  The nanoMuse page in Settings, and the ••• menu of the home's rooms:
//  the account, coding agents, the routines, the system files, the
//  connectors, data controls, the shell switches. Reached from the drawer,
//  from the agent page and from the top of the upstream Settings list.
//  Android: the ••• menu in ui/home/NanoMuseHome.kt and the nanoMuse rows
//  of its Settings.
//

import SwiftUI

struct NanoMuseSettingsView: View {
    /// Open the upstream Settings sheet (every OpenMinis page is there).
    var onAllSettings: (() -> Void)? = nil

    @AppStorage("nanomuse.shell.enabled") private var shellEnabled = true
    @AppStorage("nanomuse.header.enabled") private var headerEnabled = true
    @ObservedObject private var store = ProviderConfigStore.shared
    @ObservedObject private var scheduler = NanoMuseScheduler.shared
    @State private var confirmWelcome = false

    var body: some View {
        List {
            Section {
                NavigationLink {
                    NanoMuseCloudView()
                } label: {
                    row(NanoMuseCloud.label, symbol: "cloud.fill", tint: .blue, detail: accountDetail)
                }
                NavigationLink {
                    NanoMuseCodingView()
                } label: {
                    row(AppLocalized("Coding agents"), symbol: "chevron.left.forwardslash.chevron.right", tint: .indigo)
                }
                NavigationLink {
                    NanoMuseRoutinesView()
                } label: {
                    row(AppLocalized("Scheduled tasks"), symbol: "clock.fill", tint: .orange, detail: scheduler.routines.isEmpty ? nil : "\(scheduler.routines.count)")
                }
                NavigationLink {
                    NanoMuseSystemFilesView()
                } label: {
                    row(AppLocalized("System files"), symbol: "doc.text.fill", tint: .gray)
                }
                NavigationLink {
                    NanoMuseConnectorsView()
                } label: {
                    row(AppLocalized("Connectors"), symbol: "square.stack.3d.up.fill", tint: .teal)
                }
                NavigationLink {
                    NanoMuseDataControlsView()
                } label: {
                    row(AppLocalized("Data controls"), symbol: "hand.raised.fill", tint: .green)
                }
            } header: {
                Text("nanoMuse")
            }

            Section {
                Toggle(isOn: $shellEnabled) {
                    row(AppLocalized("Muse home"), symbol: "square.grid.2x2.fill", tint: .pink)
                }
                .tint(NanoMuseTones.action)
                Toggle(isOn: $headerEnabled) {
                    row(AppLocalized("Face and name in the chat header"), symbol: "face.smiling.fill", tint: .purple)
                }
                .tint(NanoMuseTones.action)
            } header: {
                Text(AppLocalized("Home"))
            } footer: {
                Text(AppLocalized("Muse home is the chat with Feed, Ideas, Goals and Library beside it, on iPhone and iPad. Off, the app opens on the OpenMinis layout; the drawer still has it."))
            }

            Section {
                Button {
                    confirmWelcome = true
                } label: {
                    row(AppLocalized("Show the welcome again"), symbol: "sparkles", tint: .yellow)
                }
                .foregroundStyle(.primary)
            } footer: {
                Text(AppLocalized("Brings back the first-run pages and the first conversation on the next new chat. Nothing is deleted; the agent keeps its name."))
            }

            if let onAllSettings {
                Section {
                    Button {
                        onAllSettings()
                    } label: {
                        row(AppLocalized("All settings"), symbol: "gearshape.fill", tint: .gray)
                    }
                    .foregroundStyle(.primary)
                } footer: {
                    Text(AppLocalized("Providers, model groups, skills, appearance and the rest of the OpenMinis settings."))
                }
            }
        }
        .navigationTitle(AppLocalized("nanoMuse"))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(AppLocalized("Show the welcome again?"), isPresented: $confirmWelcome, titleVisibility: .visible) {
            Button(AppLocalized("Show it")) {
                NanoMuseFirstRun.reset()
                NanoMuseFirstConversation.shared.reset()
            }
            Button(AppLocalized("Cancel"), role: .cancel) {}
        }
    }

    private var accountDetail: String? {
        _ = store.instances
        guard NanoMuseCloud.isSignedIn else { return AppLocalized("Not signed in") }
        return NanoMuseCloud.account?.hint
    }

    private func row(_ title: String, symbol: String, tint: Color, detail: String? = nil) -> some View {
        HStack {
            Label {
                Text(title)
            } icon: {
                Image(systemName: symbol)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(tint, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            if let detail {
                Spacer()
                Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}

extension NanoMuseFirstRun {
    /// Forget the setup's state so it shows again (the Cloud sign-in and the providers stay).
    static func reset() {
        for key in ["nanomuse.setup.done", "nanomuse.setup.source_chosen"] { UserDefaults.standard.removeObject(forKey: key) }
    }
}

// MARK: - All routines

/// Every routine on this phone, the goal check-ins and the feed's included: on/off, edit, run now.
struct NanoMuseRoutinesView: View {
    @ObservedObject private var scheduler = NanoMuseScheduler.shared
    @ObservedObject private var goals = NanoMuseGoalStore.shared
    @State private var editing: NanoMuseRoutine?
    @Environment(\.openURL) private var openURL

    var body: some View {
        List {
            Section {
                Text(AppLocalized("A routine is a message the agent sends itself at a set time, in its own conversation. On the iPhone it runs when the app is open: when it comes due while the app is asleep, the phone shows a reminder and the run happens as soon as you open it. iOS also wakes the app now and then in the background; when it does, the routine runs there."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if scheduler.routines.isEmpty {
                Section {
                    Text(AppLocalized("Nothing scheduled yet."))
                        .foregroundStyle(.secondary)
                }
            } else {
                Section(AppLocalized("Routines")) {
                    ForEach(scheduler.routines) { routine in
                        routineRow(routine)
                    }
                }
            }
            Section {
                Button {
                    editing = NanoMuseRoutine(label: "", prompt: "", hour: 9, minute: 0)
                } label: {
                    Label(AppLocalized("New routine"), systemImage: "plus")
                }
                Button {
                    scheduler.requestNotificationPermission()
                } label: {
                    Label(AppLocalized("Allow reminders"), systemImage: "bell")
                }
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                } label: {
                    Label(AppLocalized("Background App Refresh in iOS Settings"), systemImage: "arrow.clockwise")
                }
            } footer: {
                Text(AppLocalized("Reminders need notification permission; background runs need Background App Refresh for nanoMuse."))
            }
        }
        .navigationTitle(AppLocalized("Scheduled tasks"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { routine in
            NanoMuseRoutineEditor(routine: routine)
        }
    }

    private func label(for routine: NanoMuseRoutine) -> String {
        if let goalId = routine.goalId, let goal = goals.goal(id: goalId) {
            return String(format: AppLocalized("Check-in: %@"), goal.title)
        }
        return routine.label.isEmpty ? AppLocalized("Routine") : routine.label
    }

    private func routineRow(_ routine: NanoMuseRoutine) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label(for: routine)).font(.body.weight(.medium))
                Text(routine.enabled ? routine.cadence : AppLocalized("Off")).font(.caption).foregroundStyle(.secondary)
                if let next = routine.nextDue(after: Date()), routine.enabled {
                    Text(String(format: AppLocalized("next %@"), NanoMuseDay.relative(next))).font(.caption2).foregroundStyle(.tertiary)
                }
                if let last = routine.runs.first {
                    Text(String(format: last.ok ? AppLocalized("last run %@") : AppLocalized("last run %@, failed"), NanoMuseDay.relative(last.at)))
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            Spacer()
            if scheduler.running.contains(routine.id) {
                ProgressView()
            } else {
                Toggle("", isOn: Binding(get: { routine.enabled }, set: { scheduler.setEnabled(routine.id, $0) }))
                    .labelsHidden()
                    .tint(NanoMuseTones.action)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { editing = routine }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { scheduler.delete(routine.id) } label: { Label(AppLocalized("Delete"), systemImage: "trash") }
            Button { Task { @MainActor in await scheduler.run(routine.id) } } label: { Label(AppLocalized("Run now"), systemImage: "play") }
                .tint(NanoMuseTones.action)
        }
    }
}
