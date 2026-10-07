import XCTest
@testable import Minis

/// The pure parts of Settings › Models (0.1.41 "Choice"): how a slot resolves when the
/// person did and did not choose, how a provider's default is matched, and how the relay's
/// menu is read for each slot. Android: ModelSlotsTest; desktop: cloud.test.ts (slots).
final class NanoMuseModelSlotsTests: XCTestCase {

    private let cloudId = "relay"

    private var cloud: NanoMuseSlotProvider {
        NanoMuseSlotProvider(
            id: cloudId, label: "nanoMuse Cloud", isCloud: true,
            capabilities: ["chat", "vision", "image", "video"],
            defaults: ["chat": "deepseek-v4.1-flash", "image": "qwen-image-3.0", "video": "wan2.2-i2v-flash"],
            models: [.chat: ["deepseek-v4.1-flash", "qwen3.8-27b"], .hands: ["qwen3.8-27b"], .image: ["qwen-image-3.0"], .video: ["wan2.2-i2v-flash"]]
        )
    }

    private var bailian: NanoMuseSlotProvider {
        NanoMuseSlotProvider(
            id: "bailian-1", label: "Alibaba Cloud Bailian", isCloud: false,
            capabilities: ["chat", "vision", "image", "video"],
            defaults: ["chat": "deepseek-v4.1-flash", "image": "qwen-image-3.0", "video": "wan2.2-i2v-flash"],
            models: [.chat: ["qwen-plus", "deepseek-v4.1-flash"], .image: ["qwen-image-3.0", "wan2.6-image"], .video: ["wan2.2-i2v-flash", "wan2.6-i2v"]]
        )
    }

    private var openrouter: NanoMuseSlotProvider {
        NanoMuseSlotProvider(
            id: "openrouter-1", label: "OpenRouter", isCloud: false,
            capabilities: ["chat", "vision", "image"],
            defaults: ["chat": "deepseek-v4.1-flash"],
            models: [.chat: ["anthropic/claude-sonnet-4.5", "deepseek/deepseek-v4.1-flash"]]
        )
    }

    // MARK: - A provider's default

    func testDefaultModelMatchesBareAndPrefixedIds() {
        XCTAssertEqual(bailian.defaultModel(for: .chat), "deepseek-v4.1-flash")
        XCTAssertEqual(openrouter.defaultModel(for: .chat), "deepseek/deepseek-v4.1-flash", "a vendor prefix still matches the catalogue's bare id")
        XCTAssertEqual(bailian.defaultModel(for: .image), "qwen-image-3.0")
        XCTAssertNil(openrouter.defaultModel(for: .image), "the capability is claimed, but iPhone draws only through Model Studio: no models, no slot")
        XCTAssertFalse(openrouter.has(.image))
        XCTAssertFalse(openrouter.has(.video))
    }

    func testDefaultModelFallsBackToTheFirstListed() {
        var p = bailian
        p.defaults["chat"] = "something-the-key-does-not-have"
        XCTAssertEqual(p.defaultModel(for: .chat), "qwen-plus")
    }

    func testCloudWithoutAMenuStillHoldsEverySlot() {
        var bare = cloud
        bare.models = [:]
        bare.defaults = [:]
        for slot in NanoMuseSlot.allCases {
            XCTAssertTrue(bare.has(slot), "\(slot) on Cloud needs only the capability")
            XCTAssertEqual(bare.defaultModel(for: slot), "", "the relay picks the model itself")
        }
    }

    // MARK: - Resolution order (the contract's section 3)

