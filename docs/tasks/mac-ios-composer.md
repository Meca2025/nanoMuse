# Mac 侧协作任务 — iOS：聊天输入框显示不出来（0.1.39 → 0.1.40）

这份文档是给在维护者（lgy0404）的 Mac 上运行的 Cursor 代理（下文叫 **M**）看的。整个粘贴给它
就有了全部上下文。维护者在 Linux 上开发，Linux 上的代理（**L**）负责其余一切并统一发布；你负责
**只能在 Mac + 真机上做的事**：这次是一件——把 iOS 聊天界面底部的输入框修到真机上看得见、用得了。

> 代理须知：不要问「要不要继续」，直接做。能自己查到的信息自己查。不可逆操作（删用户数据、
> 改系统设置、推到 main、发布）不要做；修复提交到自己的分支并开 PR。维护者不在聊天里给密码；
> 两步验证、Apple ID 登录 Xcode 这类事由维护者亲自做——需要时一句话说清楚，然后继续做不依赖它的事。

上一份任务单 [mac-work-0.1.39.md](mac-work-0.1.39.md) 的 **第 0 节（项目与分工、仓库约定）、
第 1 节（环境）、第 5 节（协作协议）、第 6 节（速查）依然有效**，先看一遍，这里不重复。

## 0. 现状

- `main` = `05ce5b99`，**v0.1.39「Keys」已于 2026-10-06 发布**；你上一轮的三个 PR（#95 Mac 助手、
  #96 iOS 闪退、#97 iOS 账号隔离）都已合并进去。TestFlight **build 10 = 0.1.39** 已上传、处理完
  （内部测试员组可装）。版本号这一轮**仍然不碰**，修复进 0.1.40，由 L 发布。
- 你的本地 clone 大概率还停在旧的 main：先 `git fetch origin && git checkout main && git pull --ff-only`。
  Mac 磁盘上次只剩 ≈5 GB（`~/Library/Caches` 26 GB），构建前先腾地方。
- 维护者用 build 10 在 **iPhone** 上测了（机型、iOS 版本未说；他的 iPad 是 iPad 第 8 代、
  iPadOS 26.7.1），结论一句话：**「输入的消息框还是显示不出来」**。没有截图、没有日志。
  闪退（#96）没有再提，可以认为已经不崩了。「还是」接的是前两轮「输入框会掉」，所以按**底部
  输入框（胶囊）不显示**处理；但第一步复现时顺手确认另一种读法——能不能打字、发出去的消息
  有没有出现在对话里——一并记进报告。

## 1. 这个问题的来历（为什么说「还是」）

同一个症状已经三轮了，每一轮都是在没有真机复现的情况下改的：

| 版本 | 维护者的话 | 当时的判断与改动 |
|---|---|---|
| 0.1.36 | 「输入框的样子」要像 Muse | 做了 Muse 的胶囊输入框 `NanoMuse/NanoMuseComposer.swift`（`NanoMuseComposerPill`），字段仍是上游的 `PastableTextView`（UIViewRepresentable） |
| 0.1.37 | 「iOS 默认的键盘现在经常丢掉，用户直接看不到键盘了」 | 认为是上游已知的「composer host 不再布局、零子视图」（`AIChatView.swift` ~1395–1455 行上游自己的 `[InputBarHealth]` 注释写了他们在真机上看到 `FloatingBarHostingView nkids=0`）。加了 `NanoMuseComposerWatch.swift`：探针 `NanoMuseComposerProbe` 报告是否在窗口里、高度多少，不对就 `rebuildTick` 重建 |
| 0.1.38 | 「ios 手机端的输入框还是会掉」，补充说是**走完第一次对话的起名卡片之后**掉的 | 认为 UIKit host 是祸根：字段换成 SwiftUI 自己的 `TextField(axis: .vertical)`（`NanoMuseComposerField.swift`），并加了 **fail-safe**：聊天出现 / 消息发出 / 一轮结束后一秒，若探针没附着、host 高度 0 或输入条从没报过高度，就把同一个栈改挂到 `.safeAreaInset(edge: .bottom)`（`NanoMuseComposerWatch.failSafe`）。**build 9 在聊天界面一出现就崩（#96），所以这版的输入框从未在真机上被看见过。** |
| 0.1.39 | （本任务）「输入的消息框还是显示不出来」 | #96 把 overlay 和 fail-safe 两个链接合成一个 `NanoMuseComposerHost`（`NanoMuseChatModifiers.swift`），栈装进 `AnyView`。行为上和 0.1.38 等价。 |

