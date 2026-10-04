import Foundation
import UIKit

/// The account as the phone's account page reads it — `GET /v1/me` in full (relay 0.14+: the pool
/// in yuan, usage by kind and by model, the invite), the devices holding a key, the account's own
/// timeline, the password, and the ways out. Every field is optional on the wire: an older relay
/// sends fewer, and the page shows what it got. Mirror of the Android `CloudAccountScreen` data
/// and the desktop `AccountPage`.
struct NanoMuseSheet: Sendable {
    struct Spend: Sendable {
        var total: Double
        var grant: Double?
        var left: Double?
        var unlimited: Bool
        var warn: Bool
        var usdCny: Double?
        var inviteBonusCny: Double?
        var inviteeBonusCny: Double?
        var ownKeyDocs: String?

        /// What is left, from the relay or from the grant and the total.
        var remaining: Double? {
            if let left { return left }
            guard let grant else { return nil }
            return max(grant - total, 0)
        }
        var exhausted: Bool { !unlimited && grant != nil && (remaining ?? 1) <= 0 }
        var low: Bool { !unlimited && (warn || exhausted || ((grant ?? 0) > 0 && total / (grant ?? 1) >= 0.8)) }
    }

    struct UsageRow: Identifiable, Sendable {
        var id: String { model ?? kind }
        var kind: String
        var model: String?
        var requests: Int
        var promptTokens: Int64
        var completionTokens: Int64
        var costCny: Double
    }

    struct Invite: Sendable {
        var code: String
        var url: String
        var invites: Int
        var bonusCny: Double
        var earnedCny: Double
    }

    var hint: String
    var channel: String
    var member: Bool
    var hasPassword: Bool
    var sessions: Int
    var spend: Spend?
    var today: [UsageRow]
    var total: [UsageRow]
    var byModel: [UsageRow]
    var invite: Invite?

