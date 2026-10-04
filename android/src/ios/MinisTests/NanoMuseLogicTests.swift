import XCTest
@testable import Minis

/// The pure parts of the nanoMuse iPhone layer, pinned so they cannot drift from Android:
/// the fences the model writes, the words that change the avatar, the goal and feed blocks,
/// the scheduler's arithmetic, the region rule, the model menu and the first-run gating.
/// Android: AvatarFlowTest, GoalFlowTest, FencesTest, FirstRunSetupTest, SharedConnectorsTest.
@MainActor
final class NanoMuseLogicTests: XCTestCase {

    // MARK: - Fences

    func testFencesFindTheLastBlockAndStripIt() {
        let text = """
        Here you go.
        ```nanomuse-goal
        {"title": "Run twice a week", "check_every_hours": 72}
        ```
        And an update later:
        ```nanomuse-goal
        {"title": "Run three times a week"}
        ```
        Done.
        """
        XCTAssertTrue(NanoMuseFences.contains(text))
        XCTAssertTrue(NanoMuseFences.contains(text, kind: "goal"))
        XCTAssertFalse(NanoMuseFences.contains(text, kind: "feed"))
        XCTAssertEqual(NanoMuseFences.blocks("goal", in: text).count, 2)
        XCTAssertEqual(NanoMuseFences.lastObject("goal", in: text)?["title"] as? String, "Run three times a week")
        let stripped = NanoMuseFences.strip(text)
        XCTAssertFalse(stripped.contains("nanomuse-goal"))
        XCTAssertTrue(stripped.contains("Here you go."))
        XCTAssertTrue(stripped.contains("Done."))
    }

    func testFencesSplitIntoPieces() {
        let text = "Before\n```nanomuse-feed\n{\"title\":\"A\",\"body\":\"B\"}\n```\nAfter"
        let pieces = NanoMuseFences.pieces(text)
        XCTAssertEqual(pieces.count, 3)
        XCTAssertEqual(pieces.first, .prose("Before"))
        if case .block(let kind, let json) = pieces[1] {
            XCTAssertEqual(kind, "feed")
            XCTAssertTrue(json.contains("\"title\""))
        } else {
            XCTFail("second piece should be the block")
        }
        XCTAssertEqual(pieces.last, .prose("After"))
    }

    func testFenceRoundTrip() {
        let fence = NanoMuseFences.fence("goal-update", ["goal_id": "g1", "progress": 40])
        XCTAssertTrue(fence.hasPrefix("```nanomuse-goal-update\n"))
        XCTAssertEqual(NanoMuseFences.lastObject("goal-update", in: fence)?["goal_id"] as? String, "g1")
    }

    // MARK: - Day

    func testParseClock() {
        XCTAssertEqual(NanoMuseDay.parseClock("09:30")?.hour, 9)
        XCTAssertEqual(NanoMuseDay.parseClock("09:30")?.minute, 30)
        XCTAssertEqual(NanoMuseDay.parseClock("7:05")?.hour, 7)
        XCTAssertNil(NanoMuseDay.parseClock("25:00"))
        XCTAssertNil(NanoMuseDay.parseClock("noon"))
        XCTAssertNil(NanoMuseDay.parseClock(nil))
    }

    // MARK: - Avatar words