所以现在**没有任何一个版本的输入框在真机上被确认过正常**，0.1.38/0.1.39 的两个假设（UIKit host、
链太深）都可能是对的也可能跟这个症状无关。**这一轮的第一目标是拿到真机证据，第二目标才是修。**
不要再在没看到视图层级的情况下改布局。

## 2. 代码在哪

- 聊天界面 `Views/Chat/AIChatView.swift`（上游文件，6500 行，我们的改动都带 `// nanoMuse:`）：
  - `body`（~498 行）：`ZStack { messagesArea … .modifier(NanoMuseComposerHost(failSafe:stack:)) …; kernelBootOverlay }`。
  - `nmComposerStack` / `nmComposerTree`（~3499 行）：`ZStack(alignment: .bottom) { VStack { NanoMuseChatCardsHost; floatingToolPreview; inputBar }.background(NanoMuseComposerProbe).id(rebuildTick); inputPopupOverlay }`。
  - `inputBar`（~3778 行）：`nmPill` 为真时走 `nmPillRows` → `NanoMuseComposerPill { nmPillField }`；外面 `ComposerSurface(pill:)` 是灰色胶囊；`.onGeometryChange` 给 `inputBarHeight`（消息列表的底部内边距）和 `nmComposer.geometry(height:)`。
  - `nmListInset` / `nmListFloating`（~3491 行）：fail-safe 路径上为 0。
  - `onAppear`（~1198 行）`nmComposer.visible = true; expect("the chat appeared")`；`onDisappear`（~1319 行）。
- 我们的文件 `NanoMuse/`：`NanoMuseComposer.swift`（胶囊）、`NanoMuseComposerField.swift`（字段）、
  `NanoMuseComposerWatch.swift`（看门狗 + fail-safe + 探针）、`NanoMuseChatModifiers.swift`
  （`NanoMuseComposerHost`、`NanoMuseChatHooks`）、`NanoMuseChatCards.swift`（起名卡片等虚拟卡片，
  在输入条上方同一个栈里）、`NanoMuseFirstRun.swift`（`NanoMuseFirstConversation`：第一次对话的
  三段开场白和起名流程）。
- 壳 `NanoMuse/NanoMuseShell.swift`：`NanoMuseRoot`（首次运行 vs 主界面）、`NanoMuseHomeView`
  （`ZStack { chatLayer … }.safeAreaInset(edge: .bottom) { NanoMuseBottomBar }`，键盘弹出时
  `NanoMuseKeyboardWatcher` 把底栏藏起来）、`chatLayer`（`NavigationStack` 里的 `AIChatView`，
  顶部 `safeAreaInset` 放 Muse 头部，`.toolbar(.hidden, for: .navigationBar)`）。
- 设置里能关掉 Muse 壳（`NanoMuseShellPrefs.shell`，UserDefaults `nanomuse.shell.enabled`）回到
  上游 OpenMinis 布局——**这是最便宜的对照实验**（见 3.4）。
- 文档：[docs/ios.md](../ios.md) *The composer (0.1.38)* 一段写的是 0.1.38 的假设，修完要改成
  真相；`NanoMuseRound6Tests.swift` 守着 `AIChatView.body` 的类型深度和大小上限——**不要再往
  `AIChatView.body` 上加链接**，新行为进 `NanoMuseChatHooks` / `NanoMuseComposerHost` 或第三个
  modifier。

## 3. 先拿证据（预计 1 小时）

### 3.1 复现