    static func parse(_ reply: [String: Any]) -> NanoMuseSheet {
        let account = reply["account"] as? [String: Any] ?? [:]
        func num(_ v: Any?) -> Double? {
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String { return Double(s) }
            return nil
        }
        func rows(_ v: Any?) -> [UsageRow] {
            (v as? [[String: Any]] ?? []).map { r in
                UsageRow(
                    kind: r["kind"] as? String ?? "",
                    model: r["model"] as? String,
                    requests: Int(num(r["requests"]) ?? 0),
                    promptTokens: Int64(num(r["prompt_tokens"]) ?? 0),
                    completionTokens: Int64(num(r["completion_tokens"]) ?? 0),
                    costCny: num(r["cost_cny"]) ?? 0
                )
            }
        }
        var spend: Spend?
        if let s = reply["spend"] as? [String: Any] {
            spend = Spend(
                total: num(s["total"]) ?? 0,
                grant: num(s["grant"]),
                left: s["left"] is NSNull ? nil : num(s["left"]),
                unlimited: (s["unlimited"] as? Bool) ?? ((s["unlimited"] as? NSNumber)?.boolValue ?? false),
                warn: (s["warn"] as? Bool) ?? ((s["warn"] as? NSNumber)?.boolValue ?? false),
                usdCny: num(s["usd_cny"]),
                inviteBonusCny: num(s["invite_bonus_cny"]),
                inviteeBonusCny: num(s["invitee_bonus_cny"]),
                ownKeyDocs: (s["own_key_docs"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            )
        }
        var invite: Invite?
        if let i = reply["invite"] as? [String: Any], let code = i["code"] as? String, !code.isEmpty {
            invite = Invite(
                code: code,
                url: i["url"] as? String ?? "",
                invites: Int(num(i["invites"]) ?? 0),
                bonusCny: num(i["bonus_cny"]) ?? 5,
                earnedCny: num(i["earned_cny"]) ?? 0
            )
        }
        let usage = reply["usage"] as? [String: Any] ?? [:]
        let todayBlock = usage["today"] as? [String: Any] ?? [:]
        let totalBlock = usage["total"] as? [String: Any] ?? [:]
        return NanoMuseSheet(
            hint: account["hint"] as? String ?? "",
            channel: account["channel"] as? String ?? "",
            member: (account["member"] as? Bool) ?? ((account["member"] as? NSNumber)?.boolValue ?? false),
            hasPassword: (account["has_password"] as? Bool) ?? ((account["has_password"] as? NSNumber)?.boolValue ?? false),
            sessions: Int(num(account["sessions"]) ?? 0),
            spend: spend,
            today: rows(todayBlock["by_kind"]),
            total: rows(totalBlock["by_kind"]),
            byModel: rows(totalBlock["by_model"]),
            invite: invite
        )
    }
}

/// One device holding a key for the account.
struct NanoMuseSession: Identifiable, Sendable {
    var id: String { prefix }
    var prefix: String
    var device: String
    var via: String
    var createdAt: Date
    var lastUsedAt: Date?
    var current: Bool
}

/// A line of the account's own timeline: sign-ins, settings, refusals — never message content.
struct NanoMuseEvent: Identifiable, Sendable {
    var id: String
    var at: Date
    var kind: String
    var detail: String
}

/// `GET /v1/config` (relay 0.15): what a client prints before anyone signs in.
struct NanoMuseConfig: Sendable {
    var allowanceCny: Double?
    var inviteBonusCny: Double?
    var inviteeBonusCny: Double?
    var signupOpen: Bool?
}

extension NanoMuseCloud {
    private static var configCache: (at: Date, config: NanoMuseConfig)?

    /// The relay's public figures, cached for ten minutes; empty when the relay is older.
    static func config() async -> NanoMuseConfig {
        if let configCache, Date().timeIntervalSince(configCache.at) < 600 { return configCache.config }
        func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }
        let reply = (try? await call("GET", "/v1/config", body: nil, token: nil)) ?? [:]
        let config = NanoMuseConfig(
            allowanceCny: num(reply["allowance_cny"]),
            inviteBonusCny: num(reply["invite_bonus_cny"]),
            inviteeBonusCny: num(reply["invitee_bonus_cny"]),
            signupOpen: reply["signup_open"] as? Bool
        )
        configCache = (Date(), config)
        return config
    }

    private static func key() throws -> String {
        guard let key = apiKey else { throw CloudError(code: "signed_out", message: "Sign in first", status: 401) }
        return key
    }

    /// The whole of `/v1/me`.
    static func sheet() async throws -> NanoMuseSheet {
        let reply = try await call("GET", "/v1/me", body: nil, token: key())
        account = parseAccount(reply)
        return NanoMuseSheet.parse(reply)
    }

    /// Every device holding a key, this one marked.
    static func sessions() async throws -> [NanoMuseSession] {
        let reply = try await call("GET", "/v1/me/sessions", body: nil, token: key())
        return (reply["sessions"] as? [[String: Any]] ?? []).compactMap { s in
            guard let prefix = s["prefix"] as? String else { return nil }
            let created = (s["created_at"] as? NSNumber)?.doubleValue ?? 0
            let used = (s["last_used_at"] as? NSNumber)?.doubleValue
            return NanoMuseSession(
                prefix: prefix,
                device: s["device"] as? String ?? "",
                via: s["via"] as? String ?? "code",
                createdAt: Date(timeIntervalSince1970: created),
                lastUsedAt: used.map { Date(timeIntervalSince1970: $0) },
                current: (s["current"] as? Bool) ?? ((s["current"] as? NSNumber)?.boolValue ?? false)
            )
        }
    }

    /// Retire one device's key.
    static func revokeSession(prefix: String) async throws {
        let safe = prefix.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? prefix
        _ = try await call("DELETE", "/v1/me/sessions/\(safe)", body: nil, token: key())
    }

    /// The account's timeline, newest first.
    static func events(limit: Int = 40) async throws -> [NanoMuseEvent] {
        let reply = try await call("GET", "/v1/me/events?limit=\(limit)", body: nil, token: key())
        return (reply["events"] as? [[String: Any]] ?? []).enumerated().map { index, e in
            let ts = (e["ts"] as? NSNumber)?.doubleValue ?? 0
            let id = (e["id"] as? NSNumber).map { "\($0)" } ?? "\(ts)-\(index)"
            return NanoMuseEvent(id: id, at: Date(timeIntervalSince1970: ts), kind: e["kind"] as? String ?? "", detail: e["detail"] as? String ?? "")
        }
    }

    /// Set or change the password; an empty `password` with `current` removes it.
    static func setPassword(_ password: String, current: String?) async throws {
        var body: [String: Any] = ["password": password]
        if let current, !current.isEmpty { body["current"] = current }
        _ = try await call("POST", "/v1/auth/password", body: body, token: key())
    }

    /// Every device's key, this phone's included; then the provider leaves the app.
    static func signOutEverywhere() async throws {
        _ = try await call("POST", "/v1/auth/sign-out-all", body: ["all": true], token: key())
        await forgetLocally()
    }

    /// The account, its keys, ledger and devices — gone for good; then the provider leaves the app.
    static func deleteAccount() async throws {
        _ = try await call("POST", "/v1/auth/delete", body: nil, token: key())
        await forgetLocally()
    }

    private static func forgetLocally() async {
        await MainActor.run { NanoMuseHub.shared.stop() }
        if let inst = instance { ProviderConfigStore.shared.removeInstance(inst.id) }
        clear()
    }
}

/// The ask for a star, once at the moments it is fair to: the first sign-in, the first and the
/// tenth task that ran to its end, a face just drawn, the allowance used up. Remembered on the
/// phone (UserDefaults); "Star on GitHub" ends every ask for good. The tone is a thank-you, never
/// a bill: your support is what keeps us going.
enum NanoMuseStar {
    static let repoURL = URL(string: "https://github.com/nano-muse/nanoMuse")!
    private static let starredKey = "nanomuse.star.starred"
    private static let tasksKey = "nanomuse.star.tasks"

