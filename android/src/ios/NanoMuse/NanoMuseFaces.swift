//
//  NanoMuseFaces.swift
//  nanoMuse
//
//  The agent's face: the five moods, the dragon that every account starts
//  with, and the look the user drew in the avatar studio (kept on disk and
//  shared through the account's profile). Mirrors Android's AgentAvatar /
//  AvatarStore.
//

import SwiftUI
import UIKit
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

enum NanoMuseMood: String, CaseIterable, Codable {
    case idle, working, waiting, happy, error
}

/// Which face the header wears: the bundled dragon, or the pictures the
/// user drew. Pictures live under Application Support/nanomuse/avatar as
/// PNG, one per mood, plus a small meta.json (description, style, when).
@MainActor
final class NanoMuseFaceStore: ObservableObject {
    static let shared = NanoMuseFaceStore()

    struct Meta: Codable, Equatable {
        var description: String = ""
        var style: String = ""
        var createdAt: Double = 0
        var faceId: String = ""
    }

    @Published private(set) var custom: [NanoMuseMood: UIImage] = [:]
    @Published private(set) var meta = Meta()

    var hasCustomFace: Bool { custom[.idle] != nil }

    private static var dragonCache: [NanoMuseMood: UIImage] = [:]

    private init() {
        load()
    }

    // MARK: Paths

    static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("nanomuse/avatar", isDirectory: true)
    }

    private static func file(_ mood: NanoMuseMood) -> URL {
        directory.appendingPathComponent("\(mood.rawValue).png")
    }

    private static var metaFile: URL { directory.appendingPathComponent("meta.json") }

    // MARK: Reading

    /// The picture for a mood: the drawn one, the drawn idle still when that
    /// mood was never drawn, else the dragon. Nil only when the bundle lacks
    /// the dragon files as well.
    func image(for mood: NanoMuseMood) -> UIImage? {
        if let own = custom[mood] { return own }
        if let idle = custom[.idle] { return idle }
        return Self.dragon(mood)
    }

    static func dragon(_ mood: NanoMuseMood) -> UIImage? {
        if let cached = dragonCache[mood] { return cached }
        let name = "dragon-\(mood.rawValue)"
        var image: UIImage?
        if let url = Bundle.main.url(forResource: name, withExtension: "webp"),
           let data = try? Data(contentsOf: url) {
            image = UIImage(data: data)
        }
        if image == nil, let named = UIImage(named: name) {
            image = named
        }
        if let image { dragonCache[mood] = image }
        return image
    }

    private func load() {
        var found: [NanoMuseMood: UIImage] = [:]
        for mood in NanoMuseMood.allCases {
            let url = Self.file(mood)
            if let data = try? Data(contentsOf: url), let img = UIImage(data: data) {
                found[mood] = img
            }
        }
        custom = found
        if let data = try? Data(contentsOf: Self.metaFile),
           let m = try? JSONDecoder().decode(Meta.self, from: data) {
            meta = m
        }
    }

    // MARK: Writing

    /// A new face: `stills` must contain at least the idle picture. Replaces
    /// whatever was worn before.
    func adopt(_ stills: [NanoMuseMood: UIImage], description: String, style: String) {
        guard let idle = stills[.idle] else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: Self.directory, withIntermediateDirectories: true)
        for mood in NanoMuseMood.allCases {
            try? fm.removeItem(at: Self.file(mood))
        }
        var kept: [NanoMuseMood: UIImage] = [:]
        for (mood, image) in stills {
            let squared = Self.square(image, side: 512)
            if let png = squared.pngData() {
                try? png.write(to: Self.file(mood), options: .atomic)
                kept[mood] = squared
            }
        }
        custom = kept
        let idleBytes = Self.encodeStill(Self.square(idle, side: 512)) ?? Data()
        meta = Meta(description: description, style: style,
                    createdAt: Date().timeIntervalSince1970,
                    faceId: Self.faceId(of: idleBytes))
        saveMeta()
        NanoMuseProfileSync.shared.faceChanged()
    }

    /// One more pose for a face that is already worn.
    func put(_ mood: NanoMuseMood, image: UIImage) {
        let squared = Self.square(image, side: 512)
        try? FileManager.default.createDirectory(at: Self.directory, withIntermediateDirectories: true)
        if let png = squared.pngData() {
            try? png.write(to: Self.file(mood), options: .atomic)
        }
        custom[mood] = squared
    }

    /// Back to the dragon.
    func reset(sync: Bool = true) {
        try? FileManager.default.removeItem(at: Self.directory)
        custom = [:]
        meta = Meta()
        if sync { NanoMuseProfileSync.shared.faceChanged() }
    }

    /// Wear a face that another device drew (pulled from the profile).
    func wear(remote stills: [NanoMuseMood: UIImage], faceId: String, description: String, style: String) {
        guard stills[.idle] != nil else { return }
        let fm = FileManager.default
        try? fm.removeItem(at: Self.directory)
        try? fm.createDirectory(at: Self.directory, withIntermediateDirectories: true)
        var kept: [NanoMuseMood: UIImage] = [:]
        for (mood, image) in stills {
            if let png = image.pngData() {
                try? png.write(to: Self.file(mood), options: .atomic)
                kept[mood] = image
            }
        }
        custom = kept
        meta = Meta(description: description, style: style,
                    createdAt: Date().timeIntervalSince1970, faceId: faceId)
        saveMeta()
    }

    private func saveMeta() {
        if let data = try? JSONEncoder().encode(meta) {
            try? data.write(to: Self.metaFile, options: .atomic)
        }
    }

    // MARK: Encoding helpers

    /// The still as the relay wants it: WebP when Image I/O can write it,
    /// else a PNG shrunk until it fits the relay's 200 KB per-still limit.
    static func encodeStill(_ image: UIImage) -> Data? {
        if let webp = encodeWebP(image, quality: 0.86), webp.count <= 190 * 1024 { return webp }
        var side: CGFloat = 512
        while side >= 128 {
            let small = square(image, side: side)
            if let png = small.pngData(), png.count <= 190 * 1024 { return png }
            side /= 2
        }
        return nil
    }

    static func encodeWebP(_ image: UIImage, quality: CGFloat) -> Data? {
        guard let cg = image.cgImage else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.webP.identifier as CFString, 1, nil) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(dest, cg, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return data as Data
    }

    static func faceId(of idleBytes: Data) -> String {
        guard !idleBytes.isEmpty else { return "" }
        let digest = Insecure.SHA1.hash(data: idleBytes)
        return digest.map { String(format: "%02x", $0) }.joined().prefix(12).description
    }

    /// Centre-crop to a square and scale to `side` points at 1x.
    static func square(_ image: UIImage, side: CGFloat) -> UIImage {
        let w = image.size.width, h = image.size.height
        guard w > 0, h > 0 else { return image }
        let s = min(w, h)
        let crop = CGRect(x: (w - s) / 2, y: (h - s) / 2, width: s, height: s)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        return renderer.image { _ in
            let scale = side / s
            let origin = CGPoint(x: -crop.minX * scale, y: -crop.minY * scale)
            image.draw(in: CGRect(origin: origin, size: CGSize(width: w * scale, height: h * scale)))
        }
    }
}

