//
//  NanoMuseProfile.swift
//  nanoMuse
//
//  The relay side of the agent's look: pictures drawn through nanoMuse
//  Cloud (/v1/images/*), what a new face would cost (/v1/estimate), and
//  the profile the account's devices share (/v1/me/profile). Android:
//  cloud/ProfileSync.kt, cloud/FaceCost.kt, avatar/ImageGen.kt.
//

import Foundation
import UIKit

// MARK: - Relay media calls

/// Raw relay requests that `NanoMuseCloud.call` (JSON in, JSON out, 30 s)
/// does not cover: picture generation takes a minute and edits are
/// multipart.
enum NanoMuseRelayMedia {
    struct Estimate: Equatable {
        var cny: Double
        var leftCny: Double?
        var unlimited: Bool
        var affordable: Bool
        var inviteBonusCny: Double?
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 180
        config.timeoutIntervalForResource = 300
        return URLSession(configuration: config)
    }()

    @MainActor
    private static func authorized(_ method: String, _ path: String) throws -> URLRequest {
        guard let key = NanoMuseCloud.apiKey else {
            throw NanoMuseCloudError(code: "signed_out", message: AppLocalized("Sign in to nanoMuse Cloud first."), status: 401)
        }
        guard let url = URL(string: NanoMuseCloud.baseURL + path) else {
            throw NanoMuseCloudError(code: "bad_base", message: "Bad relay address", status: 0)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        request.setValue("nanoMuse-iOS/\(version)", forHTTPHeaderField: "User-Agent")
        return request
    }

    private static func perform(_ request: URLRequest) async throws -> [String: Any] {
        let result: (Data, URLResponse)
        do {
            result = try await session.data(for: request)
        } catch {
            throw NanoMuseCloudError(code: "unreachable", message: error.localizedDescription, status: 0)
        }
        let (data, response) = result
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if (200..<300).contains(status) { return object ?? [:] }
        let err = object?["error"] as? [String: Any]
        let code = (err?["code"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "http_\(status)"
        let message = (err?["message"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "HTTP \(status)"
        throw NanoMuseCloudError(code: code, message: message, status: status)
    }

    /// The relay's image model: the first the menu lists with image output.
    @MainActor
    static func imageModel() async throws -> String {
        let request = try authorized("GET", "/v1/models")
        let reply = try await perform(request)
        let models = reply["data"] as? [[String: Any]] ?? []
        for model in models {
            let arch = model["architecture"] as? [String: Any]
            let outputs = arch?["output_modalities"] as? [String] ?? []
            let kind = (model["nanomuse"] as? [String: Any])?["kind"] as? String
            if outputs.contains("image") || kind == "image", let id = model["id"] as? String, !id.isEmpty {
                return id
            }
        }
        throw NanoMuseCloudError(code: "model_not_offered", message: AppLocalized("nanoMuse Cloud offers no image model right now."), status: 404)
    }

    @MainActor
    static func estimate(images: Int, clips: Int = 0) async throws -> Estimate {
        let request = try authorized("GET", "/v1/estimate?images=\(images)&clips=\(clips)")
        let reply = try await perform(request)
        func num(_ key: String) -> Double? {
            if let d = reply[key] as? Double { return d }
            if let i = reply[key] as? Int { return Double(i) }
            if let s = reply[key] as? String { return Double(s) }
            return nil
        }
        let unlimited = (reply["unlimited"] as? Bool) ?? false
        return Estimate(
            cny: num("cny") ?? 0,
            leftCny: unlimited ? nil : num("left_cny"),
            unlimited: unlimited,
            affordable: (reply["affordable"] as? Bool) ?? true,
            inviteBonusCny: num("invite_bonus_cny")
        )
    }

    /// One picture from a prompt, as the decoded image.
    @MainActor
    static func generate(prompt: String, model: String, size: String = "1024*1024") async throws -> UIImage {
        var request = try authorized("POST", "/v1/images/generations")
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": model, "prompt": prompt, "n": 1, "size": size,
        ])
        return try await decodeImage(try await perform(request))
    }

    /// The picture posed again (a new mood of the same face).
    @MainActor
    static func edit(_ image: UIImage, prompt: String, model: String, size: String = "1024*1024") async throws -> UIImage {
        var request = try authorized("POST", "/v1/images/edits")
        let boundary = "nanomuse-" + UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        guard let png = NanoMuseFaceStore.square(image, side: 768).pngData() else {
            throw NanoMuseCloudError(code: "bad_image", message: "The picture could not be encoded", status: 0)
        }
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append(value.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        field("model", model)
        field("prompt", prompt)
        field("n", "1")
        field("size", size)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"face.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(png)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        return try await decodeImage(try await perform(request))
    }

    private static func decodeImage(_ reply: [String: Any]) async throws -> UIImage {
        let data = reply["data"] as? [[String: Any]] ?? []
        guard let first = data.first else {
            throw NanoMuseCloudError(code: "bad_reply", message: "The relay sent no picture", status: 0)
        }
        if let b64 = first["b64_json"] as? String, let bytes = Data(base64Encoded: b64), let image = UIImage(data: bytes) {
            return image
        }
        if let urlString = first["url"] as? String, let url = URL(string: urlString) {
            let (bytes, _) = try await session.data(from: url)
            if let image = UIImage(data: bytes) { return image }
        }
        throw NanoMuseCloudError(code: "bad_reply", message: "The relay sent a picture that could not be read", status: 0)
    }

    // MARK: Profile

    struct Profile {
        var rev: Int
        var name: String
        var avatar: String
        var style: String
        var description: String
        var faceId: String
        var hasFace: Bool
        var face: [String: String]?
    }

    @MainActor
    static func profile(withFace: Bool) async throws -> Profile {
        let request = try authorized("GET", "/v1/me/profile?face=\(withFace ? "true" : "false")")
        let reply = try await perform(request)
        return Profile(
            rev: (reply["rev"] as? Int) ?? Int((reply["rev"] as? Double) ?? 0),
            name: reply["name"] as? String ?? "",
            avatar: reply["avatar"] as? String ?? "",
            style: reply["style"] as? String ?? "",
            description: reply["description"] as? String ?? "",
            faceId: reply["face_id"] as? String ?? "",
            hasFace: (reply["has_face"] as? Bool) ?? (reply["face"] != nil && !(reply["face"] is NSNull)),
            face: reply["face"] as? [String: String]
        )
    }

    /// Writes the look. `face` nil keeps the pictures the relay has; an
    /// empty map is not allowed, so a reset sends `avatar: "dragon"` with
    /// `face: NSNull()`.
    @MainActor
    @discardableResult
    static func putProfile(_ body: [String: Any]) async throws -> Int {
        var request = try authorized("PUT", "/v1/me/profile")
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        var payload = body
        payload["device"] = NanoMuseHub.shared.name
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let reply = try await perform(request)
        return (reply["rev"] as? Int) ?? Int((reply["rev"] as? Double) ?? 0)
    }

    // MARK: Data controls

    struct Contribute: Equatable {
        var on: Bool
        var samples: Int
        var defaultOn: Bool
        var privacyURL: String
    }

    @MainActor
    static func setContribute(_ on: Bool) async throws -> Contribute {
        var request = try authorized("POST", "/v1/me/contribute")
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["on": on])
        return parseContribute(try await perform(request))
    }

    @MainActor
    static func contribute() async throws -> Contribute {
        let request = try authorized("GET", "/v1/me")
        let reply = try await perform(request)
        let block = reply["contribute"] as? [String: Any] ?? [:]
        return parseContribute(block)
    }

    @MainActor
    static func deleteSamples() async throws -> Int {
        let request = try authorized("DELETE", "/v1/me/samples")
        let reply = try await perform(request)
        return (reply["deleted"] as? Int) ?? Int((reply["deleted"] as? Double) ?? 0)
    }

    private static func parseContribute(_ d: [String: Any]) -> Contribute {
        Contribute(
            on: (d["on"] as? Bool) ?? false,
            samples: (d["samples"] as? Int) ?? Int((d["samples"] as? Double) ?? 0),
            defaultOn: (d["default_on"] as? Bool) ?? false,
            privacyURL: d["privacy_url"] as? String ?? ""
        )
    }
}

// MARK: - Profile sync

/// Keeps the face this phone wears in step with the account: pulls the
/// profile when the app starts or the hub says another device wrote it,
/// pushes after the studio adopted or reset a face.
@MainActor
final class NanoMuseProfileSync: ObservableObject {
    static let shared = NanoMuseProfileSync()

    private enum Keys {
        static let rev = "nanomuse.profile.rev"
    }

    @Published private(set) var syncing = false
    @Published private(set) var lastError: String?

    private var pulling = false

    private init() {}

    /// Called once from the app root.
    func start() {
        pull()
    }

    /// The hub heard `{"type":"profile","rev":N}` from another device.
    func onHubFrame(_ frame: [String: Any]) {
        let rev = (frame["rev"] as? Int) ?? Int((frame["rev"] as? Double) ?? 0)
        if rev > UserDefaults.standard.integer(forKey: Keys.rev) {
            pull()
        }
    }

    func pull() {
        guard NanoMuseCloud.isSignedIn, !pulling else { return }
        pulling = true
        Task { @MainActor [self] in
            defer { pulling = false }
            do {
                let head = try await NanoMuseRelayMedia.profile(withFace: false)
                let known = UserDefaults.standard.integer(forKey: Keys.rev)
                guard head.rev > known || head.rev == 0 && known == 0 else { return }
                let store = NanoMuseFaceStore.shared
                if head.hasFace {
                    if head.faceId == store.meta.faceId && store.hasCustomFace {
                        UserDefaults.standard.set(head.rev, forKey: Keys.rev)
                        return
                    }
                    let full = try await NanoMuseRelayMedia.profile(withFace: true)
                    var stills: [NanoMuseMood: UIImage] = [:]
                    for (key, b64) in full.face ?? [:] {
                        if let mood = NanoMuseMood(rawValue: key), let bytes = Data(base64Encoded: b64), let img = UIImage(data: bytes) {
                            stills[mood] = img
                        }
                    }
                    if stills[.idle] != nil {
                        store.wear(remote: stills, faceId: full.faceId, description: full.description, style: full.style)
                    }
                } else if head.rev > 0, store.hasCustomFace {
                    // Another device went back to the dragon.
                    store.reset(sync: false)
                }
                UserDefaults.standard.set(head.rev, forKey: Keys.rev)
                lastError = nil
            } catch {
                lastError = NanoMuseCloud.describe(error)
            }
        }
    }

    /// The face on this phone changed: push it.
    func faceChanged() {
        guard NanoMuseCloud.isSignedIn else { return }
        syncing = true
        Task { @MainActor [self] in
            defer { syncing = false }
            do {
                let store = NanoMuseFaceStore.shared
                var body: [String: Any] = [:]
                if store.hasCustomFace {
                    var face: [String: String] = [:]
                    for mood in NanoMuseMood.allCases {
                        if let img = store.custom[mood], let bytes = NanoMuseFaceStore.encodeStill(img) {
                            face[mood.rawValue] = bytes.base64EncodedString()
                        }
                    }
                    body["avatar"] = "face"
                    body["face"] = face
                    body["description"] = store.meta.description
                    body["style"] = store.meta.style
                } else {
                    body["avatar"] = "dragon"
                    body["face"] = NSNull()
                }
                let name = SoulStore.cachedMetadata.name
                if !name.isEmpty { body["name"] = name }
                let rev = try await NanoMuseRelayMedia.putProfile(body)
                UserDefaults.standard.set(rev, forKey: Keys.rev)
                lastError = nil
            } catch {
                lastError = NanoMuseCloud.describe(error)
            }
        }
    }
}
