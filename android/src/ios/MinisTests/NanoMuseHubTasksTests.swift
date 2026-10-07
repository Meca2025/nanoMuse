import XCTest
@testable import Minis

/// The bookkeeping behind `stop {call | conversation}` on the iPhone (docs/hub.md): the run a
/// `stop` ends is the one the task frame opened, or the sender's run in the named conversation,
/// and never another device's. The Android twin is HubTasksTest.
@MainActor
final class NanoMuseHubTasksTests: XCTestCase {

    override func setUp() {
        super.setUp()
        NanoMuseHubTasks.running = [:]
    }

    override func tearDown() {
        NanoMuseHubTasks.running = [:]
        super.tearDown()
    }

    func testConversationKeyIsTheNamedOneOrOnePerDevice() {
        XCTAssertEqual(NanoMuseHubTasks.conversationKey(senderId: "mac", conversation: nil), "from-mac")
        XCTAssertEqual(NanoMuseHubTasks.conversationKey(senderId: "mac", conversation: "  "), "from-mac")
        XCTAssertEqual(NanoMuseHubTasks.conversationKey(senderId: "", conversation: nil), "from-unknown")
        XCTAssertEqual(NanoMuseHubTasks.conversationKey(senderId: "mac", conversation: "t-1"), "t-1")
    }

    func testStopByCallFindsTheRunTheFrameOpened() {
        NanoMuseHubTasks.running["c1"] = .init(senderId: "mac", conversation: "from-mac")
        XCTAssertEqual(NanoMuseHubTasks.find(senderId: "mac", callId: "c1", conversation: nil), "c1")
        XCTAssertNil(NanoMuseHubTasks.find(senderId: "mac", callId: "c9", conversation: "elsewhere"))
    }

    func testStopByConversationDefaultsToTheSendersOwn() {
        NanoMuseHubTasks.running["c1"] = .init(senderId: "mac", conversation: "from-mac")
        NanoMuseHubTasks.running["c2"] = .init(senderId: "mac", conversation: "t-1")
        XCTAssertEqual(NanoMuseHubTasks.find(senderId: "mac", callId: nil, conversation: nil), "c1")
        XCTAssertEqual(NanoMuseHubTasks.find(senderId: "mac", callId: "", conversation: "t-1"), "c2")
        XCTAssertNil(NanoMuseHubTasks.find(senderId: "mac", callId: nil, conversation: "t-2"))
    }

    func testAnotherDeviceCannotStopIt() {
        NanoMuseHubTasks.running["c1"] = .init(senderId: "mac", conversation: "t-1")
        XCTAssertNil(NanoMuseHubTasks.find(senderId: "pc", callId: "c1", conversation: nil))
        XCTAssertNil(NanoMuseHubTasks.find(senderId: "pc", callId: nil, conversation: "t-1"))
        XCTAssertFalse(NanoMuseHubTasks.stop(args: ["call": "c1"], from: ["id": "pc"]))
        XCTAssertEqual(NanoMuseHubTasks.running["c1"]?.stopped, false)
    }

    func testStopMarksTheRunSoTheTaskAnswersCancelled() {
        NanoMuseHubTasks.running["c1"] = .init(senderId: "mac", conversation: "from-mac")
        XCTAssertTrue(NanoMuseHubTasks.stop(args: [:], from: ["id": "mac"]))
        XCTAssertEqual(NanoMuseHubTasks.running["c1"]?.stopped, true)
        XCTAssertFalse(NanoMuseHubTasks.stop(args: ["conversation": "none"], from: ["id": "mac"]))
    }
}
