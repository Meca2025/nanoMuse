//
//  NanoMuseImageGen.swift
//  nanoMuse
//
//  Where the pictures for the face come from. With an Alibaba Cloud Bailian
//  key on this phone (an OpenAI-compatible provider whose base URL is on
//  dashscope / aliyuncs), the face is drawn with that key through Model
//  Studio's native multimodal endpoint — the compatible endpoint answers 404
//  to image models. Otherwise through nanoMuse Cloud, where a cost estimate
//  is shown first. Android: avatar/ImageGen.kt.
//

import Foundation
import UIKit

enum NanoMuseImageGen {
    /// A Bailian (DashScope) provider instance on this phone and its key.
    struct OwnKey: Equatable {
        var instanceId: String
        var label: String
        var baseURL: String
        var apiKey: String
        var model: String
    }

    enum Route: Equatable {
        case ownKey(OwnKey)
        case relay
    }

    struct Failure: LocalizedError {
        var message: String
        var errorDescription: String? { message }
    }

    static let defaultsModelKey = "nanomuse.avatar.model"
    static let defaultsInstanceKey = "nanomuse.avatar.instance"
    /// ¥0.18 a picture; the Pro tier draws the same face for more.
    static let recommendedBailianModel = "qwen-image-3.0"

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 180
        config.timeoutIntervalForResource = 300
        return URLSession(configuration: config)
    }()

    // MARK: Route (pure part tested)

    static func speaksDashScope(_ baseURL: String) -> Bool {
        let b = baseURL.lowercased()
        return b.contains("aliyuncs.com") || b.contains("dashscope")
    }

    /// Model Studio's native endpoint takes qwen-image and wan-image; nothing else.
    static func drawsNatively(_ modelId: String) -> Bool {
        let id = modelId.lowercased()
        return id.hasPrefix("qwen-image") || (id.hasPrefix("wan") && id.contains("-image"))
    }

    /// The host part of a DashScope base URL, with `/compatible-mode` and `/api/v1` removed.
    static func dashScopeHost(_ baseURL: String) -> String {
        var host = baseURL
        if let r = host.range(of: "/compatible-mode") { host = String(host[..<r.lowerBound]) }
        if let r = host.range(of: "/api/v1") { host = String(host[..<r.lowerBound]) }
        while host.hasSuffix("/") { host.removeLast() }
        return host
    }

    /// Bailian instances with a key on this phone, the nanoMuse Cloud instance excluded.
    @MainActor
    static func bailianInstances() -> [ProviderInstance] {
        let cloudId = NanoMuseCloud.instance?.id
        return ProviderConfigStore.shared.instances.filter { inst in
            inst.isEnabled
                && inst.id != cloudId
                && (inst.providerType == .openAI || inst.providerType == .openAIResponses)
                && speaksDashScope(inst.customBaseURL ?? "")
                && !(ProviderKeychainHelper.loadAPIKey(instanceId: inst.id) ?? "").isEmpty
        }
    }

    /// Where the next picture is drawn.
    @MainActor
    static func route() -> Route {
        let candidates = bailianInstances()
        guard !candidates.isEmpty else { return .relay }
        let savedId = UserDefaults.standard.string(forKey: defaultsInstanceKey)
        let inst = candidates.first { $0.id == savedId } ?? candidates[0]
        guard let key = ProviderKeychainHelper.loadAPIKey(instanceId: inst.id), !key.isEmpty else { return .relay }
        let saved = UserDefaults.standard.string(forKey: defaultsModelKey)?.trimmingCharacters(in: .whitespaces)
        let model = (savedId == inst.id && saved?.isEmpty == false) ? saved! : suggestedModel(for: inst)
        return .ownKey(OwnKey(instanceId: inst.id, label: inst.label, baseURL: inst.customBaseURL ?? "", apiKey: key, model: model))
    }

    @MainActor
    static var usesOwnKey: Bool {
        if case .ownKey = route() { return true }
        return false
    }

    /// Image models the instance lists that the native endpoint draws with.
    @MainActor
    static func availableModels(for inst: ProviderInstance) -> [String] {
        var ids = ProviderConfigStore.shared.entries(for: inst.id)
            .map(\.model.id)
            .filter { drawsNatively($0) }
        if !ids.contains(recommendedBailianModel) { ids.append(recommendedBailianModel) }
        return Array(NSOrderedSet(array: ids)) as? [String] ?? ids
    }

    @MainActor
    static func suggestedModel(for inst: ProviderInstance) -> String {
        let listed = ProviderConfigStore.shared.entries(for: inst.id).map(\.model.id)
        if listed.isEmpty || listed.contains(recommendedBailianModel) { return recommendedBailianModel }
        return listed.first { drawsNatively($0) } ?? recommendedBailianModel
    }

    @MainActor
    static func save(instanceId: String, model: String) {
        UserDefaults.standard.set(instanceId, forKey: defaultsInstanceKey)
        UserDefaults.standard.set(model.trimmingCharacters(in: .whitespaces), forKey: defaultsModelKey)
    }

    /// "Drawn by nanoMuse Cloud" / "Drawn by Bailian · qwen-image-3.0".
    @MainActor
    static func providerLine() -> String {
        switch route() {
        case .relay: return String(format: AppLocalized("Drawn by %@"), NanoMuseCloud.label)
        case .ownKey(let k): return String(format: AppLocalized("Drawn by %@ · %@"), k.label, k.model)
        }
    }

    // MARK: Drawing

    @MainActor
    static func generate(prompt: String) async throws -> UIImage {
        switch route() {
        case .relay:
            let model = try await NanoMuseRelayMedia.imageModel()
            return try await NanoMuseRelayMedia.generate(prompt: prompt, model: model)
        case .ownKey(let k):
            var parameters: [String: Any] = ["size": "1024*1024", "watermark": false]
            if k.model.hasPrefix("qwen-image") { parameters["prompt_extend"] = false }
            return try await callDashScope(k, model: k.model, content: [["text": prompt]], parameters: parameters, what: "generation")
        }
    }

    @MainActor
    static func edit(_ image: UIImage, prompt: String) async throws -> UIImage {
        switch route() {
        case .relay:
            let model = try await NanoMuseRelayMedia.imageModel()
            return try await NanoMuseRelayMedia.edit(image, prompt: prompt, model: model)
        case .ownKey(let k):
            // qwen-image-3.x, wan-image and qwen-image-edit-* take a picture themselves; an
            // older text-only qwen-image is posed by qwen-image-edit-max on the same key.
            let threeX = k.model.hasPrefix("qwen-image-3") || k.model.hasPrefix("wan")
            let model = (threeX || k.model.contains("edit")) ? k.model : "qwen-image-edit-max"
            let parameters: [String: Any] = threeX
                ? ["size": "1024*1024", "prompt_extend": false, "watermark": false]
                : ["n": 1, "watermark": false]
            guard let png = NanoMuseFaceStore.square(image, side: 768).pngData() else {
                throw Failure(message: "The picture could not be encoded")
            }
            let content: [[String: Any]] = [
                ["image": "data:image/png;base64," + png.base64EncodedString()],
                ["text": prompt],
            ]
            return try await callDashScope(k, model: model, content: content, parameters: parameters, what: "edit")
        }
    }

    /// One call to `multimodal-generation/generation`; the first image of the reply.
    private static func callDashScope(_ k: OwnKey, model: String, content: [[String: Any]], parameters: [String: Any], what: String) async throws -> UIImage {
        let host = dashScopeHost(k.baseURL)
        guard let url = URL(string: host + "/api/v1/services/aigc/multimodal-generation/generation") else {
            throw Failure(message: "Bad provider address")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(k.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "model": model,
            "input": ["messages": [["role": "user", "content": content]]],
            "parameters": parameters,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(status) else {
            let msg = (json?["message"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            throw Failure(message: "HTTP \(status)" + (msg.map { ": \($0)" } ?? ""))
        }
        guard let json else { throw Failure(message: "Unreadable \(what) response") }
        let choice = ((json["output"] as? [String: Any])?["choices"] as? [[String: Any]])?.first
        let parts = ((choice?["message"] as? [String: Any])?["content"] as? [[String: Any]]) ?? []
        guard let imageURLString = parts.compactMap({ $0["image"] as? String }).first(where: { !$0.isEmpty }),
              let imageURL = URL(string: imageURLString) else {
            throw Failure(message: (json["message"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Empty \(what) response")
        }
        let (bytes, imageResponse) = try await session.data(from: imageURL)
        let imageStatus = (imageResponse as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(imageStatus) else { throw Failure(message: "Image download failed (\(imageStatus))") }
        guard let image = UIImage(data: bytes) else { throw Failure(message: "Undecodable image") }
        return image
    }
}
