import XCTest
@testable import Minis

/// The words a person reads in the nanoMuse layer follow the project's voice: no dashes
/// (`—`, `–`, `——`) in any of the nine languages, no exclamation marks, and the relay is
/// "nanoMuse Cloud" in every language. Our keys are the ones the Swift files under
/// `NanoMuse/` reference; upstream OpenMinis keys are not ours to rewrite.
///
/// Reads the sources next to this file (Mac only, as all of MinisTests): the catalogue is
/// `../Localizable.xcstrings`, our code is `../NanoMuse/*.swift`.
final class NanoMuseCopyTests: XCTestCase {

    private struct Catalogue {
        /// key -> language -> value
        var values: [String: [String: String]] = [:]
        /// the keys the NanoMuse/ sources reference
        var ours: Set<String> = []
    }

    private static func load() throws -> Catalogue {
        let here = URL(fileURLWithPath: #filePath)
        let root = here.deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("Localizable.xcstrings"))
        guard let top = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = top["strings"] as? [String: Any] else {
            throw XCTSkip("Localizable.xcstrings is not where the test expects it")
        }
        var cat = Catalogue()
        for (key, entry) in strings {
            var byLang: [String: String] = [:]
            let locs = (entry as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            for (lang, loc) in locs {
                if let unit = (loc as? [String: Any])?["stringUnit"] as? [String: Any],
                   let value = unit["value"] as? String {
                    byLang[lang] = value
                }
            }
            cat.values[key] = byLang
        }
        let dir = root.appendingPathComponent("NanoMuse")
        let files = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".swift") }
        var blob = ""
        for name in files {
            blob += (try? String(contentsOf: dir.appendingPathComponent(name), encoding: .utf8)) ?? ""
            blob += "\n"
        }
        for key in strings.keys where blob.contains(Self.swiftLiteral(key)) {
            cat.ours.insert(key)
        }
        return cat
    }

    /// The key as it appears in Swift source, quotes included: `"` and `\` escaped, newlines as `\n`.
    private static func swiftLiteral(_ key: String) -> String {
        "\"" + key.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n") + "\""
    }

    func testOurKeysAreFound() throws {
        let cat = try Self.load()
        XCTAssertGreaterThan(cat.ours.count, 500, "the NanoMuse/ sources reference hundreds of keys")
        XCTAssertTrue(cat.ours.contains("Before we start, what should I call you?"))
    }

    func testNoDashesInOurCopy() throws {
        let cat = try Self.load()
        var offenders: [String] = []
        for key in cat.ours {
            for (lang, value) in cat.values[key] ?? [:] where value.contains("—") || value.contains("–") {
                offenders.append("[\(lang)] \(value.prefix(80))")
            }
            if key.contains("—") || key.contains("–") { offenders.append("[key] \(key.prefix(80))") }
        }
        XCTAssertTrue(offenders.isEmpty, "dashes in copy a person reads:\n" + offenders.sorted().joined(separator: "\n"))
    }

    func testNoExclamationMarksInOurCopy() throws {
        let cat = try Self.load()
        var offenders: [String] = []
        for key in cat.ours {
            for (lang, value) in cat.values[key] ?? [:] where value.contains("!") || value.contains("！") {
                offenders.append("[\(lang)] \(value.prefix(80))")
            }
        }
        XCTAssertTrue(offenders.isEmpty, "exclamation marks:\n" + offenders.sorted().joined(separator: "\n"))
    }

    func testTheRelayIsNanoMuseCloudInEveryLanguage() throws {
        let cat = try Self.load()
        var offenders: [String] = []
        for key in cat.ours {
            for (lang, value) in cat.values[key] ?? [:] {
                for translated in ["nanoMuse 云", "nanoMuse 雲", "nanoMuse クラウド", "nanoMuse 클라우드"] where value.contains(translated) {
                    offenders.append("[\(lang)] \(value.prefix(80))")
                }
            }
        }
        XCTAssertTrue(offenders.isEmpty, "the relay's name is translated:\n" + offenders.sorted().joined(separator: "\n"))
    }
}