    func testAvatarRequestsEnglish() {
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("Change your avatar to a red panda"), "red panda")
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("please switch your look into a small robot."), "small robot")
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("new avatar: cyberpunk fox"), "cyberpunk fox")
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("become a dragon"), "dragon")
        // "become better" is not a face.
        XCTAssertNil(NanoMuseAvatarIntent.parseRequest("become better at math"))
        XCTAssertNil(NanoMuseAvatarIntent.parseRequest("be quiet"))
        XCTAssertNil(NanoMuseAvatarIntent.parseRequest("What is the weather like?"))
    }

    func testAvatarRequestsChinese() {
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("把你的形象换成一只橘猫"), "一只橘猫")
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("换个头像：赛博朋克狐狸"), "赛博朋克狐狸")
        XCTAssertEqual(NanoMuseAvatarIntent.parseRequest("变成一条小龙吧"), "一条小龙")
        XCTAssertNil(NanoMuseAvatarIntent.parseRequest("今天天气怎么样"))
    }

    func testAvatarChoices() {
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("2"), .index(1))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("the third one"), .index(2))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("I'll take the first"), .index(0))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("第二个"), .index(1))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("就第四个吧"), .index(3))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("右下"), .index(3))
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("regenerate"), .regenerate)
        XCTAssertEqual(NanoMuseAvatarIntent.parseChoice("都不喜欢"), .regenerate)
        XCTAssertNil(NanoMuseAvatarIntent.parseChoice("tell me more about option two"))
    }

    // MARK: - Goals

    func testGoalFromBlock() throws {
        let block: [String: Any] = [
            "title": " Learn 20 Spanish words a week ",
            "why": "trip in June",
            "category": "interests",
            "check_every_hours": 48,
            "check_time": "at 18:30",
            "steps": ["Pick a list", "", "Review on Sunday"],
            "first_check": "How did the first list go?",
        ]
        let parsed = try XCTUnwrap(NanoMuseGoal.from(block: block))
        XCTAssertEqual(parsed.goal.title, "Learn 20 Spanish words a week")
        XCTAssertEqual(parsed.goal.category, .interests)
        XCTAssertEqual(parsed.goal.checkEveryHours, 48)
        XCTAssertEqual(parsed.goal.checkHour, 18)
        XCTAssertEqual(parsed.goal.checkMinute, 30)
        XCTAssertEqual(parsed.goal.steps.map(\.text), ["Pick a list", "Review on Sunday"])
        XCTAssertEqual(parsed.firstCheck, "How did the first list go?")
        XCTAssertNil(NanoMuseGoal.from(block: ["title": "  "]))
    }

    func testGoalUpdateBlock() {
        let update = NanoMuseGoal.Update(block: ["goal_id": "g1", "progress": 140, "status": "attention", "note": "slipping"])
        XCTAssertEqual(update?.goalId, "g1")
        XCTAssertEqual(update?.progress, 100)
        XCTAssertEqual(update?.status, .active)
        XCTAssertEqual(update?.note, "slipping")
        XCTAssertEqual(NanoMuseGoal.Update(block: ["status": "done"])?.status, .done)
        XCTAssertNil(NanoMuseGoal.Update(block: ["note": "   "]))
    }

    func testGoalCategoryFallsBackToOther() {
        XCTAssertEqual(NanoMuseGoalCategory.from("HEALTH"), .health)
        XCTAssertEqual(NanoMuseGoalCategory.from("whatever"), .other)
        XCTAssertEqual(NanoMuseGoalCategory.from(nil), .other)
    }

    // MARK: - Feed

    func testFeedDraftFromBlock() {
        let draft = NanoMusePost.Draft(block: ["title": "Rain later", "body": "Take the umbrella.", "type": "REMINDER", "emoji": "☔️", "source": "weather; calendar"])
        XCTAssertEqual(draft?.type, "reminder")
        XCTAssertEqual(draft?.source, ["weather", "calendar"])
        XCTAssertEqual(NanoMusePost.Draft(block: ["title": "x", "body": "y", "type": "nonsense"])?.type, "note")
        XCTAssertNil(NanoMusePost.Draft(block: ["title": "x"]))
    }

    func testFrontMatterSplit() {
        let (meta, body) = NanoMusePost.splitFrontMatter("---\ntitle: Hello\ntype: brief\n---\nThe body\nmore")
        XCTAssertEqual(meta["title"], "Hello")
        XCTAssertEqual(meta["type"], "brief")
        XCTAssertEqual(body, "The body\nmore")
        let (none, plain) = NanoMusePost.splitFrontMatter("just text")
        XCTAssertTrue(none.isEmpty)
        XCTAssertEqual(plain, "just text")
    }

    // MARK: - Scheduler arithmetic

    private func date(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int, _ cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!
    }

    func testDailyRoutineNextDue() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var routine = NanoMuseRoutine(label: "Brief", prompt: "x", hour: 8, minute: 0)
        routine.createdAt = date(2026, 10, 1, 7, 0, cal)
        // created before 08:00 → due the same day
        XCTAssertEqual(routine.nextDue(after: date(2026, 10, 1, 7, 30, cal), calendar: cal), date(2026, 10, 1, 8, 0, cal))
        // already fired this slot → tomorrow
        routine.lastFiredAt = date(2026, 10, 1, 8, 1, cal)
        XCTAssertEqual(routine.nextDue(after: date(2026, 10, 1, 9, 0, cal), calendar: cal), date(2026, 10, 2, 8, 0, cal))
    }

    func testRoutineCreatedAfterSlotWaitsForTomorrow() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var routine = NanoMuseRoutine(label: "Brief", prompt: "x", hour: 8, minute: 0)
        routine.createdAt = date(2026, 10, 1, 9, 0, cal)
        XCTAssertEqual(routine.nextDue(after: date(2026, 10, 1, 9, 5, cal), calendar: cal), date(2026, 10, 2, 8, 0, cal))
    }

    func testWeekdaysRoutineSkipsTheWeekend() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var routine = NanoMuseRoutine(label: "Standup", prompt: "x", hour: 9, minute: 0, repeatMode: .weekdays)
        routine.createdAt = date(2026, 10, 1, 0, 0, cal)
        // 2026-10-03 is a Saturday
        XCTAssertEqual(routine.nextDue(after: date(2026, 10, 3, 10, 0, cal), calendar: cal), date(2026, 10, 5, 9, 0, cal))
    }

    func testIntervalRoutineCountsFromTheLastRun() {
        let cal = Calendar(identifier: .gregorian)
        var routine = NanoMuseRoutine(label: "Check-in", prompt: "x", hour: 9, minute: 0)
        routine.intervalHours = 6
        let fired = Date(timeIntervalSince1970: 1_800_000_000)
        routine.lastFiredAt = fired
        XCTAssertEqual(routine.nextDue(after: fired.addingTimeInterval(60), calendar: cal), fired.addingTimeInterval(6 * 3600))
    }

    // MARK: - Region (contract C5)

    func testMainlandRule() {
        XCTAssertTrue(NanoMuseRegion.isMainland(languageCode: "zh", scriptCode: "Hans", regionCode: nil, signedInWithPhone: false, relayRegion: nil))
        XCTAssertTrue(NanoMuseRegion.isMainland(languageCode: "zh", scriptCode: nil, regionCode: "CN", signedInWithPhone: false, relayRegion: nil))
        XCTAssertTrue(NanoMuseRegion.isMainland(languageCode: "zh", scriptCode: nil, regionCode: nil, signedInWithPhone: false, relayRegion: nil))
        XCTAssertFalse(NanoMuseRegion.isMainland(languageCode: "zh", scriptCode: "Hant", regionCode: "TW", signedInWithPhone: false, relayRegion: nil))
        XCTAssertFalse(NanoMuseRegion.isMainland(languageCode: "en", scriptCode: nil, regionCode: "US", signedInWithPhone: false, relayRegion: nil))
        XCTAssertTrue(NanoMuseRegion.isMainland(languageCode: "en", scriptCode: nil, regionCode: "US", signedInWithPhone: true, relayRegion: nil))
        XCTAssertTrue(NanoMuseRegion.isMainland(languageCode: "en", scriptCode: nil, regionCode: "US", signedInWithPhone: false, relayRegion: "CN"))
    }

    // MARK: - Models (contract C4)

    func testRecommendedChatPrefersTheMarkedModelThenTheDefault() {
        let marked: [[String: Any]] = [
            ["id": "qwen3.8-flash", "for": ["chat"]],
            ["id": "qwen3.8-27b", "for": ["chat", "gui"], "nanomuse": ["recommended": true]],
        ]
        XCTAssertEqual(NanoMuseModelMenu.recommendedChat(marked)?["id"] as? String, "qwen3.8-27b")
        let plain: [[String: Any]] = [
            ["id": "qwen3.8-27b", "for": ["gui"]],
            ["id": "deepseek-v4.1-flash", "for": ["chat"]],
        ]
        XCTAssertEqual(NanoMuseModelMenu.recommendedChat(plain)?["id"] as? String, NanoMuseModelMenu.defaultChatModel)
        let drawsOnly: [[String: Any]] = [["id": "qwen3.8-27b", "for": ["gui"]]]
        XCTAssertNil(NanoMuseModelMenu.recommendedChat(drawsOnly))
        XCTAssertEqual(NanoMuseModelMenu.guiModel(plain), "qwen3.8-27b")
        // the relay 0.17 shape: the lanes live under `nanomuse`, next to its other flags
        let relay: [[String: Any]] = [
            ["id": "qwen3.8-27b", "nanomuse": ["for": ["gui", "chat"], "recommended": true, "recommended_for": ["gui"]]],
            ["id": "deepseek-v4.1-flash", "nanomuse": ["for": ["chat"], "recommended": true, "recommended_for": ["chat"]]],
            ["id": "qwen3.8-flash", "nanomuse": ["for": ["chat"], "recommended": false]],
        ]
        XCTAssertEqual(NanoMuseModelMenu.recommendedChat(relay)?["id"] as? String, "deepseek-v4.1-flash")
        XCTAssertEqual(NanoMuseModelMenu.guiModel(relay), "qwen3.8-27b")
        XCTAssertEqual(NanoMuseModelMenu.lanes(relay[0]), ["gui", "chat"])
    }

    func testDeepSeekVisionRule() {
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-v4.1-flash"), true)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek/deepseek-v4.1-flash"), true)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-v4-pro"), false)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-chat"), false)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-r1"), false)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-ocr"), true)
        XCTAssertEqual(NanoMuseVision.deepSeekSees("deepseek-vl2"), false)
        XCTAssertNil(NanoMuseVision.deepSeekSees("qwen3.8-27b"))
        XCTAssertEqual(NanoMuseVision.guess(id: "deepseek-chat"), .textOnly)
        XCTAssertEqual(NanoMuseVision.guess(id: "deepseek-v4.1-flash"), .vision)
        XCTAssertEqual(NanoMuseVision.guess(id: "qwen3.8-27b"), .vision)
        XCTAssertNil(NanoMuseVision.guess(id: "some-unknown-model"))
    }

    func testOwnKeyPresets() {
        XCTAssertEqual(NanoMuseOwnKeyPreset.bailian.chatModel, "deepseek-v4.1-flash")
        XCTAssertEqual(NanoMuseOwnKeyPreset.bailian.guiModel, "qwen3.8-27b")
        XCTAssertEqual(NanoMuseOwnKeyPreset.openrouter.chatModel, "deepseek/deepseek-v4.1-flash")
        XCTAssertEqual(NanoMuseOwnKeyPreset.openrouter.guiModel, "qwen/qwen3.8-27b")
    }

    // MARK: - First run

    func testFirstRunNeeded() {
        XCTAssertTrue(NanoMuseFirstRun.needed(signedIn: false, hasProviders: true, hasSessions: true, done: true))
        XCTAssertTrue(NanoMuseFirstRun.needed(signedIn: true, hasProviders: false, hasSessions: true, done: true))
        XCTAssertTrue(NanoMuseFirstRun.needed(signedIn: true, hasProviders: true, hasSessions: false, done: false))
        XCTAssertFalse(NanoMuseFirstRun.needed(signedIn: true, hasProviders: true, hasSessions: false, done: true))
        XCTAssertFalse(NanoMuseFirstRun.needed(signedIn: true, hasProviders: true, hasSessions: true, done: false))
    }

    func testFirstRunStages() {
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: false, hasGroups: false, sourceChosen: false, modelsSkipped: false, fresh: false, passwordAnswered: false), .welcome)
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: true, hasGroups: false, sourceChosen: false, modelsSkipped: false, fresh: true, passwordAnswered: false), .password)
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: true, hasGroups: false, sourceChosen: false, modelsSkipped: false, fresh: true, passwordAnswered: true), .source)
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: true, hasGroups: false, sourceChosen: true, modelsSkipped: false, fresh: false, passwordAnswered: false), .models)
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: true, hasGroups: true, sourceChosen: true, modelsSkipped: false, fresh: false, passwordAnswered: false), .meet)
        XCTAssertEqual(NanoMuseFirstRun.stage(signedIn: true, hasGroups: false, sourceChosen: true, modelsSkipped: true, fresh: false, passwordAnswered: false), .meet)
        XCTAssertEqual(NanoMuseFirstRun.dot(.meet), 1)
        XCTAssertEqual(NanoMuseFirstRun.dot(.source), 0)
    }

    // MARK: - First conversation (naming)

    func testNamingBlockParsing() {
        let text = "What should I call you?\n```nanomuse-naming\n{\"user_address\": \"“Li”\", \"suggest\": [\"Pip\", \"Pip\", \"'Wren'\", \"Sol\", \"Fig\"]}\n```"
        let block = NanoMuseFirstConversation.parseBlock(text)
        XCTAssertEqual(block?.userAddress, "Li")
        XCTAssertTrue(block?.addressGiven ?? false)
        XCTAssertEqual(block?.suggestions, ["Pip", "Wren", "Sol"])
        XCTAssertNil(block?.agentName)
        XCTAssertNil(NanoMuseFirstConversation.parseBlock("no block here"))
        XCTAssertNil(NanoMuseFirstConversation.parseBlock(nil))
    }

    func testCleanName() {
        XCTAssertEqual(NanoMuseFirstConversation.cleanName("「小满」。"), "小满")
        XCTAssertEqual(NanoMuseFirstConversation.cleanName("  Juno!  "), "Juno")
        XCTAssertNil(NanoMuseFirstConversation.cleanName("a name that is far too long to use"))
        XCTAssertNil(NanoMuseFirstConversation.cleanName("two\nlines"))
        XCTAssertNil(NanoMuseFirstConversation.cleanName(""))
        XCTAssertNil(NanoMuseFirstConversation.cleanName(nil))
    }

    func testWithAddressWritesAndReplacesTheLine() {
        let fresh = NanoMuseFirstConversation.withAddress("Li", in: "")
        XCTAssertEqual(fresh, "## About the user\n- Call them: Li\n")
        let appended = NanoMuseFirstConversation.withAddress("Li", in: "# GLOBAL\nSome notes.\n\n")
        XCTAssertTrue(appended.hasSuffix("## About the user\n- Call them: Li\n"))
        XCTAssertTrue(appended.hasPrefix("# GLOBAL\nSome notes."))
        let replaced = NanoMuseFirstConversation.withAddress("Wei", in: appended)
        XCTAssertTrue(replaced.contains("- Call them: Wei"))
        XCTAssertFalse(replaced.contains("- Call them: Li"))
        XCTAssertEqual(replaced.components(separatedBy: "- Call them:").count, 2)
    }

    func testPoolPickIsStableAndDistinct() {
        let a = NanoMuseFirstConversation.poolPick(seed: "session-1", chinese: false)
        let b = NanoMuseFirstConversation.poolPick(seed: "session-1", chinese: false)
        XCTAssertEqual(a, b)
        XCTAssertEqual(a.count, 2)
        XCTAssertNotEqual(a[0], a[1])
        let zh = NanoMuseFirstConversation.poolPick(seed: "x", chinese: true)
        XCTAssertTrue(NanoMuseFirstConversation.namePoolZH.contains(zh[0]))
    }

    func testRealSessionKeys() {
        XCTAssertTrue(NanoMuseFirstConversation.isRealSession("3F2504E0-4F89-11D3-9A0C-0305E82C3301"))
        XCTAssertFalse(NanoMuseFirstConversation.isRealSession("__new__3F2504E0-4F89-11D3-9A0C-0305E82C3301"))
        XCTAssertFalse(NanoMuseFirstConversation.isRealSession("draft"))
    }

    // MARK: - Coding bridge

    func testCodingRunFoldsEvents() {
        var run = NanoMuseCodingBridge.LiveRun(text: "fix the test")
        run = NanoMuseCodingBridge.step(run, event: ["kind": "started", "run": "r1", "session_id": "s1"])
        XCTAssertEqual(run.id, "r1")
        XCTAssertEqual(run.sessionId, "s1")
        run = NanoMuseCodingBridge.step(run, event: ["kind": "text", "text": "Looking", "partial": true])
        run = NanoMuseCodingBridge.step(run, event: ["kind": "text", "text": " at it", "partial": true])
        XCTAssertEqual(run.current, "Looking at it")
        run = NanoMuseCodingBridge.step(run, event: ["kind": "text", "text": "Looking at it."])
        XCTAssertEqual(run.output, "Looking at it.")
        XCTAssertEqual(run.current, "")
        run = NanoMuseCodingBridge.step(run, event: ["kind": "tool", "text": "read_file"])
        XCTAssertEqual(run.tools, 1)
        XCTAssertEqual(run.lastTool, "read_file")
        let done = NanoMuseCodingBridge.finish(run, reply: ["id": "r1", "status": "done", "output": "", "tools": 3])
        XCTAssertEqual(done.output, "Looking at it.")
        XCTAssertEqual(done.status, "done")
        XCTAssertEqual(done.tools, 3)
        let withOutput = NanoMuseCodingBridge.finish(run, reply: ["output": "Final answer", "error": "boom"])
        XCTAssertEqual(withOutput.output, "Final answer")
        XCTAssertEqual(withOutput.error, "boom")
    }

    // MARK: - Shared connectors (contract C3)

    func testSharedConnectorEntriesCarryNoSecrets() {
        let now = Date().timeIntervalSince1970
        let servers = [
            MCPServerConfig(id: "github", note: nil, enabled: true, createdAt: now, updatedAt: now,
                            url: "https://api.githubcopilot.com/mcp/", headers: ["Authorization": "Bearer SECRET"], oauth: nil,
                            command: nil, args: nil, env: nil, startupTimeoutSeconds: nil),
            MCPServerConfig(id: "maps", note: "Maps", enabled: false, createdAt: now - 10, updatedAt: now,
                            url: "https://example.invalid/mcp?key=SECRET", headers: nil, oauth: nil,
                            command: nil, args: nil, env: nil, startupTimeoutSeconds: nil),
            MCPServerConfig(id: "local", note: nil, enabled: true, createdAt: now - 20, updatedAt: now,
                            url: nil, headers: nil, oauth: nil,
                            command: "npx", args: ["thing"], env: nil, startupTimeoutSeconds: nil),
        ]
        let mine = NanoMuseSharedConnectors.mine(servers: servers, catalogue: [], device: "Li's iPhone", deviceId: "phone-abc")
        XCTAssertEqual(mine.count, 2, "a stdio command is not a service anyone else can sign in to")
        XCTAssertEqual(mine[0]["id"] as? String, "github")
        XCTAssertEqual(mine[0]["auth"] as? String, "key")
        XCTAssertEqual(mine[1]["url"] as? String, "https://example.invalid/mcp")
        XCTAssertEqual(mine[1]["auth"] as? String, "key")
        XCTAssertEqual(mine[1]["label"] as? String, "Maps")
        XCTAssertEqual(mine[1]["enabled"] as? Bool, false)
        for entry in mine {
            let keys = Set(entry.keys)
            XCTAssertEqual(keys, ["id", "label", "url", "auth", "device", "device_id", "enabled", "at"])
            for (_, value) in entry {
                XCTAssertFalse("\(value)".contains("SECRET"))
            }
        }
    }

    func testSharedConnectorParseAndStamp() {
        let raw: [[String: Any]] = [
            ["id": "slack", "label": "", "device": "Mac", "device_id": "mac-1", "enabled": true, "at": "2026-10-01T08:00:00Z"],
            ["id": "  ", "device_id": "mac-1"],
            ["id": "notion", "label": "Notion", "auth": "oauth", "device_id": "mac-2"],
        ]
        let parsed = NanoMuseSharedConnectors.parse(raw)
        XCTAssertEqual(parsed.map(\.id), ["slack", "notion"])
        XCTAssertEqual(parsed[0].label, "slack")
        XCTAssertEqual(parsed[0].auth, "open")
        XCTAssertEqual(parsed[1].auth, "oauth")
        XCTAssertTrue(parsed[1].enabled)
        let again = NanoMuseSharedConnectors.parse(NanoMuseSharedConnectors.serialize(parsed))
        XCTAssertEqual(again, parsed)
        let a = NanoMuseSharedConnectors.stamp([["id": "a", "enabled": true, "at": "1"], ["id": "b", "enabled": true, "at": "2"]])
        let b = NanoMuseSharedConnectors.stamp([["id": "b", "enabled": true, "at": "9"], ["id": "a", "enabled": true, "at": "8"]])
        XCTAssertEqual(a, b, "order and timestamps do not count as a change")
        let c = NanoMuseSharedConnectors.stamp([["id": "a", "enabled": false], ["id": "b", "enabled": true]])
        XCTAssertNotEqual(a, c)
    }
}