`android/src/ios/Minis.xcodeproj`，scheme `Minis`，**Debug** 构建装到维护者的 iPhone（问他要机型和
iOS 版本；拿不到 iPhone 就用 iPad，两台都测最好）。脚本：**删 app → 装 → 走完引导（登录由维护者
输验证码）→ 进主聊天**。每一步截图，记下**输入框第一次看不见是在哪一步**：

1. 引导结束、主聊天刚出现（应有三段开场白 + 底部胶囊）；
2. 输入自己的名字并发送（如果能输入的话）；
3. 模型回问名字 → 起名卡片出现在输入条上方；
4. 选一个名字 → 卡片消失；
5. 再发一条消息；
6. 切后台再回来；打开抽屉里的旁聊再返回主聊天；切到 Feed 再切回 Chat；横竖屏（iPad）。

### 3.2 看视图层级（关键一步）

输入框看不见的那一刻，Xcode → Debug → **View Debugging → Capture View Hierarchy**，找到胶囊
（`NanoMuseComposerPill` 的 HStack / `TextField` / 加号和话筒的 `UIButton`）。四种情况只会是其一，
对应的修法完全不同，所以这一步不能省：

| 看到的 | 意味着 | 修的方向 |
|---|---|---|
| **a.** 胶囊在层级里、尺寸正常，但 frame 在窗口之外或被底栏/键盘遮住 | 安全区 / inset 几何问题（壳的 `safeAreaInset` 底栏、`AIChatView` 的 `.ignoresSafeArea(.keyboard, …)`、iOS 26 的键盘安全区变化） | 改壳或 host 的几何，不动看门狗 |
| **b.** 胶囊在层级里但高度 0 / 宽度 0 | `TextField(axis: .vertical)` 在这个 iOS 上在 `HStack(alignment: .bottom)` 里给了零尺寸，或 `lineLimit(1...6)` + `.frame(minHeight:)` 的组合不对 | 字段给固定最小高度 / 换 `TextEditor` / 回上游的 representable 只做显示 |
| **c.** 装胶囊的 hosting view 在，但**没有子视图**（上游 2026-08 看到的那种） | SwiftUI 把这段子树渲染成空：`NanoMuseComposerHost` 两条 `if` 都没渲染，或 overlay 的平台宿主没重建 | 看 fail-safe 为什么没救：`failSafe` 是否已经为真而 `safeAreaInset` 路径也空；考虑把 `safeAreaInset` 做成唯一路径 |
| **d.** 胶囊压根不在层级里 | `inputBar` 没被构建：`isReadOnly`、`nmPill` 分支、`vm` 状态、`.id(rebuildTick)` 正在重建中 | 顺着 `nmComposerTree` 的条件查 |

顺手记下：胶囊 hosting view 的 `alpha`、`isHidden`、`clipsToBounds`，它上面有没有一层全屏透明视图
（`NanoMuseDrawer` 的 overlay、`kernelBootOverlay`、`SessionLockGateOverlay`）。

### 3.3 日志

手机连 Mac，Console.app 选这台设备，过滤 `subsystem:io.github.nanomuse.app`，或者终端：

```bash
# 需要 libimobiledevice：brew install libimobiledevice
idevicesyslog | grep -E "nm\.composer|InputBarLayout|InputBarHealth|composer (fail-safe|self-heal|check)"
```

要看的几行：`composer fail-safe: no composer one second after …`（fail-safe 触发了没、`attached=`
`hostH=` `frameH=` 三个数）、`composer self-heal: rebuilding`、`inputBarHeight seeded=`（输入条报过
高度没）、`[InputBarHealth] STALLED`。**如果一行 fail-safe 都没有而输入框又不在**，说明看门狗认为
一切正常——那就是上面的 a 或 d；**如果 fail-safe 触发了而输入框仍不在**，就是 c。

Debug 构建还带着上游的调试服务（`Debug/DebugServer.swift`，端口 8321，仅 DEBUG）：
`iproxy 8321 8321` 后 `curl http://127.0.0.1:8321/skill` 是协议说明和示例客户端，`/pair`
（`"plain": true`，只接受 127.0.0.1）拿 token，`/rpc` 的 `debug.search {"keyword": "TextField"}`、
`debug.viewTree`、`debug.inspect {"address": …}` 能在不断点的情况下导出活的视图树——上游当年
就是这么抓到 `nkids=0` 的。Xcode 的 View Debugger 够用就不必折腾它。