/// The face at a given size and mood, with the small life the Android
/// header gives it: a slow breath when idle, a quicker bob while working, a
/// tilt while waiting, a pop when happy and a shake on error.
struct NanoMuseFaceView: View {
    var mood: NanoMuseMood
    var size: CGFloat
    var showsRing: Bool = true

    @ObservedObject private var faces = NanoMuseFaceStore.shared
    @State private var breath = false
    @State private var popped = false
    @State private var shake: CGFloat = 0

    var body: some View {
        ZStack {
            if showsRing {
                Circle().fill(NanoMuseTones.disc)
            }
            if let img = faces.image(for: mood) {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
                    .transition(.opacity)
                    .id(mood.rawValue + (faces.hasCustomFace ? "c" : "d"))
            } else {
                Image(systemName: "face.smiling")
                    .resizable()
                    .scaledToFit()
                    .padding(size * 0.18)
                    .foregroundStyle(NanoMuseTones.action)
            }
        }
        .frame(width: size, height: size)
        .scaleEffect(scale)
        .rotationEffect(.degrees(tilt))
        .offset(x: shake, y: bob)
        .animation(.easeInOut(duration: 0.35), value: mood)
        .onAppear { startBreathing() }
        .onChange(of: mood) { newMood in
            if newMood == .happy {
                popped = true
                withAnimation(.spring(response: 0.35, dampingFraction: 0.45)) { popped = false }
            } else if newMood == .error {
                withAnimation(.interpolatingSpring(stiffness: 600, damping: 6)) { shake = 4 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    withAnimation(.interpolatingSpring(stiffness: 600, damping: 10)) { shake = 0 }
                }
            }
        }
        .accessibilityLabel(Text(AppLocalized("Agent face")))
    }

    private var scale: CGFloat {
        if popped { return 1.12 }
        switch mood {
        case .working: return breath ? 1.045 : 0.985
        case .idle, .waiting, .happy, .error: return breath ? 1.02 : 1.0
        }
    }

    private var bob: CGFloat {
        mood == .working ? (breath ? -1.5 : 1.5) : 0
    }

    private var tilt: Double {
        mood == .waiting ? (breath ? 6 : -6) : 0
    }

    private func startBreathing() {
        withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
            breath = true
        }
    }
}

/// Android's MuseTones: a quiet grey palette for the shell.
enum NanoMuseTones {
    static let surface = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.118, alpha: 1) : .white })
    static let fill = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.165, green: 0.165, blue: 0.18, alpha: 1) : UIColor(red: 0.945, green: 0.945, blue: 0.957, alpha: 1) })
    static let bubble = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.149, green: 0.149, blue: 0.165, alpha: 1) : UIColor(red: 0.914, green: 0.918, blue: 0.925, alpha: 1) })
    static let disc = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.165, green: 0.165, blue: 0.18, alpha: 1) : UIColor(red: 0.945, green: 0.937, blue: 0.922, alpha: 1) })
    static let hairline = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.227, green: 0.227, blue: 0.235, alpha: 1) : UIColor(red: 0.898, green: 0.898, blue: 0.918, alpha: 1) })
    static let canvas = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? .black : UIColor(red: 0.953, green: 0.953, blue: 0.961, alpha: 1) })
    static let action = Color(red: 0.039, green: 0.4, blue: 0.894)
}

/// Whether the UI runs in Chinese right now (the in-app override wins).
enum NanoMuseLocale {
    static var isChinese: Bool {
        let lang = AppBundle.current.preferredLocalizations.first
            ?? Locale.preferredLanguages.first ?? "en"
        return lang.lowercased().hasPrefix("zh")
    }
}