    func testAnExplicitChoiceWinsOverEverything() {
        let chosen = NanoMuseSlotChoice(providerId: "bailian-1", model: "wan2.6-image")
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: chosen, chatProviderId: cloudId, providers: [cloud, bailian])
        XCTAssertEqual(got, chosen)
    }

    func testAChoiceOfCloudIsKeptEvenWithAKeyThatDraws() {
        let chosen = NanoMuseSlotChoice(providerId: cloudId, model: "")
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: chosen, chatProviderId: "bailian-1", providers: [cloud, bailian])
        XCTAssertEqual(got?.providerId, cloudId, "Cloud chosen on purpose is never passed over for a Bailian key")
        XCTAssertEqual(got?.model, "qwen-image-3.0", "an empty model means the provider's default")
    }

    func testAChoiceWhoseProviderIsGoneFallsThrough() {
        let chosen = NanoMuseSlotChoice(providerId: "deleted", model: "x")
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: chosen, chatProviderId: cloudId, providers: [cloud, bailian])
        XCTAssertEqual(got?.providerId, cloudId)
    }

    func testWithoutAChoiceTheChatProvidersOwnDefaultComesFirst() {
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: nil, chatProviderId: "bailian-1", providers: [cloud, bailian])
        XCTAssertEqual(got, NanoMuseSlotChoice(providerId: "bailian-1", model: "qwen-image-3.0"))
        let clips = NanoMuseSlotResolver.resolve(slot: .video, chosen: nil, chatProviderId: "bailian-1", providers: [cloud, bailian])
        XCTAssertEqual(clips, NanoMuseSlotChoice(providerId: "bailian-1", model: "wan2.2-i2v-flash"))
    }

    func testWithoutAChoiceCloudComesBeforeAKeyThatIsNotTheChatProvider() {
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: nil, chatProviderId: cloudId, providers: [cloud, bailian])
        XCTAssertEqual(got?.providerId, cloudId, "Cloud chats, so Cloud draws; the Bailian key waits to be chosen")
        let viaOpenRouter = NanoMuseSlotResolver.resolve(slot: .image, chosen: nil, chatProviderId: "openrouter-1", providers: [cloud, openrouter, bailian])
        XCTAssertEqual(viaOpenRouter?.providerId, cloudId, "the chat provider cannot draw on iPhone, so Cloud is next")
    }

    func testWithoutCloudTheFirstKeyThatCanTakesTheSlot() {
        let got = NanoMuseSlotResolver.resolve(slot: .image, chosen: nil, chatProviderId: "openrouter-1", providers: [openrouter, bailian])
        XCTAssertEqual(got?.providerId, "bailian-1")
        XCTAssertNil(NanoMuseSlotResolver.resolve(slot: .video, chosen: nil, chatProviderId: "openrouter-1", providers: [openrouter]))
    }

    func testChatResolvesToCloudThenTheFirstKey() {
        XCTAssertEqual(NanoMuseSlotResolver.resolve(slot: .chat, chosen: nil, chatProviderId: nil, providers: [bailian, cloud])?.providerId, cloudId)
        XCTAssertEqual(NanoMuseSlotResolver.resolve(slot: .chat, chosen: nil, chatProviderId: nil, providers: [openrouter, bailian]), NanoMuseSlotChoice(providerId: "openrouter-1", model: "deepseek/deepseek-v4.1-flash"))
    }

    // MARK: - The relay's menu

    private let menu: [[String: Any]] = [
        ["id": "deepseek-v4.1-flash", "nanomuse": ["for": ["chat"], "kind": "chat", "recommended": true, "recommended_for": ["chat"]]],
        ["id": "qwen3.8-27b", "nanomuse": ["for": ["chat", "gui"], "kind": "chat", "recommended_for": ["gui"]]],
        ["id": "qwen-image-3.0", "nanomuse": ["kind": "image", "recommended": true]],
        ["id": "wan-image", "nanomuse": ["kind": "image"]],
        ["id": "wan2.2-i2v-flash", "nanomuse": ["kind": "video", "recommended": true]],
        ["id": "wan2.2-t2v-plus", "nanomuse": ["kind": "video"]],
    ]

    func testMenuSortsEachSlotWithTheRecommendedFirst() {
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .chat, in: menu), ["deepseek-v4.1-flash", "qwen3.8-27b"])
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .hands, in: menu), ["qwen3.8-27b"])
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .image, in: menu), ["qwen-image-3.0", "wan-image"])
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .video, in: menu), ["wan2.2-i2v-flash", "wan2.2-t2v-plus"])
        XCTAssertEqual(NanoMuseRelayMenu.recommended(for: .chat, in: menu), "deepseek-v4.1-flash")
        XCTAssertEqual(NanoMuseRelayMenu.recommended(for: .hands, in: menu), "qwen3.8-27b")
        XCTAssertEqual(NanoMuseRelayMenu.recommended(for: .image, in: menu), "qwen-image-3.0")
        XCTAssertEqual(NanoMuseRelayMenu.recommended(for: .video, in: menu), "wan2.2-i2v-flash")
    }

    func testMenuFromAnOlderRelayFallsBackToModalities() {
        let old: [[String: Any]] = [
            ["id": "deepseek-v4.1-flash", "nanomuse": ["for": ["chat"]]],
            ["id": "qwen-image-3.0", "architecture": ["input_modalities": ["text"], "output_modalities": ["image"]]],
            ["id": "wan2.2-i2v-flash", "architecture": ["input_modalities": ["text", "image"], "output_modalities": ["video"]]],
        ]
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .chat, in: old), ["deepseek-v4.1-flash"])
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .image, in: old), ["qwen-image-3.0"])
        XCTAssertEqual(NanoMuseRelayMenu.models(for: .video, in: old), ["wan2.2-i2v-flash"])
    }

    func testMenuRoundTripsThroughDefaults() {
        let key = "nanomuse.cloud.menu"
        let before = UserDefaults.standard.data(forKey: key)
        defer {
            if let before { UserDefaults.standard.set(before, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        NanoMuseRelayMenu.store(menu)
        XCTAssertEqual(NanoMuseRelayMenu.cached.compactMap { $0["id"] as? String }, menu.compactMap { $0["id"] as? String })
        NanoMuseRelayMenu.forget()
        XCTAssertTrue(NanoMuseRelayMenu.cached.isEmpty)
    }

    // MARK: - The slots' words

    func testEverySlotNamesItsCapability() {
        XCTAssertEqual(NanoMuseSlot.chat.capability, "chat")
        XCTAssertEqual(NanoMuseSlot.hands.capability, "vision")
        XCTAssertEqual(NanoMuseSlot.image.capability, "image")
        XCTAssertEqual(NanoMuseSlot.video.capability, "video")
        XCTAssertEqual(NanoMuseSlot.allCases.map(\.defaultsKey), ["chat", "hands", "image", "video"])
    }
}