### 3.4 两个对照实验

- **关掉 Muse 壳**：设置 → 外观（`NanoMuseAppearance.swift`）→ **Muse home** 开关
  （UserDefaults `nanomuse.shell.enabled`）→ 回到上游 OpenMinis 布局再进同一个会话。上游的输入条看得见 → 问题在我们的胶囊/字段（b）或壳的几何（a）；也看不见 → 问题在
  host/看门狗那层（c/d），和胶囊无关。
- **换个会话**：抽屉 → 新聊天（旁聊，是 `NavigationStack` push 出来的、带系统导航栏的那种）。
  旁聊里有输入框而主聊天没有 → 看 `NanoMuseHomeView.chatLayer` 那条路径（顶部 `safeAreaInset`
  头部、`.toolbar(.hidden)`、底栏 `safeAreaInset`）；都没有 → `AIChatView` 自己的事。

## 4. 修

证据到手再动手。几条硬约束：

- 新代码放 `NanoMuse/*.swift`；上游文件里每处改动一行 `// nanoMuse:`，一处一改；不加链接到
  `AIChatView.body`（`NanoMuseRound6Tests` 会挡）。
- 以**用户看得见**为准，不以探针为准：如果结论是 a 或 b，`NanoMuseComposerWatch` 的 fail-safe
  根本不会触发，别指望它；该删的死代码可以删（0.1.37/0.1.38 的看门狗如果被证明打偏了，连文档
  一起改成真相，不要留一段写错的历史在 `docs/ios.md` 里）。
- 如果结论是 c，把 `safeAreaInset` 做成唯一 host 是可选项：消息列表不再从胶囊下面穿过
  （Android 的 ChatScreen 也不穿），`inputBarHeight` 那套内边距可以保留但 `nmListInset` 恒为 0。
  先在真机上确认这条路径本身能显示再决定。
- 新字符串先英文、再简体中文、再 `Localizable.xcstrings` 已有的全部 locale；语气平实，无感叹号。
- iOS 16 目标：`.nmOnChange(of:)`，不用双参数 `onChange`。`NanoMuse/` 下零 warning。
- 文档随代码：`docs/ios.md` 的 composer 一段改成真实根因；`CHANGELOG.md` `## [Unreleased]` 下
  `### iOS` 加一条（过去时、具体、面向用户）。`scripts/rebrand.py` 跑完输出 `clean`。

## 5. 验收

在 iPhone（和 iPad）上，**Debug 和 Release 两种配置**各走一遍 3.1 的脚本，输入框在每一步都在、
能点出键盘、能发出去；切后台/回前台、旁聊来回、Feed 来回、键盘弹出收起、起名卡片出现消失，
输入框都不丢；三遍。能加回归测试就加到 `MinisTests/`（照 `NanoMuseRound6Tests.swift` 的样子，
真机跑）。

```bash
cd android/src/ios
xcodebuild build -project Minis.xcodeproj -scheme Minis -configuration Debug \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO     # NanoMuse/ 下零 warning
gh workflow run "iOS · build check" --repo nano-muse/nanoMuse --ref mac/ios-composer-0140
```

## 6. 交回

分支 `mac/ios-composer-0140`，PR 到 `main`，**不自己合并**。PR 描述 = 报告：机型/iOS/Xcode 版本；
3.1 每一步看到了什么（截图可以贴 PR）；3.2 的四选一和证据（层级截图、frame 数值）；3.3 的关键日志
行（打码）；3.4 两个对照的结果；根因一段话（哪一行、为什么、为什么前两轮没修到）；修复的提交号；
验收表（通过 / 失败 / 没法测 + 一句证据）；还剩什么、建议下一步。进展和卡点写 PR 评论
（`gh pr comment N --body …`），L 用 `gh pr view N --comments` 看。需要维护者亲自做的事单列。

L 这边同时在做：拿到你的 PR 后合并、发 0.1.40、TestFlight build 11、把公测提审补上。