    enum Moment: String { case signedIn = "signed_in", firstTask = "first_task", tenthTask = "tenth_task", newLook = "new_look", exhausted }

    static var starred: Bool { UserDefaults.standard.bool(forKey: starredKey) }

    /// One more task that ran to its end on this phone; the count so far.
    static func countTask() -> Int {
        let n = UserDefaults.standard.integer(forKey: tasksKey) + 1
        UserDefaults.standard.set(n, forKey: tasksKey)
        return n
    }

    /// The moment a finished-task count makes due, if any: the first and the tenth.
    static func moment(forTask n: Int) -> Moment? { n == 1 ? .firstTask : n == 10 ? .tenthTask : nil }

    /// The words for a moment (the same words as every other client).
    static func text(_ moment: Moment) -> String {
        switch moment {
        case .signedIn:
            return AppLocalized("Welcome aboard. nanoMuse is free, open source and non-profit — a personal agent that belongs to everyone who runs it. If you believe in that, a star on GitHub is the biggest support you can give: it is how the next person finds their way here.")
        case .firstTask:
            return AppLocalized("First task done. If nanoMuse helped, a star on GitHub would mean a lot to the people building it — your support is what keeps us going.")
        case .tenthTask:
            return AppLocalized("Ten tasks together already. If nanoMuse has become part of your day, a star on GitHub tells others it is worth a try — and tells us to keep going.")
        case .newLook:
            return AppLocalized("A new face, drawn just for you. If you like what nanoMuse is becoming, a star on GitHub helps more people meet it — your support is what keeps us going.")
        case .exhausted:
            return AppLocalized("The free allowance is used up — thank you for coming this far. If nanoMuse has earned it, a star on GitHub is what keeps the project going for everyone.")
        }
    }

    /// Still worth asking: not asked at this moment before, and the person has not gone to star it.
    static func due(_ moment: Moment) -> Bool {
        !starred && !UserDefaults.standard.bool(forKey: "nanomuse.star.\(moment.rawValue)")
    }

    static func shown(_ moment: Moment) {
        UserDefaults.standard.set(true, forKey: "nanomuse.star.\(moment.rawValue)")
    }

    /// Off to GitHub, and no more asking anywhere.
    @MainActor
    static func open() {
        UserDefaults.standard.set(true, forKey: starredKey)
        UIApplication.shared.open(repoURL)
    }
}
