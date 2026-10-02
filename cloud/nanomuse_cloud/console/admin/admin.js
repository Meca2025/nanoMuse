/* nanoMuse Cloud — the operator's page. Static, no build step: the admin
   token (X-Admin-Token) is asked for once and kept in sessionStorage, so it
   is gone when the tab closes. Everything comes from /v1/admin/*.

   What it shows is what the relay keeps: counts, tokens, estimated cost,
   sign-ins (device names), devices, and the account timeline. Nobody's
   messages — those were never stored. Identifiers are decrypted one
   account at a time, in the drawer; the tables show the masked hint. */
(() => {
  "use strict";

  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const fmt = (n) => Number(n || 0).toLocaleString();
  const T = zh ? {
    title: "nanoMuse Cloud 后台", tokenLabel: "管理口令", tokenHint: "服务器上 /opt/nanomuse/relay/ADMIN_TOKEN.txt 里的那一行；只留在这个标签页里。",
    enter: "进入", wrong: "口令不对。", offline: "连不上服务器。", refresh: "刷新", lock: "锁定", loading: "加载中…",
    today: "今天", week: "最近 7 天", period: (d) => `最近 ${d} 天`,
    kSamples: "保存的对话", kSamplesSub: (n) => `${n} 个账号开启了「帮助改进」`, exportSamples: "导出 JSONL", exportFailed: (why) => `导出没有成功：${why}。可以再试一次；如果一直这样，看服务器上 docker logs nanomuse-relay。`, exportCut: "下载中途断开", exportEmpty: "还没有可导出的对话。", contributes: "帮助改进", samples: "保存的对话（最近）", samplesNote: "只有开启了「帮助改进 nanoMuse 的 AI 模型」的账号才会保存这些内容：用户写的、模型回答的和它调用的工具，不含系统提示、工具返回的内容和图片；导出的文件不带账号 id。", user: "用户", assistant: "回答", more: "查看更多", noSamples: "还没有",
    kAccounts: "账号", kAccountsSub: (c) => `${c.with_password || 0} 个设了密码 · ${c.unlimited || 0} 个成员 · ${c.disabled || 0} 个已停用`,
    kActive: "活跃账号", kActiveSub: (n) => `${n} 个新注册`, kSpent: "花费", kSpentSub: (r, t) => `${fmt(r)} 次 · ${fmt(t)} tokens`,
    kOnline: "在线设备", kOnlineSub: (k, s) => `记住了 ${k} 台 · ${s} 个有效登录`, kSignals: "今天的信号",
    kSignalsSub: (s) => `${s.sign_ins} 次登录 · ${s.sign_in_failures} 次失败 · ${s.budget_refusals} 次超额 · ${s.upstream_errors} 次上游错误 · ${s.calls} 通电话`,
    byKind: "按类型", byModel: "按模型", byDay: (d) => `每日花费 · 最近 ${d} 天`, top: (d) => `花费最多 · 最近 ${d} 天`, events: "最近动态", accounts: "全部账号", config: "当前配置",
    kinds: { chat: "对话", image: "图片", video: "视频", realtime: "实时通话", grant: "加 tokens", credit: "加额度" },
    thWho: "账号", thJoined: "注册", thSpent: "花费 累计 / 今天", thTokens: "tokens 累计 / 今天", thReqs: "请求", thActive: "最近活跃", thDevices: "设备",
    never: "从未", phone: "手机", email: "邮箱", disabled: "已停用", locked: "已锁定", member: "成员", listed: "白名单", password: "密码", noAccounts: "还没有人登录过。", search: "搜索提示 / ID…",
    reqs: (n) => `${fmt(n)} 次`, tokens: (n) => `${fmt(n)} tokens`, seconds: (n) => `${fmt(n)} 秒`, pictures: (n) => `${fmt(n)} 张`, inOut: (i, o) => `输入 ${fmt(i)} · 输出 ${fmt(o)}`,
    all: "全部", signIns: "登录", refusals: "超额", errors: "错误", calls: "通话", passwords: "密码",
    eventName: {
      "account.created": "注册", "sign_in.code": "验证码登录", "sign_in.password": "密码登录", "sign_in.failed": "登录失败", "password.set": "设置密码", "password.changed": "修改密码",
      "password.cleared": "移除密码", "sign_out": "退出", "sign_out.all": "全部退出", "budget.refused": "超出额度被拒", "upstream.error": "上游出错", "call.ended": "通话结束", "contribute.on": "开启「帮助改进」", "contribute.default": "新账号默认开启「帮助改进」", "contribute.bonus": "早期共创奖励 +¥10", "contribute.off": "关闭「帮助改进」", "contribute.deleted": "删除保存的对话", "invite.accepted": "邀请成功", "invite.used": "通过邀请注册", "invite.unknown": "无效邀请码", "credit.granted": "获得额度奖励",
    },
    // drawer
    spendToday: "今天", spendTotal: "累计", requests: "请求", cap: "总额度", noCap: "无上限", left: "剩余", usageToday: "今天", usagePeriod: (d) => `最近 ${d} 天`, usageTotal: "累计",
    sessions: "登录（含已退出）", revoked: "已退出", via: { code: "验证码", password: "密码" }, lastUsed: "最近使用", devices: "设备", firstSeen: "首次", lastSeen: "最近",
    ledger: "全部请求", timeline: "时间线", none: "—", online: "在线", offline: "离线", version: "版本",
    // 0.10: addresses and clients; every line, page by page; whole conversations
    thClient: "客户端 / IP", addresses: "地址 / IP", addrNote: "登录、每次请求和每条动态记录到的来访地址（经 Caddy 转发时取真实地址）。点一个地址，看从它登录过的所有账号。", addrOnly: "只在这个账号见过", addrShared: (n) => `还有 ${n} 个账号从这个地址来过`,
    atAddress: (ip) => `从 ${ip} 来过的账号`, back: "返回账号", times: (n) => `${fmt(n)} 次`, firstIp: "首次地址", lastIp: "最近地址", lastClient: "最近客户端", lastSeenAt: "最近出现",
    shown: (n, total) => `已显示 ${fmt(n)} / 共 ${fmt(total)} 条`, allShown: (total) => `共 ${fmt(total)} 条，已全部显示`, loadMore: "加载更多",
    samplesAll: "保存的对话", exportThis: "导出这个账号的 JSONL", expand: "展开完整对话", collapse: "收起", roles: { system: "系统", user: "用户", assistant: "回答", tool: "工具返回" }, toolCall: "调用工具", omitted: "（未保存）", lengthNote: (n) => `${fmt(n)} 条消息`,
    byAccount: "按用户", bHint: "账号", bTurns: "对话", bTokens: "tokens 输入 / 输出", bFirst: "最早", bLast: "最近", bModels: "模型", bSwitch: "开关", bOn: "开", bOff: "关", noByAccount: "还没有账号保存过对话。",
    demo: (d) => `在线体验（demo.nanomuse.dev）· 最近 ${d} 天`, demoOff: "还没接上：gateway 设 SHOWCASE_ADMIN_TOKEN，relay 设 WEB_ADMIN_URL（…/api/demo/admin）和 WEB_ADMIN_TOKEN。", demoVisitors: "访客", demoVisits: "体验次数", demoActive: "正在体验", demoNoSignin: "未要求登录", demoCreated: "在这里注册的",
    dvHint: "访客", dvSignins: "登录", dvSessions: "体验", dvFirst: "首次", dvLast: "最近", dvClient: "客户端 / IP", dvNone: "还没有人体验过。", dtWhen: "开始", dtLength: "时长", dtUsed: "用量", dtWhy: "结束原因", dtRunning: "进行中", dtByok: "自带 key", dtAnon: "未登录",
    usedLine: (v) => [`${fmt(v.requests)} 次`, `${fmt(v.tokens)} tokens`, v.pictures ? `${fmt(v.pictures)} 张图` : "", v.clips ? `${fmt(v.clips)} 段视频` : ""].filter(Boolean).join(" · "), dur: (s) => (s < 60 ? `${Math.round(s)} 秒` : s < 3600 ? `${Math.round(s / 60)} 分钟` : `${(s / 3600).toFixed(1)} 小时`),
    demoOfAccount: "在线体验记录", demoAccountLine: (v) => `登录 ${fmt(v.signins)} 次 · 体验 ${fmt(v.sessions)} 次 · 首次 ${when(v.first_seen)} · 最近 ${when(v.last_seen)}${v.created ? " · 账号在体验页注册" : ""}`, demoNoneHere: "这个账号没有在线体验过。",
    recorded: "我们记录了什么", recordedNote: "每个账号：手机号 / 邮箱（加密）、注册与最近出现时间、首次和最近来访地址、最近客户端（平台、版本）；每次登录：设备名、方式、地址、客户端；每次请求：模型、token 数、费用、地址、客户端；每条动态：类型、地址、客户端；每台设备：名称、系统、版本、地址。开启「帮助改进」的账号另有对话内容。全部随账号删除。",
    grant: "加额度", grantPrompt: (who) => `给 ${who} 加多少 tokens？负数扣减。`, credit: "加额度", creditPrompt: (who) => `给 ${who} 加多少元额度？（直接进入总额度，不过期）`, creditNote: "备注（比如 PR #12）", poolLine: (g, l, n, b) => `总额度 ${g}${l === null ? "" : `（剩 ${l}）`} · 邀请了 ${n} 人${b ? " · 领过早期共创奖励" : ""}`, invitedBy: "邀请人", disable: "停用", enable: "恢复", makeMember: "设为成员", unmakeMember: "取消成员",
    memberConfirm: (who) => `把 ${who} 设为成员？成员不受额度限制，费用由你承担。`, listedNote: "在服务器白名单里，改 ALLOWED_IDENTIFIERS 才能取消",
    disableConfirm: (who) => `停用 ${who}？TA 的所有设备会立刻断开，再登录会被拒。`, remove: "删除账号",
    removeConfirm: (who) => `删除 ${who} 的账号、密钥、用量记录和设备？不可恢复。`, hasPassword: "已设密码", noPassword: "未设密码", identifierNote: "明文只在这里解出来看",
    // config
    allowed: "白名单（不限额）", allowedNone: "（空）", sender: "验证码渠道", models: "模型", prices: "单价（¥）", rate: "汇率", rateLine: (r) => `1 美元 = ${r} 元（仅用于显示）`,
    perMinute: (n) => (n > 0 ? `每分钟 ${n} 次` : "不限频"), capLine: (c, u, b) => (c > 0 ? `非成员共 ¥${c}（≈ $${u}）· 邀请双方各 +¥${b}` : "不限花费"), signupOpen: "开放注册", signupClosed: "仅白名单可登录",
    realtime: "实时通话", on: "开", off: "关", pwMin: (n) => `密码至少 ${n} 位`,
    priceLine: (p) => [p.per_m_input || p.per_m_output ? `输入 ${p.per_m_input} / 输出 ${p.per_m_output} 每百万 tokens` : null,
      p.per_image ? `每张 ${p.per_image}${p.per_image_2k ? `（2k ${p.per_image_2k}）` : ""}` : null, p.per_second ? `每秒 ${p.per_second}` : null].filter(Boolean).join("；"),
    foot: "手机号 / 邮箱只在打开某个账号时用管理口令解出来看；数据库里存的是加密后的值。来访地址和客户端信息随每次登录、请求和动态一起记录，删账号时一并删除。对话文字只有在账号开启了「帮助改进 nanoMuse 的 AI 模型」时才保存，并且只存用户写的、模型回答的和它调用的工具（见「数据控制」）。请不要把这个页面截图发出去。金额按模型服务商的北京地区标价估算。",
    // trends and the site
    trends: (d) => `账号趋势 · 最近 ${d} 天`, site: (d) => `官网访问与下载 · 最近 ${d} 天`, siteOff: "还没接上访问统计：服务器上装 nanomuse-traffic（demo/showcase/mirror/traffic.py），relay 设 TRAFFIC_DB 指向它的数据库。",
    siteUpdated: (t) => `更新于 ${t}`, siteNote: "来自 Caddy 的访问日志（保留 7 天）：按天计数，访客用当天的随机盐对地址和浏览器做哈希，不存 IP。",
    sPages: "页面浏览", sVisitors: "访客", sBots: "爬虫 / 监控", sMirror: "镜像下载", sGithub: "GitHub 下载", sStars: "Stars", sPeriod: "本期", sDelta: (n) => (n > 0 ? `+${fmt(n)} 本期` : n < 0 ? `${fmt(n)} 本期` : "本期无变化"),
    sFiles: "下载的文件", sMirrorCol: "镜像", sGithubCol: "GitHub 累计", sRefs: "来源站点", sTop: "页面", sNone: "还没有数据", sSince: (d) => `自 ${d}`,
    mSignIns: "登录", mNew: "新注册", mActive: "活跃账号", mInvites: "通过邀请注册", mContribute: "开启「帮助改进」", mCalls: "通话", mRefused: "超额被拒", mErrors: "上游错误",
    devices: "设备", devKinds: { phone: "手机", computer: "电脑", web: "网页版" }, invitesTitle: "邀请", invitesLine: (f) => `${fmt(f.with_code)} 人生成了邀请码 · ${fmt(f.inviters)} 人邀请成功 · ${fmt(f.invited)} 人经邀请注册`,
    // data controls
    data: (d) => `数据控制 · 最近 ${d} 天`, dOn: "开启「帮助改进」的账号", dOnSub: (on, total) => `共 ${fmt(total)} 个账号 · ${fmt(on)} 开启 · ${fmt(Math.max(0, total - on))} 关闭`, dOff: "主动关闭过的账号", dOffSub: "曾经把开关关掉的人数", dTurns: "保存的对话", dTurnsSub: (all, acc) => `累计 ${fmt(all)} 轮 · 来自 ${fmt(acc)} 个账号`, dTokens: "保存对话的 tokens", dTokensSub: (i, o) => `输入 ${fmt(i)} · 输出 ${fmt(o)}`, dDefault: (on) => on ? "新账号默认开启（IMPROVE_DEFAULT=1）" : "新账号默认关闭（IMPROVE_DEFAULT=0）", dKeeps: () => "保存：用户写的、模型回答的、它选择调用的工具，以及模型、token 数、客户端和语言。不保存：系统提示（记忆、SOUL、指令）、工具返回的内容、图片 / 音频 / 视频、用户的身份。",
    mTurns: "保存的对话", mTurnAccounts: "有对话保存的账号", mOn: "开启", mDefaultOn: "默认开启（新账号）", mOff: "关闭", mDeleted: "删除", dModels: "按模型", dApps: "按客户端", dRecent: "最近保存的对话（点开账号看全部）", dPlatforms: { android: "Android", windows: "Windows 上的 runtime", macos: "macOS 上的 runtime", linux: "Linux 上的 runtime", runtime: "runtime", browser: "浏览器", other: "其他" },
    webTitle: "网页版（nanomuse.cn/web）", webLine: (w) => (w ? `${fmt(w.accounts)} 个账号有自己的 Muse（上限 ${fmt(w.max_accounts)}）· ${fmt(w.running)} 个在运行（上限 ${fmt(w.max_running)}）` : "未接入：relay 设 WEB_INFO_URL 指向 gateway 的 /api/web/info。"), webOff: "网页版未开启",
    // 0.11: where people are, and the models under the key
    places: (d) => `地区 · 最近 ${d} 天`, placesNote: "按来访地址推断（ip2region 离线库，国内到城市、国外到国家 / 州），不请求任何第三方；只是网络出口所在地，用手机流量或代理时会偏。", placesOff: "地理库还没就绪：relay 启动后会自动下载 ip2region_v4.xdb（约 11 MB）到数据目录；CLOUD_GEOIP=0 可关闭。", placesFetching: "正在下载地理库…", placesError: (e) => `地理库下载失败：${e}`,
    pCountry: "国家 / 地区", pProvince: "省 / 州", pAccounts: "账号", pNew: "新注册", pSignins: "登录", pRequests: "请求", pDemo: "体验访客", pUnknown: "未知", pLocal: "本地网络", pNone: "还没有来访记录。", pAccountsNote: "账号按最近一次来访地址计",
    catalog: "模型目录", catalogNote: "key 下能用的模型（菜单之外）：relay 向每个模型各问一句话、再给一张红色小图，确认它能回答、能不能看图；答案保存 7 天。客户端拿到的「能看图」就是这里的结果。", catalogOff: "模型目录未开启（CLOUD_CATALOG=0）。", catalogNames: "按名字推断，未逐个验证（CLOUD_CATALOG_PROBE=0）。", catalogProbing: "正在验证…", catalogPending: (n) => `${fmt(n)} 个待验证`, catalogFetched: (t) => `列表更新于 ${t}`, catalogError: (e) => `读取列表失败：${e}`,
    cModel: "模型", cKind: "类型", cSees: "看图", cVerified: "已验证", cYes: "是", cNo: "否", cUnusable: "服务商拒绝的模型（不出现在客户端）", cNoUnusable: "没有被拒绝的模型。", cCount: (n, v) => `${fmt(n)} 个对话模型 · ${fmt(v)} 个能看图`,
  } : {
    title: "nanoMuse Cloud admin", tokenLabel: "Admin token", tokenHint: "The line in /opt/nanomuse/relay/ADMIN_TOKEN.txt on the server; it stays in this tab only.",
    enter: "Open", wrong: "That token is not right.", offline: "Cannot reach the server.", refresh: "Refresh", lock: "Lock", loading: "Loading…",
    today: "Today", week: "Last 7 days", period: (d) => `Last ${d} days`,
    kSamples: "Kept turns", kSamplesSub: (n) => `${n} accounts with “help improve” on`, exportSamples: "Export JSONL", exportFailed: (why) => `The export did not go through: ${why}. Try once more; if it keeps happening, see docker logs nanomuse-relay on the server.`, exportCut: "the download broke off", exportEmpty: "Nothing to export yet.", contributes: "helps improve", samples: "Kept conversations (recent)", samplesNote: "Kept only for accounts with “Help improve nanoMuse's AI models” on: what the person wrote, what the model answered and the tools it called — not the system prompt, tool results or pictures; the export carries no account ids.", user: "user", assistant: "reply", more: "Show more", noSamples: "None yet",
    kAccounts: "Accounts", kAccountsSub: (c) => `${c.with_password || 0} with a password · ${c.unlimited || 0} members · ${c.disabled || 0} disabled`,
    kActive: "Active accounts", kActiveSub: (n) => `${n} new`, kSpent: "Spent", kSpentSub: (r, t) => `${fmt(r)} requests · ${fmt(t)} tokens`,
    kOnline: "Devices online", kOnlineSub: (k, s) => `${k} remembered · ${s} live sign-ins`, kSignals: "Signals today",
    kSignalsSub: (s) => `${s.sign_ins} sign-ins · ${s.sign_in_failures} failed · ${s.budget_refusals} over budget · ${s.upstream_errors} upstream errors · ${s.calls} calls`,
    byKind: "By kind", byModel: "By model", byDay: (d) => `Spend by day · last ${d} days`, top: (d) => `Top spenders · last ${d} days`, events: "Activity", accounts: "All accounts", config: "Configuration",
    kinds: { chat: "Chat", image: "Pictures", video: "Video", realtime: "Calls", grant: "Tokens granted", credit: "Credit" },
    thWho: "Account", thJoined: "Joined", thSpent: "Spent all / today", thTokens: "Tokens all / today", thReqs: "Requests", thActive: "Last active", thDevices: "Devices",
    never: "never", phone: "phone", email: "e-mail", disabled: "disabled", locked: "locked", member: "member", listed: "listed", password: "password", noAccounts: "Nobody has signed in yet.", search: "Search hint / id…",
    reqs: (n) => `${fmt(n)} req`, tokens: (n) => `${fmt(n)} tokens`, seconds: (n) => `${fmt(n)} s`, pictures: (n) => `${fmt(n)} pictures`, inOut: (i, o) => `${fmt(i)} in · ${fmt(o)} out`,
    all: "All", signIns: "Sign-ins", refusals: "Refusals", errors: "Errors", calls: "Calls", passwords: "Passwords",
    eventName: {
      "account.created": "Joined", "sign_in.code": "Signed in with a code", "sign_in.password": "Signed in with the password", "sign_in.failed": "Failed sign-in", "password.set": "Password set", "password.changed": "Password changed",
      "password.cleared": "Password removed", "sign_out": "Signed out", "sign_out.all": "Signed out everywhere", "budget.refused": "Refused: over budget", "upstream.error": "Upstream error", "call.ended": "Call ended", "contribute.on": "“Help improve” on", "contribute.default": "New account: “help improve” on by default", "contribute.bonus": "Early co-creation bonus +¥10", "contribute.off": "“Help improve” off", "contribute.deleted": "Kept turns deleted", "invite.accepted": "Invited a friend", "invite.used": "Signed up via invite", "invite.unknown": "Unknown invite code", "credit.granted": "Credit granted",
    },
    spendToday: "Today", spendTotal: "All time", requests: "Requests", cap: "Pool", noCap: "no cap", left: "left", usageToday: "Today", usagePeriod: (d) => `Last ${d} days`, usageTotal: "All time",
    sessions: "Sign-ins (incl. revoked)", revoked: "revoked", via: { code: "code", password: "password" }, lastUsed: "last used", devices: "Devices", firstSeen: "first", lastSeen: "last",
    ledger: "All requests", timeline: "Timeline", none: "—", online: "online", offline: "offline", version: "Version",
    thClient: "Client / IP", addresses: "Addresses / IP", addrNote: "The address recorded with sign-ins, every request and every event (the real one behind Caddy). Click one to see every account seen from it.", addrOnly: "only this account", addrShared: (n) => `${n} other accounts came from this address`,
    atAddress: (ip) => `Accounts seen from ${ip}`, back: "Back to the account", times: (n) => `${fmt(n)}×`, firstIp: "First address", lastIp: "Last address", lastClient: "Last client", lastSeenAt: "Last seen",
    shown: (n, total) => `${fmt(n)} of ${fmt(total)} shown`, allShown: (total) => `all ${fmt(total)} shown`, loadMore: "Load more",
    samplesAll: "Kept conversations", exportThis: "Export this account's JSONL", expand: "Show the whole conversation", collapse: "Collapse", roles: { system: "system", user: "user", assistant: "reply", tool: "tool result" }, toolCall: "tool call", omitted: "(not kept)", lengthNote: (n) => `${fmt(n)} messages`,
    byAccount: "By account", bHint: "Account", bTurns: "Turns", bTokens: "Tokens in / out", bFirst: "First", bLast: "Last", bModels: "Models", bSwitch: "Switch", bOn: "on", bOff: "off", noByAccount: "No account has kept turns yet.",
    demo: (d) => `The phone in the browser (demo.nanomuse.dev) · last ${d} days`, demoOff: "Not connected: set SHOWCASE_ADMIN_TOKEN on the gateway and WEB_ADMIN_URL (…/api/demo/admin) with WEB_ADMIN_TOKEN on the relay.", demoVisitors: "Visitors", demoVisits: "Demos", demoActive: "Running now", demoNoSignin: "no sign-in asked", demoCreated: "signed up here",
    dvHint: "Visitor", dvSignins: "Sign-ins", dvSessions: "Demos", dvFirst: "First", dvLast: "Last", dvClient: "Client / IP", dvNone: "Nobody has tried it yet.", dtWhen: "Started", dtLength: "Length", dtUsed: "Used", dtWhy: "Ended because", dtRunning: "running", dtByok: "own key", dtAnon: "not signed in",
    usedLine: (v) => [`${fmt(v.requests)} req`, `${fmt(v.tokens)} tokens`, v.pictures ? `${fmt(v.pictures)} pictures` : "", v.clips ? `${fmt(v.clips)} clips` : ""].filter(Boolean).join(" · "), dur: (s) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`),
    demoOfAccount: "The phone in the browser", demoAccountLine: (v) => `${fmt(v.signins)} sign-ins · ${fmt(v.sessions)} demos · first ${when(v.first_seen)} · last ${when(v.last_seen)}${v.created ? " · the account was created on the demo page" : ""}`, demoNoneHere: "This account has not tried the demo.",
    recorded: "What is recorded", recordedNote: "Per account: phone / e-mail (encrypted), joined and last seen, first and last address, last client (platform, version); per sign-in: device name, way in, address, client; per request: model, tokens, cost, address, client; per event: kind, address, client; per device: name, OS, version, address. Accounts with “help improve” on also have the text of their turns. All of it goes with the account when it is deleted.",
    grant: "Grant", grantPrompt: (who) => `How many tokens for ${who}? Negative takes away.`, credit: "Add credit", creditPrompt: (who) => `How many yuan for ${who}? (straight into the pool; never expires)`, creditNote: "Note (say, PR #12)", poolLine: (g, l, n, b) => `pool ${g}${l === null ? "" : ` (${l} left)`} · ${n} invited${b ? " · took the early co-creation bonus" : ""}`, invitedBy: "invited by", disable: "Disable", enable: "Enable", makeMember: "Make member", unmakeMember: "Unmake member",
    memberConfirm: (who) => `Make ${who} a member? Members have no allowance limit; you pay their bill.`, listedNote: "on the server's list; edit ALLOWED_IDENTIFIERS to remove",
    disableConfirm: (who) => `Disable ${who}? Every device of theirs drops at once and cannot sign in again.`, remove: "Delete account",
    removeConfirm: (who) => `Delete the account, keys, usage and devices of ${who}? This cannot be undone.`, hasPassword: "has a password", noPassword: "no password", identifierNote: "decrypted for this view only",
    allowed: "Members (no cap)", allowedNone: "(none)", sender: "Code sender", models: "Models", prices: "Prices (¥)", rate: "Rate", rateLine: (r) => `1 USD = ${r} CNY (display only)`,
    perMinute: (n) => (n > 0 ? `${n} a minute` : "no rate limit"), capLine: (c, u, b) => (c > 0 ? `¥${c} (≈ $${u}) in all for non-members · +¥${b} an invite, to both sides` : "no spend limit"), signupOpen: "sign-up open", signupClosed: "members only",
    realtime: "Real-time calls", on: "on", off: "off", pwMin: (n) => `passwords ≥ ${n} chars`,
    priceLine: (p) => [p.per_m_input || p.per_m_output ? `${p.per_m_input} in / ${p.per_m_output} out per M tokens` : null,
      p.per_image ? `${p.per_image} a picture${p.per_image_2k ? ` (${p.per_image_2k} at 2k)` : ""}` : null, p.per_second ? `${p.per_second} a second` : null].filter(Boolean).join("; "),
    foot: "A phone number or address is decrypted only when you open that account, with the admin token; the database holds ciphertext. Network addresses and the client are recorded with every sign-in, request and event, and go when the account is deleted. The text of a chat is kept only while the account has “Help improve nanoMuse's AI models” on, and only what the person wrote, what the model answered and the tools it called (see Data controls). Do not share screenshots of this page. Money is estimated at the provider's Beijing list prices.",
    trends: (d) => `Accounts · last ${d} days`, site: (d) => `The site: visits and downloads · last ${d} days`, siteOff: "No traffic figures yet: install nanomuse-traffic on the server (demo/showcase/mirror/traffic.py) and point the relay's TRAFFIC_DB at its database.",
    siteUpdated: (t) => `updated ${t}`, siteNote: "From Caddy's access log (kept seven days): counted by day; a visitor is a hash of address and browser under a salt made for that day. No addresses are stored.",
    sPages: "Page views", sVisitors: "Visitors", sBots: "Crawlers / monitors", sMirror: "Mirror downloads", sGithub: "GitHub downloads", sStars: "Stars", sPeriod: "this period", sDelta: (n) => (n > 0 ? `+${fmt(n)} this period` : n < 0 ? `${fmt(n)} this period` : "no change this period"),
    sFiles: "Files downloaded", sMirrorCol: "mirror", sGithubCol: "GitHub, all time", sRefs: "Referring sites", sTop: "Pages", sNone: "Nothing yet", sSince: (d) => `since ${d}`,
    mSignIns: "Sign-ins", mNew: "New accounts", mActive: "Active accounts", mInvites: "Signed up via invite", mContribute: "“Help improve” turned on", mCalls: "Calls", mRefused: "Refused: over budget", mErrors: "Upstream errors",
    devices: "Devices", devKinds: { phone: "phones", computer: "computers", web: "web" }, invitesTitle: "Invites", invitesLine: (f) => `${fmt(f.with_code)} made an invite code · ${fmt(f.inviters)} brought someone · ${fmt(f.invited)} came through one`,
    // data controls
    data: (d) => `Data controls · last ${d} days`, dOn: "Accounts with “help improve” on", dOnSub: (on, total) => `${fmt(total)} accounts · ${fmt(on)} on · ${fmt(Math.max(0, total - on))} off`, dOff: "Accounts that turned it off", dOffSub: "ever switched it off themselves", dTurns: "Kept turns", dTurnsSub: (all, acc) => `${fmt(all)} in all · from ${fmt(acc)} accounts`, dTokens: "Tokens in kept turns", dTokensSub: (i, o) => `${fmt(i)} in · ${fmt(o)} out`, dDefault: (on) => on ? "New accounts start with it on (IMPROVE_DEFAULT=1)" : "New accounts start with it off (IMPROVE_DEFAULT=0)", dKeeps: (k) => `Kept: ${k.kept.join(", ")}. Not kept: ${k.not_kept.join(", ")}.`,
    mTurns: "Kept turns", mTurnAccounts: "Accounts with turns kept", mOn: "Turned on", mDefaultOn: "On by default (new accounts)", mOff: "Turned off", mDeleted: "Deleted", dModels: "By model", dApps: "By app", dRecent: "Newest kept turns (open the account for all of them)", dPlatforms: { android: "Android", windows: "runtime on Windows", macos: "runtime on macOS", linux: "runtime on Linux", runtime: "runtime", browser: "browser", other: "other" },
    webTitle: "nanoMuse Web (nanomuse.cn/web)", webLine: (w) => (w ? `${fmt(w.accounts)} accounts with a Muse of their own (cap ${fmt(w.max_accounts)}) · ${fmt(w.running)} running (cap ${fmt(w.max_running)})` : "Not connected: set the relay's WEB_INFO_URL to the gateway's /api/web/info."), webOff: "nanoMuse Web is off",
    places: (d) => `Where from · last ${d} days`, placesNote: "Guessed from the address (ip2region's offline database: city level in China, country / state elsewhere); no third party is asked. It is where the network exit is — mobile data and proxies skew it.", placesOff: "The location database is not here yet: the relay fetches ip2region_v4.xdb (about 11 MB) into its data directory after start; CLOUD_GEOIP=0 turns this off.", placesFetching: "Fetching the location database…", placesError: (e) => `The location database could not be fetched: ${e}`,
    pCountry: "Country / region", pProvince: "Province / state", pAccounts: "Accounts", pNew: "New", pSignins: "Sign-ins", pRequests: "Requests", pDemo: "Demo visitors", pUnknown: "unknown", pLocal: "local network", pNone: "No visits recorded yet.", pAccountsNote: "accounts by their latest address",
    catalog: "Model catalog", catalogNote: "The models under the key beyond the menu: the relay asks each one a one-word question and then shows it a small red picture, to learn whether it answers and whether it sees; the answers stand for seven days. The “sees pictures” the apps show is what is here.", catalogOff: "The catalog is off (CLOUD_CATALOG=0).", catalogNames: "Guessed from names, not checked one by one (CLOUD_CATALOG_PROBE=0).", catalogProbing: "Checking…", catalogPending: (n) => `${fmt(n)} to check`, catalogFetched: (t) => `list read ${t}`, catalogError: (e) => `The list could not be read: ${e}`,
    cModel: "Model", cKind: "Kind", cSees: "Sees pictures", cVerified: "Checked", cYes: "yes", cNo: "no", cUnusable: "Models the provider refuses (not offered to the apps)", cNoUnusable: "None refused.", cCount: (n, v) => `${fmt(n)} chat models · ${fmt(v)} see pictures`,
  };

  const moneyN = (v) => { const c = Number(v || 0); return c >= 100 ? c.toFixed(0) : c >= 1 ? c.toFixed(2) : c > 0 && c < 0.01 ? c.toFixed(4) : c.toFixed(2); };
  const money = (cny) => `¥${moneyN(cny)}`;
  const usd = (cny, rate) => (rate > 0 ? `$${moneyN(Number(cny || 0) / rate)}` : "");
  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString(zh ? "zh-CN" : undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : T.never);
  const dateOf = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString(zh ? "zh-CN" : undefined, { year: "numeric", month: "short", day: "numeric" }) : T.never);
  const day = (ts) => new Date(ts * 1000).toLocaleDateString(zh ? "zh-CN" : undefined, { month: "numeric", day: "numeric" });
  const ago = (ts) => {
    if (!ts) return T.never;
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 90) return zh ? "刚刚" : "just now"; if (s < 3600) return zh ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return zh ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 3600)} h ago`; return zh ? `${Math.floor(s / 86400)} 天前` : `${Math.floor(s / 86400)} d ago`;
  };
  const svg = (paths) => `<svg viewBox="0 0 24 24">${paths}</svg>`;
  const ICON = {
    chat: svg('<path d="M4 5.5h16v10H9l-5 4z"/>'),
    image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
    video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
    realtime: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M15 5l3 3M18 4l2 2"/>'),
    in: svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l5 4-5 4M14 12H3"/>'),
    out: svg('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9"/>'),
    warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
    phone: svg('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
    computer: svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 17v3.5"/>'),
    web: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  };
  const EVENT_STYLE = {
    "account.created": ["ok", ICON.person], "sign_in.code": ["", ICON.in], "sign_in.password": ["", ICON.in], "sign_in.failed": ["warn", ICON.warn],
    "password.set": ["violet", ICON.key], "password.changed": ["violet", ICON.key], "password.cleared": ["violet", ICON.key], "sign_out": ["grey", ICON.out], "sign_out.all": ["grey", ICON.out],
    "budget.refused": ["bad", ICON.warn], "upstream.error": ["bad", ICON.warn], "call.ended": ["ok", ICON.realtime],
  };
  const FILTERS = [["", "all"], ["sign_in.code,sign_in.password,sign_in.failed,account.created", "signIns"], ["budget.refused", "refusals"], ["upstream.error", "errors"], ["call.ended", "calls"], ["password.set,password.changed,password.cleared", "passwords"]];

  const SS = window.sessionStorage;
  let token = SS.getItem("nm.admin") || "";
  let ov = null, accounts = null, usage = null, series = null, traffic = null, dataView = null, demoView = null, placesView = null, catalogView = null, err = "", days = Number(SS.getItem("nm.admin.days") || 30), filter = "", filtered = null, q = "";
  let detail = null, detailErr = "";
  // 0.11: every answer that shows addresses carries `places` ({ip: {country, province, city, text…}});
  // they are kept across answers so an address is named wherever it appears
  const PLACES = new Map();
  const mergePlaces = (j) => { if (j && j.places && typeof j.places === "object") for (const [ip, p] of Object.entries(j.places)) PLACES.set(ip, p); return j; };
  const placeOf = (ip) => PLACES.get(ip) || null;
  const placeText = (p) => (!p ? "" : p.local ? T.pLocal : p.text || "");

  const app = document.getElementById("app");
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v; else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, headers: { "X-Admin-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => { throw new Error(T.offline); });
    if (r.status === 401) { token = ""; SS.removeItem("nm.admin"); err = T.wrong; draw(); throw new Error("admin"); }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
    return mergePlaces(j);
  }

  async function load() {
    try {
      [ov, accounts, usage] = await Promise.all([api("GET", `/v1/admin/overview?days=${days}`), api("GET", "/v1/admin/accounts"), api("GET", `/v1/admin/usage?days=${Math.min(days, 90)}`)]);
      // the newer views: a relay from before them, or a hiccup, leaves the panels out
      [series, traffic, dataView, demoView, placesView, catalogView] = await Promise.all([api("GET", `/v1/admin/series?days=${days}`).catch(() => null), api("GET", `/v1/admin/traffic?days=${days}`).catch(() => null), api("GET", `/v1/admin/data?days=${days}`).catch(() => null), api("GET", `/v1/admin/demo?days=${days}`).catch(() => null), api("GET", `/v1/admin/places?days=${days}`).catch(() => null), api("GET", "/v1/admin/catalog").catch(() => null)]);
      err = "";
    } catch (e) {
      if (e.message !== "admin") err = e.message;
    }
    draw();
  }
  async function loadFiltered() {
    if (!filter) { filtered = null; draw(); return; }
    try { filtered = (await api("GET", `/v1/admin/events?limit=80&kind=${encodeURIComponent(filter)}`)).events; } catch (_) { filtered = []; }
    draw();
  }

  // ── gate ───────────────────────────────────────────────────────
  function drawGate() {
    const input = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: "…" });
    const go = async () => { token = input.value.trim(); if (!token) return; SS.setItem("nm.admin", token); err = ""; await load(); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    app.replaceChildren(h("div", { class: "signin admin" },
      h("div", { class: "card rise" },
        h("div", { class: "disc" }, h("img", { src: "../mark.svg", alt: "" })),
        h("h1", {}, T.title),
        h("p", { class: "sub" }, location.host),
        h("div", { class: "field" }, h("label", {}, T.tokenLabel), h("div", { class: "in" }, input)),
        h("button", { class: "btn", onclick: go }, T.enter),
        h("div", { class: "hint" + (err ? " bad" : "") }, err || T.tokenHint),
      )));
    input.focus();
  }

  // ── pieces ─────────────────────────────────────────────────────
  const who = (a) => a.identifier || a.hint || (a.id || "").slice(0, 8);
  const initial = (a) => ((a.hint || a.identifier || "?").replace(/[^0-9a-z]/gi, "").slice(0, 1).toUpperCase() || "?");
  const kindAmount = (r) => {
    const k = r.kind || "chat";
    if (k === "realtime" || k === "video") return T.seconds(r.charged);
    if (k === "image") return T.pictures(r.requests);
    return T.tokens(r.charged);
  };
  function kindRows(rows, rate) {
    if (!rows || !rows.length) return h("div", { class: "empty" }, T.none);
    return rows.map((r) => h("div", { class: "usage-row" },
      h("div", { class: "k" }, h("i", { class: r.kind || "chat" }), T.kinds[r.kind] || r.kind),
      h("span", { class: "n" }, `${T.reqs(r.requests)} · ${kindAmount(r)}${r.kind === "chat" && (r.prompt_tokens || r.completion_tokens) ? ` · ${T.inOut(r.prompt_tokens, r.completion_tokens)}` : ""}`),
      h("span", { class: "c", title: usd(r.cost_cny, rate) }, money(r.cost_cny))));
  }
  function modelRows(rows, rate, kinds) {
    if (!rows || !rows.length) return h("div", { class: "empty" }, T.none);
    return rows.map((r) => h("div", { class: "usage-row" },
      h("div", { class: "k" }, h("i", { class: (kinds && kinds[r.model]) || r.kind || "chat" }), h("code", {}, r.model)),
      h("span", { class: "n" }, `${T.reqs(r.requests)}${r.charged ? " · " + fmt(r.charged) : ""}`),
      h("span", { class: "c", title: usd(r.cost_cny, rate) }, money(r.cost_cny))));
  }
  /** Stacked bars, one column per local day, a segment per kind. `rows` are {day, kind, cost_cny}. */
  function dayBars(rows, n, offsetH, rate) {
    const offset = Number(offsetH || 0) * 3600;
    const byDay = new Map();
    for (const r of rows || []) {
      const d = byDay.get(r.day) || { day: r.day, cost: 0, parts: {}, lines: [] };
      d.cost += r.cost_cny || 0; d.parts[r.kind] = (d.parts[r.kind] || 0) + (r.cost_cny || 0);
      d.lines.push(`${T.kinds[r.kind] || r.kind} ${money(r.cost_cny)} · ${T.reqs(r.requests)}${r.charged ? " · " + fmt(r.charged) : ""}`);
      byDay.set(r.day, d);
    }
    const nowS = Math.floor(Date.now() / 1000);
    const start = nowS - ((nowS + offset) % 86400) - (n - 1) * 86400;
    const cols = [];
    for (let i = 0; i < n; i++) { const k = start + i * 86400; cols.push(byDay.get(k) || { day: k, cost: 0, parts: {}, lines: [] }); }
    const max = Math.max(0.0001, ...cols.map((d) => d.cost));
    const every = n > 45 ? 7 : n > 20 ? 3 : 1;
    return h("div", {}, h("div", { class: "bars" }, ...cols.map((d, i) => h("div", { class: "col", title: `${day(d.day)} · ${money(d.cost)} ${usd(d.cost, rate)}\n${d.lines.join("\n")}` },
      ...["realtime", "video", "image", "chat"].filter((k) => d.parts[k] > 0).map((k) => h("div", { class: "seg-bar " + k, style: `height:${Math.max(1, Math.round(84 * d.parts[k] / max))}px` })),
      d.cost <= 0 ? h("div", { class: "seg-bar", style: "height:1px;background:var(--hairline)" }) : null,
      i % every === 0 ? h("div", { class: "lbl" }, day(d.day)) : null))),
      h("div", { class: "bars-x" }),
      h("div", { class: "legend" }, ...["chat", "image", "video", "realtime"].map((k) => h("span", {}, h("i", { class: k }), T.kinds[k]))));
  }
  /** One metric across the period: its total, then a tiny bar per day (hover for the day and the count). */
  function sparkRow(label, cols, key, tone, dayOf) {
    const values = cols.map((c) => Number(c[key] || 0));
    const max = Math.max(1, ...values), total = values.reduce((a, b) => a + b, 0);
    return h("div", { class: "spark" },
      h("span", { class: "k" }, label), h("b", {}, fmt(total)),
      h("div", { class: "bars-mini" }, ...values.map((v, i) => h("i", { class: v > 0 ? tone : "z", style: `height:${v > 0 ? Math.max(2, Math.round(22 * v / max)) : 1}px`, title: `${dayOf(cols[i])} · ${fmt(v)}` }))));
  }
  const sizeOf = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} kB`);
  function rankRows(items, unit) {
    if (!items || !items.length) return h("div", { class: "empty" }, T.sNone);
    const max = Math.max(1, ...items.map((x) => x.hits));
    return h("div", { class: "ranks" }, ...items.slice(0, 12).map((x) => h("div", { class: "rank", title: x.bytes ? sizeOf(x.bytes) : "" },
      h("span", { class: "n" }, x.name), h("i", { style: `width:${Math.round(100 * x.hits / max)}%` }), h("b", {}, unit ? unit(x) : fmt(x.hits)))));
  }
  /** The site: what nanomuse-traffic counted from the access log, next to GitHub's own numbers. */
  function sitePanel() {
    const tr = traffic;
    if (!tr) return null;
    if (!tr.available) return h("div", { class: "panel span" }, h("h2", {}, T.site(days)), h("div", { class: "empty" }, T.siteOff));
    const rows = tr.days || [], gh = tr.github || {}, ghDays = gh.days || [];
    const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    const first = ghDays[0], last = ghDays[ghDays.length - 1];
    const delta = (k) => (first && last ? Number(last[k]) - Number(first[k]) : 0);
    const dayOf = (r) => r.day.slice(5).replace("-", "/");
    const kpi = (k, v, sub) => h("div", { class: "kpi flat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub ? h("div", { class: "s" }, sub) : null);
    const ghAssets = Object.assign({}, ...Object.values(gh.assets || {}));
    return h("div", { class: "panel span" },
      h("h2", {}, T.site(days), h("span", { class: "sp" }), tr.updated_at ? h("span", { class: "fine" }, T.siteUpdated(when(tr.updated_at))) : null),
      h("div", { class: "kpis in-panel" },
        kpi(T.sPages, fmt(sum("pages")), T.sPeriod), kpi(T.sVisitors, fmt(sum("visitors")), T.sPeriod), kpi(T.sMirror, fmt(sum("downloads")), sizeOf(rows.reduce((a, r) => a + Number(r.bytes || 0), 0))),
        kpi(T.sGithub, fmt(gh.downloads || 0), T.sDelta(delta("downloads"))), kpi(T.sStars, fmt(gh.stars || 0), T.sDelta(delta("stars"))), kpi(T.sBots, fmt(sum("bots")), T.sPeriod)),
      rows.length ? h("div", { class: "sparks" },
        sparkRow(T.sPages, rows, "pages", "blue", dayOf), sparkRow(T.sVisitors, rows, "visitors", "cyan", dayOf), sparkRow(T.sMirror, rows, "downloads", "violet", dayOf)) : h("div", { class: "empty" }, T.sNone),
      h("div", { class: "cols3" },
        h("div", {}, h("h3", {}, T.sFiles, h("span", { class: "fine" }, ` · ${T.sMirrorCol} / ${T.sGithubCol}`)), rankRows(tr.downloads, (x) => `${fmt(x.hits)}${ghAssets[x.name] !== undefined ? ` / ${fmt(ghAssets[x.name])}` : ""}`)),
        h("div", {}, h("h3", {}, T.sRefs), rankRows(tr.referrers)),
        h("div", {}, h("h3", {}, T.sTop), rankRows(tr.pages))),
      h("div", { class: "fine", style: "padding:0 16px 12px" }, T.siteNote));
  }
  /** Data controls, for the operator: who has “help improve” on, what was kept — by day, model and app — the switches turned on and off, and the newest turns. */
  function dataPanel() {
    const dv = dataView;
    if (!dv) return null;
    const rows = dv.days || [], acc = dv.accounts || {}, tot = dv.totals || {}, per = dv.period || {};
    const dayOf = (r) => day(r.day);
    const kpi = (k, v, sub) => h("div", { class: "kpi flat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub ? h("div", { class: "s" }, sub) : null);
    const pct = acc.total ? `${Math.round((acc.share || 0) * 100)}%` : "–";
    const ranks = (items, name, value) => items && items.length ? (() => { const max = Math.max(1, ...items.map(value)); return h("div", { class: "ranks" }, ...items.slice(0, 12).map((x) => h("div", { class: "rank" }, h("span", { class: "n" }, name(x)), h("i", { style: `width:${Math.round(100 * value(x) / max)}%` }), h("b", {}, fmt(value(x)))))); })() : h("div", { class: "empty" }, T.none);
    const recent = (dv.recent || []).map((smp) => sampleRow(smp, { who: true }));
    const byAccount = dv.by_account || [];
    const accountRows = byAccount.map((x) => h("tr", { onclick: () => openAccount(x.account_id) },
      h("td", {}, h("div", { class: "who" }, h("div", { class: "disc" }, initial(x)), h("div", { style: "min-width:0" }, h("div", { class: "n" }, x.hint || x.account_id.slice(0, 8)), h("div", { class: "tags" }, h("span", { class: "pill" }, x.channel === "phone" ? T.phone : T.email), h("span", { class: "pill " + (x.contribute ? "cyan" : "") }, x.contribute ? T.bOn : T.bOff))))),
      h("td", { class: "num" }, fmt(x.samples)),
      h("td", { class: "num hide-sm" }, `${fmt(x.prompt_tokens)} / ${fmt(x.completion_tokens)}`),
      h("td", { class: "hide-sm" }, when(x.first_ts)), h("td", {}, when(x.last_ts)),
      h("td", { class: "hide-sm" }, ...(x.models || []).map((m) => h("code", { style: "margin-right:6px" }, m)))));
    return h("div", { class: "panel span" },
      h("h2", {}, T.data(days), h("span", { class: "sp" }), h("span", { class: "fine" }, T.dDefault(!!dv.default_on)), tot.samples ? h("button", { class: "btn quiet sm", style: "margin-left:10px", onclick: () => exportSamples() }, T.exportSamples) : null),
      h("div", { class: "kpis in-panel" },
        kpi(T.dOn, `${fmt(acc.on || 0)} · ${pct}`, T.dOnSub(acc.on || 0, acc.total || 0)), kpi(T.dOff, fmt(acc.turned_off_ever || 0), T.dOffSub),
        kpi(T.dTurns, fmt(per.samples || 0), T.dTurnsSub(tot.samples || 0, acc.with_samples || 0)), kpi(T.dTokens, fmt((per.prompt_tokens || 0) + (per.completion_tokens || 0)), T.dTokensSub(per.prompt_tokens || 0, per.completion_tokens || 0))),
      rows.length ? h("div", { class: "sparks" },
        sparkRow(T.mTurns, rows, "samples", "violet", dayOf), sparkRow(T.mTurnAccounts, rows, "accounts", "cyan", dayOf), sparkRow(T.mOn, rows, "turned_on", "ok", dayOf),
        sparkRow(T.mDefaultOn, rows, "default_on", "blue", dayOf), sparkRow(T.mOff, rows, "turned_off", "warn", dayOf), sparkRow(T.mDeleted, rows, "deleted", "warn", dayOf)) : null,
      h("div", { class: "cols3" },
        h("div", {}, h("h3", {}, T.dModels), ranks(dv.by_model, (x) => x.model, (x) => x.samples)),
        h("div", {}, h("h3", {}, T.dApps), ranks(dv.by_platform, (x) => T.dPlatforms[x.platform] || x.platform, (x) => x.samples)),
        h("div", {}, h("h3", {}, T.dRecent), recent.length ? h("div", { class: "list", style: "max-height:380px;overflow:auto" }, ...recent) : h("div", { class: "empty" }, T.noSamples))),
      h("h3", { style: "padding:0 16px" }, T.byAccount, h("span", { class: "pill", style: "margin-left:8px" }, byAccount.length)),
      accountRows.length ? h("div", { class: "ledger", style: "padding:0 16px 8px" }, h("table", {}, h("thead", {}, h("tr", {},
        h("th", {}, T.bHint), h("th", { class: "num" }, T.bTurns), h("th", { class: "num hide-sm" }, T.bTokens), h("th", { class: "hide-sm" }, T.bFirst), h("th", {}, T.bLast), h("th", { class: "hide-sm" }, T.bModels))),
        h("tbody", {}, ...accountRows))) : h("div", { class: "empty" }, T.noByAccount),
      h("div", { class: "fine", style: "padding:0 16px 12px" }, dv.keeps ? T.dKeeps(dv.keeps) : "", " ", T.samplesNote));
  }
  /** One demo on the phone in the browser: when, how long, from where and with what, what it used, why it ended. */
  function visitRow(v, withWho) {
    const running = !v.ended;
    const length = (v.ended || Date.now() / 1000) - v.started;
    return h("div", { class: "row" + (withWho && v.visitor ? " tap" : ""), onclick: withWho && v.visitor ? () => openAccount(v.visitor) : null },
      h("span", { class: "tile " + (running ? "ok" : "grey"), html: ICON.web }),
      h("div", { class: "txt" }, h("div", { class: "t" }, when(v.started), withWho ? [" · ", v.hint ? h("span", { style: "color:var(--ink-2);font-weight:400" }, v.hint) : h("span", { class: "pill" }, T.dtAnon)] : null,
        running ? [" ", h("span", { class: "pill ok" }, T.dtRunning)] : null, v.byok ? [" ", h("span", { class: "pill violet" }, T.dtByok)] : null),
        h("div", { class: "s" }, [`${T.dtLength} ${T.dur(length)}`, T.usedLine(v), v.reason ? `${T.dtWhy} ${v.reason}` : "", v.ua ? (platformOf(v.ua) === "browser" ? browserOf(v.ua) : clientLine(v.ua)) : ""].filter(Boolean).join(" · "), v.ip ? [" · ", ipChip(v.ip, v.visitor)] : null)),
      h("code", { class: "fine" }, v.id));
  }
  const browserOf = (ua) => { ua = String(ua || ""); const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : ""; const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ""; return [os, b].filter(Boolean).join(" ") || ua.split(" ")[0]; };
  /** The phone in the browser: every visitor with where from and with what, the demos running now and the period's demos. */
  function demoPanel() {
    const dv = demoView;
    if (!dv) return null;
    if (!dv.available) return h("div", { class: "panel span" }, h("h2", {}, T.demo(days)), h("div", { class: "empty" }, T.demoOff));
    const kpi = (k, v, sub) => h("div", { class: "kpi flat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), sub ? h("div", { class: "s" }, sub) : null);
    const visitors = dv.visitors || [], visits = dv.visits || [], active = dv.active || [];
    const rows = visitors.map((v) => h("tr", { onclick: () => openAccount(v.id) },
      h("td", {}, h("div", { class: "who" }, h("div", { class: "disc" }, initial(v)), h("div", { style: "min-width:0" }, h("div", { class: "n" }, v.hint || v.id.slice(0, 8)), h("div", { class: "tags" }, h("span", { class: "pill" }, v.channel === "sms" || v.channel === "phone" ? T.phone : T.email), v.created ? h("span", { class: "pill cyan" }, T.demoCreated) : null)))),
      h("td", { class: "num" }, fmt(v.signins)), h("td", { class: "num" }, fmt(v.sessions)),
      h("td", { class: "hide-sm" }, when(v.first_seen)), h("td", {}, ago(v.last_seen)),
      h("td", { class: "hide-sm" }, v.last_ua ? h("div", {}, browserOf(v.last_ua)) : null, v.last_ip ? h("div", {}, ipChip(v.last_ip, v.id), v.first_ip && v.first_ip !== v.last_ip ? [" ", h("span", { class: "fine" }, `(${T.firstIp} `, ipChip(v.first_ip, v.id), ")")] : null) : null)));
    return h("div", { class: "panel span" },
      h("h2", {}, T.demo(days), h("span", { class: "sp" }), dv.signin_required === false ? h("span", { class: "fine" }, T.demoNoSignin) : null),
      h("div", { class: "kpis in-panel" }, kpi(T.demoVisitors, fmt(dv.visitors_total || 0)), kpi(T.demoVisits, fmt(visits.length), `/ ${fmt(dv.visits_total || 0)}`), kpi(T.demoActive, fmt(active.length))),
      h("div", { class: "cols3", style: "grid-template-columns: 3fr 2fr" },
        h("div", {}, h("h3", {}, T.demoVisitors, h("span", { class: "pill", style: "margin-left:6px" }, visitors.length)), rows.length ? h("div", { class: "ledger", style: "max-height:420px;overflow:auto" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, T.dvHint), h("th", { class: "num" }, T.dvSignins), h("th", { class: "num" }, T.dvSessions), h("th", { class: "hide-sm" }, T.dvFirst), h("th", {}, T.dvLast), h("th", { class: "hide-sm" }, T.dvClient))), h("tbody", {}, ...rows))) : h("div", { class: "empty" }, T.dvNone)),
        h("div", {}, h("h3", {}, T.demoVisits, h("span", { class: "pill", style: "margin-left:6px" }, visits.length)), h("div", { class: "list feed", style: "max-height:420px;overflow:auto" }, ...active.map((v) => visitRow(v, true)), ...visits.filter((v) => !active.some((a) => a.id === v.id)).map((v) => visitRow(v, true)), !(active.length + visits.length) ? h("div", { class: "empty" }, T.none) : null))));
  }
  /** 0.11: where people are — one table by country and province across accounts, new accounts, sign-ins, requests and demo visitors. */
  function placesPanel() {
    const pv = placesView;
    if (!pv) return null;
    const g = pv.geo || {};
    const title = h("h2", {}, T.places(days));
    if (!g.ready) {
      const why = g.error ? T.placesError(g.error) : g.fetching ? T.placesFetching : T.placesOff;
      return h("div", { class: "panel span" }, title, h("div", { class: "empty" }, why));
    }
    const cols = [["accounts", T.pAccounts], ["new_accounts", T.pNew], ["signins", T.pSignins], ["requests", T.pRequests]];
    if (pv.demo_visitors) cols.push(["demo_visitors", T.pDemo]);
    const cells = new Map();
    for (const [key] of cols) for (const r of pv[key] || []) {
      const k = `${r.country}|${r.province}`;
      const c = cells.get(k) || { country: r.country, code: r.code, province: r.province, n: {} };
      c.n[key] = (c.n[key] || 0) + r.n;
      cells.set(k, c);
    }
    const rows = [...cells.values()].sort((a, b) => (b.n.accounts || 0) - (a.n.accounts || 0) || (b.n.requests || 0) - (a.n.requests || 0) || (b.n.demo_visitors || 0) - (a.n.demo_visitors || 0));
    const name = (c) => (c.country === "本地网络" ? T.pLocal : c.country || T.pUnknown);
    // the country line sums its provinces; a country with one unnamed province is one line
    const byCountry = new Map();
    for (const c of rows) { const k = c.country; const e = byCountry.get(k) || { country: c.country, code: c.code, n: {}, provinces: [] }; for (const [key, v] of Object.entries(c.n)) e.n[key] = (e.n[key] || 0) + v; if (c.province) e.provinces.push(c); byCountry.set(k, e); }
    const out = [];
    for (const e of [...byCountry.values()].sort((a, b) => (b.n.accounts || 0) - (a.n.accounts || 0) || (b.n.requests || 0) - (a.n.requests || 0))) {
      out.push(h("tr", { class: "country" }, h("td", {}, h("b", {}, name(e)), e.code ? h("span", { class: "fine", style: "margin-left:6px" }, e.code) : null), h("td", { class: "hide-sm" }, ""), ...cols.map(([key]) => h("td", { class: "num" }, e.n[key] ? fmt(e.n[key]) : h("span", { class: "fine" }, "·")))));
      for (const c of e.provinces.sort((a, b) => (b.n.accounts || 0) - (a.n.accounts || 0) || (b.n.requests || 0) - (a.n.requests || 0)))
        out.push(h("tr", { class: "province" }, h("td", {}, ""), h("td", { class: "hide-sm" }, c.province), ...cols.map(([key]) => h("td", { class: "num fine" }, c.n[key] ? fmt(c.n[key]) : "·"))));
    }
    return h("div", { class: "panel span" }, title,
      out.length ? h("div", { class: "ledger", style: "max-height:460px;overflow:auto" }, h("table", { class: "places" }, h("thead", {}, h("tr", {}, h("th", {}, T.pCountry), h("th", { class: "hide-sm" }, T.pProvince), ...cols.map(([, label]) => h("th", { class: "num" }, label)))), h("tbody", {}, ...out))) : h("div", { class: "empty" }, T.pNone),
      h("div", { class: "fine", style: "margin-top:8px" }, `${T.pAccountsNote} · ${T.placesNote}`));
  }
  /** 0.11: the models under the key and what the probes found. */
  function catalogPanel() {
    const cv = catalogView;
    if (!cv) return null;
    const title = h("h2", {}, T.catalog);
    if (!cv.enabled) return h("div", { class: "panel" }, title, h("div", { class: "empty" }, T.catalogOff));
    const chat = (cv.models || []).filter((m) => m.kind === "chat"), others = (cv.models || []).filter((m) => m.kind !== "chat");
    const tick = (v) => h("span", { class: "pill " + (v ? "ok" : "grey") }, v ? T.cYes : T.cNo);
    const note = [cv.error ? T.catalogError(cv.error) : "", cv.fetched_at ? T.catalogFetched(when(cv.fetched_at)) : "", !cv.probe ? T.catalogNames : cv.probing ? T.catalogProbing : "", cv.probe && cv.pending ? T.catalogPending(cv.pending) : ""].filter(Boolean).join(" · ");
    const rows = chat.sort((a, b) => a.id.localeCompare(b.id)).map((m) => h("tr", {}, h("td", {}, h("code", {}, m.id)), h("td", {}, tick(m.vision)), h("td", { class: "hide-sm" }, cv.probe ? tick(m.verified) : h("span", { class: "fine" }, "·"))));
    return h("div", { class: "panel" }, title,
      h("div", { class: "fine", style: "margin-bottom:8px" }, T.cCount(chat.length, chat.filter((m) => m.vision).length), note ? ` · ${note}` : ""),
      rows.length ? h("div", { class: "ledger", style: "max-height:360px;overflow:auto" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, T.cModel), h("th", {}, T.cSees), h("th", { class: "hide-sm" }, T.cVerified))), h("tbody", {}, ...rows))) : h("div", { class: "empty" }, T.none),
      others.length ? h("div", { class: "fine", style: "margin-top:8px" }, ...others.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)).map((m) => h("span", { class: "pill", style: "margin:2px 4px 2px 0" }, `${T.kinds[m.kind] || m.kind} · ${m.id}`))) : null,
      h("h3", { style: "margin-top:12px" }, T.cUnusable),
      (cv.unusable || []).length ? h("div", { class: "list" }, ...cv.unusable.map((u) => h("div", { class: "row" }, h("span", { class: "tile bad", html: ICON.warn }), h("div", { class: "txt" }, h("div", { class: "t" }, h("code", {}, u.id)), h("div", { class: "s" }, u.note || "", u.checked_at ? ` · ${when(u.checked_at)}` : ""))))) : h("div", { class: "fine" }, T.cNoUnusable),
      h("div", { class: "fine", style: "margin-top:8px" }, T.catalogNote));
  }
  const platformOf = (ua) => { ua = String(ua || ""); if (ua.startsWith("nanoMuse-Android")) return "android"; if (ua.startsWith("nanoMuse/")) { const m = /\(([^)]*)\)/.exec(ua); return { windows: "windows", darwin: "macos", linux: "linux" }[(m ? m[1] : "").toLowerCase()] || "runtime"; } return ua.startsWith("Mozilla/") ? "browser" : "other"; };
  const versionOf = (ua) => { const m = /^nanoMuse(?:-Android)?\/([0-9][^\s(]*)/.exec(String(ua || "")); return m ? m[1] : ""; };
  const clientLine = (ua) => { if (!ua) return ""; const p = T.dPlatforms[platformOf(ua)] || ""; const v = versionOf(ua); return [p, v ? `v${v}` : ""].filter(Boolean).join(" "); };
  // an address, and where it is when the relay knows (0.11) — one click opens every account seen from it
  const ipChip = (ip, fromAccount) => {
    if (!ip) return null;
    const p = placeOf(ip), txt = placeText(p);
    const chip = h("code", { class: "ip tap", title: T.atAddress(ip), onclick: (e) => { e.stopPropagation(); openAddress(ip, fromAccount); } }, ip);
    return txt ? h("span", { class: "ipp" }, chip, h("span", { class: "place", title: p.isp || "" }, txt)) : chip;
  };
  /** Everything a kept message holds, in order: text parts, omitted parts named, tool calls with their arguments. */
  const msgText = (m) => !m ? "" : typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p) => p && p.type === "text" ? p.text : p && p.omitted ? `[${p.type} ${T.omitted}]` : "").filter(Boolean).join("\n") : "";
  function messageBlock(m) {
    const role = (m && m.role) || "?";
    const parts = [h("b", { class: "role " + role }, (T.roles[role] || role) + ": ")];
    const txt = msgText(m);
    if (m && m.omitted && !txt) parts.push(h("i", { class: "fine" }, T.omitted)); else parts.push(txt);
    for (const c of Array.isArray(m && m.tool_calls) ? m.tool_calls : []) {
      const f = c && c.function ? c.function : {};
      parts.push(h("div", { class: "toolcall" }, h("span", { class: "pill violet" }, T.toolCall), " ", h("code", {}, f.name || ""), f.arguments ? h("pre", {}, typeof f.arguments === "string" ? f.arguments : JSON.stringify(f.arguments, null, 1)) : null));
    }
    return h("div", { class: "msg " + role }, ...parts);
  }
  /** One kept turn: the header line, then the last thing the person said and the reply in full — and the
      whole exchange (every message, every tool call) when expanded. `who` adds the account's hint and a tap into it. */
  function sampleRow(smp, opts = {}) {
    const msgs = Array.isArray(smp.request) ? smp.request : [];
    const lastUser = [...msgs].reverse().find((m) => m && m.role === "user");
    const meta = smp.meta || {};
    let open = false;
    const body = h("div", {});
    const toggle = h("button", { class: "btn quiet sm", style: "margin-top:6px", onclick: (e) => { e.stopPropagation(); open = !open; paint(); } });
    const paint = () => {
      toggle.textContent = open ? T.collapse : `${T.expand} · ${T.lengthNote(msgs.length + 1)}`;
      body.replaceChildren(...(open
        ? [...msgs.map(messageBlock), messageBlock({ role: "assistant", content: String(smp.response || "") })]
        : [messageBlock({ role: "user", content: msgText(lastUser) }), messageBlock({ role: "assistant", content: String(smp.response || "") })]));
    };
    paint();
    const head = h("div", { class: "s" }, when(smp.ts), opts.who && smp.hint ? [" · ", h("span", { class: "tap", onclick: (e) => { e.stopPropagation(); openAccount(smp.account_id); } }, smp.hint)] : null,
      " · ", h("code", {}, smp.model || ""), ` · ${T.inOut(smp.prompt_tokens, smp.completion_tokens)}`, meta.ua ? ` · ${clientLine(meta.ua) || String(meta.ua).split(" ")[0]}` : "", meta.lang ? ` · ${meta.lang}` : "", meta.ip ? [" · ", ipChip(meta.ip, smp.account_id)] : null, smp.cut ? ` · ${zh ? "已截断" : "cut"}` : "");
    return h("div", { class: "row sample", style: "align-items:flex-start" }, h("div", { class: "txt", style: "white-space:pre-wrap;word-break:break-word;min-width:0" }, head, body, toggle));
  }
  /** The relay's own series: sign-ins, accounts, invites, the data switch, calls — and the devices and nanoMuse Web as they stand. */
  function trendsPanel() {
    const sr = series;
    if (!sr) return null;
    const rows = sr.days || [];
    const dayOf = (r) => day(r.day);
    const dev = sr.devices || [];
    const byKind = {};
    for (const d of dev) { const k = byKind[d.kind] || (byKind[d.kind] = { n: 0, os: [] }); k.n += d.count; k.os.push(`${d.os || "?"} ${fmt(d.count)}`); }
    return h("div", { class: "panel span" },
      h("h2", {}, T.trends(days)),
      h("div", { class: "sparks" },
        sparkRow(T.mSignIns, rows, "sign_ins", "blue", dayOf), sparkRow(T.mNew, rows, "new_accounts", "ok", dayOf), sparkRow(T.mActive, rows, "active_accounts", "cyan", dayOf),
        sparkRow(T.mInvites, rows, "invites_used", "violet", dayOf), sparkRow(T.mContribute, rows, "contribute_on", "violet", dayOf), sparkRow(T.mCalls, rows, "calls", "ok", dayOf),
        sparkRow(T.mRefused, rows, "budget_refusals", "warn", dayOf), sparkRow(T.mErrors, rows, "upstream_errors", "warn", dayOf)),
      h("div", { class: "kv" },
        h("b", {}, T.devices), h("span", {}, Object.keys(byKind).length ? Object.entries(byKind).map(([k, v]) => h("div", {}, h("span", { class: "pill", style: "margin-right:6px" }, `${T.devKinds[k] || k} ${fmt(v.n)}`), h("span", { class: "fine" }, v.os.join(" · ")))) : T.none),
        h("b", {}, T.invitesTitle), h("span", {}, T.invitesLine({ with_code: 0, inviters: 0, invited: 0, ...(sr.invites || {}) })),
        h("b", {}, T.webTitle), h("span", {}, sr.web && sr.web.enabled === false ? T.webOff : T.webLine(sr.web))));
  }
  function eventRow(e, withWho, accountId) {
    const [tone, icon] = EVENT_STYLE[e.kind] || ["grey", ICON.person];
    return h("div", { class: "row" + (withWho && e.account_id ? " tap" : ""), onclick: withWho && e.account_id ? () => openAccount(e.account_id) : null },
      h("span", { class: "tile " + tone, html: icon }),
      h("div", { class: "txt" }, h("div", { class: "t" }, T.eventName[e.kind] || e.kind, withWho && e.hint ? [" · ", h("span", { style: "color:var(--ink-2);font-weight:400" }, e.hint)] : null),
        h("div", { class: "s" }, [when(e.ts), e.detail, e.ua ? clientLine(e.ua) : ""].filter(Boolean).join(" · "), e.ip ? [" · ", ipChip(e.ip, accountId || e.account_id)] : null)));
  }
  const deviceIcon = (k) => (k === "phone" ? ICON.phone : k === "web" ? ICON.web : ICON.computer);

  // ── actions ────────────────────────────────────────────────────
  async function doGrant(a) {
    const v = prompt(T.grantPrompt(who(a)), "1000000");
    if (v === null) return;
    const n = parseInt(v.replace(/[\s,_]/g, ""), 10);
    if (!Number.isFinite(n) || n === 0) return;
    try { await api("POST", "/v1/admin/grant", { account_id: a.id, tokens: n }); } catch (e) { alert(e.message); }
    await Promise.all([load(), detail ? openAccount(a.id) : null]);
  }
  async function doCredit(a) {
    const v = prompt(T.creditPrompt(who(a)), "5");
    if (v === null) return;
    const cny = parseFloat(v.replace(/[\s,¥]/g, ""));
    if (!Number.isFinite(cny) || cny <= 0) return;
    const note = prompt(T.creditNote, "") || "";
    try { await api("POST", "/v1/admin/credit", { account_id: a.id, cny, note }); } catch (e) { alert(e.message); }
    await Promise.all([load(), detail ? openAccount(a.id) : null]);
  }
  async function doDisable(a) {
    if (!a.disabled && !confirm(T.disableConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/disable", { account_id: a.id, disabled: !a.disabled }); } catch (e) { alert(e.message); }
    await Promise.all([load(), detail ? openAccount(a.id) : null]);
  }
  async function doDelete(a) {
    if (!confirm(T.removeConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/delete", { account_id: a.id }); } catch (e) { alert(e.message); }
    closeDrawer(); await load();
  }
  async function doMember(a) {
    if (!a.unlimited && !confirm(T.memberConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/unlimited", { account_id: a.id, unlimited: !a.unlimited }); } catch (e) { alert(e.message); }
    await Promise.all([load(), detail ? openAccount(a.id) : null]);
  }

  // ── the drawer: one account ────────────────────────────────────
  let drawerEl = null;
  function closeDrawer() { if (drawerEl) { drawerEl.remove(); drawerEl = null; } detail = null; address = null; }
  /** The whole training set as a file: fetched with the admin token (a bare link could not carry it).
      What can go wrong is said in words: the browser's "Failed to fetch" covers a dropped connection,
      a proxy in the way and a token that stopped working alike. */
  async function exportSamples(accountId) {
    let r;
    try {
      r = await fetch(`/v1/admin/samples/export${accountId ? `?account_id=${encodeURIComponent(accountId)}` : ""}`, { headers: { "X-Admin-Token": token }, cache: "no-store" });
    } catch (_) { alert(T.exportFailed(T.offline)); return; }
    if (r.status === 401) { token = ""; SS.removeItem("nm.admin"); err = T.wrong; draw(); return; }
    if (!r.ok) { alert(T.exportFailed(`HTTP ${r.status}${r.statusText ? " " + r.statusText : ""}`)); return; }
    let blob;
    try { blob = await r.blob(); } catch (_) { alert(T.exportFailed(T.exportCut)); return; }
    if (!blob.size) { alert(T.exportEmpty); return; }
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `nanomuse-samples-${accountId ? accountId.slice(0, 8) + "-" : ""}${new Date().toISOString().slice(0, 10)}.jsonl` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function ensureDrawer() {
    if (drawerEl) return;
    drawerEl = h("div", { class: "drawer-scrim", onclick: (e) => { if (e.target === drawerEl) closeDrawer(); } }, h("div", { class: "drawer" }, h("div", { class: "empty" }, T.loading)));
    document.body.append(drawerEl);
    const onKey = (e) => { if (e.key === "Escape") { closeDrawer(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
  }
  async function openAccount(id) {
    ensureDrawer();
    address = null;
    try { detail = await api("GET", `/v1/admin/accounts/${encodeURIComponent(id)}?days=${days}`); detailErr = ""; }
    catch (e) { detail = null; detailErr = e.message; }
    if (drawerEl) drawDrawer();
  }
  /** One address across accounts, in the drawer; `fromAccount` is where "back" goes. */
  let address = null;
  async function openAddress(ip, fromAccount) {
    ensureDrawer();
    try { address = { ...(await api("GET", `/v1/admin/address?ip=${encodeURIComponent(ip)}`)), from: fromAccount || (detail && detail.account && detail.account.id) || "" }; detailErr = ""; }
    catch (e) { address = { ip, accounts: [], from: fromAccount || "" }; detailErr = e.message; }
    if (drawerEl) drawDrawer();
  }
  function drawAddress(box) {
    const list = address.accounts || [];
    const p = address.place || placeOf(address.ip);
    box.replaceChildren(...[
      h("div", { class: "head" }, h("h2", {}, T.atAddress(address.ip)), h("button", { class: "round", html: ICON.close, onclick: closeDrawer })),
      p ? h("div", { class: "fine", style: "padding:0 16px 8px" }, h("span", { class: "place big" }, placeText(p)), p.isp ? ` · ${p.isp}` : "") : null,
      address.from ? h("div", { class: "acts", style: "padding:0 16px 10px" }, h("button", { class: "btn quiet sm", onclick: () => openAccount(address.from) }, "← " + T.back)) : null,
      detailErr ? h("div", { class: "hint bad" }, detailErr) : null,
      h("div", { class: "card" }, list.length ? list.map((x) => h("div", { class: "row tap", onclick: () => openAccount(x.id) },
        h("span", { class: "tile" + (x.id === address.from ? "" : " grey"), html: ICON.person }),
        h("div", { class: "txt" }, h("div", { class: "t" }, x.hint || x.id.slice(0, 8), " ", h("span", { class: "pill" }, x.channel === "phone" ? T.phone : T.email)),
          h("div", { class: "s" }, `${T.times(x.n)} · ${T.lastSeen} ${ago(x.last_seen)} · ${T.thJoined} ${dateOf(x.created_at)}`)),
        h("code", { class: "fine" }, x.id.slice(0, 8)))) : h("div", { class: "empty" }, T.none)),
      h("div", { class: "fine", style: "padding:10px 16px" }, T.addrNote)].filter(Boolean));
  }
  /** A list that reads on, page by page, to the first line: `fetchPage(before)` → {rows, total}; `row(r)` draws one. */
  function pagedList(firstRows, total, fetchPage, row, cls) {
    const box = h("div", { class: cls || "" });
    let rows = firstRows.slice(), lastId = rows.length ? rows[rows.length - 1].id : 0, busy = false;
    const foot = h("div", { class: "pager fine" });
    const paint = () => {
      const more = rows.length < total && lastId;
      foot.replaceChildren(...[h("span", {}, more ? T.shown(rows.length, total) : T.allShown(total)), more ? h("button", { class: "btn quiet sm", style: "margin-left:10px", onclick: loadMore }, busy ? T.loading : T.loadMore) : null].filter(Boolean));
    };
    async function loadMore() {
      if (busy) return; busy = true; paint();
      try { const page = await fetchPage(lastId); rows = rows.concat(page.rows || []); total = page.total || total; if (page.rows && page.rows.length) lastId = page.rows[page.rows.length - 1].id; else total = rows.length; body.append(...(page.rows || []).map(row)); }
      catch (e) { foot.replaceChildren(h("span", { class: "bad" }, e.message)); busy = false; return; }
      busy = false; paint();
    }
    const body = h("div", {}, ...rows.map(row));
    paint();
    box.append(...[rows.length ? body : h("div", { class: "empty" }, T.none), total ? foot : null].filter(Boolean));
    return box;
  }
  function drawDrawer() {
    const box = drawerEl.firstChild;
    if (address) { drawAddress(box); return; }
    if (!detail) { box.replaceChildren(h("div", { class: "head" }, h("h2", {}, "…"), h("button", { class: "round", html: ICON.close, onclick: closeDrawer })), h("div", { class: "empty" }, detailErr || T.loading)); return; }
    const s = (ov && ov.settings) || {}, rate = Number(s.usd_cny || 0), kinds = s.model_kinds || {};
    const a = detail.account, sp = detail.spend || {}, u = detail.usage || {}, p = u.period || {};
    const tags = [
      h("span", { class: "pill" }, a.channel === "phone" ? T.phone : T.email),
      a.member ? h("span", { class: "pill ok", title: a.listed ? T.listedNote : "" }, a.listed ? T.listed : T.member) : null,
      a.has_password ? h("span", { class: "pill violet" }, T.hasPassword) : h("span", { class: "pill" }, T.noPassword),
      a.disabled ? h("span", { class: "pill bad" }, T.disabled) : null,
      a.locked ? h("span", { class: "pill warn" }, T.locked) : null,
      a.contribute ? h("span", { class: "pill cyan" }, T.contributes) : null,
    ];
    const cap = a.member ? 0 : Number(sp.grant_cny || 0), frac = cap > 0 ? Math.min(1, Number(sp.total_cny || 0) / cap) : 0;
    box.replaceChildren(
      h("div", { class: "head" }, h("h2", {}, a.identifier || a.hint), h("button", { class: "round", html: ICON.close, onclick: closeDrawer })),
      h("div", { class: "card" },
        h("div", { class: "identity" }, h("div", { class: "disc" }, initial(a)),
          h("div", { class: "who" }, h("div", { class: "n" }, a.hint, " ", h("span", { class: "fine" }, `· ${T.identifierNote}`)),
            h("div", { class: "m" }, `${dateOf(a.created_at)} · `, h("code", {}, a.id)),
            h("div", { class: "m", style: "margin-top:4px" }, `${T.lastSeenAt} ${a.last_seen_at ? ago(a.last_seen_at) : T.never}`, a.last_ua ? [` · ${T.lastClient} ${clientLine(a.last_ua) || a.last_ua}`] : null,
              a.last_ip ? [` · ${T.lastIp} `, ipChip(a.last_ip, a.id)] : null, a.first_ip && a.first_ip !== a.last_ip ? [` · ${T.firstIp} `, ipChip(a.first_ip, a.id)] : null),
            h("div", { class: "tags", style: "margin-top:6px" }, ...tags))),
        h("div", { class: "stats" },
          h("div", {}, h("div", { class: "k" }, T.spendTotal), h("div", { class: "v", title: usd(sp.total_cny, rate) }, money(sp.total_cny)), cap > 0 ? h("div", { class: "meter", style: "margin-top:6px" }, h("i", { class: frac >= 1 ? "bad" : frac >= 0.8 ? "warn" : "", style: `width:${Math.round(frac * 100)}%` })) : null, h("div", { class: "k", style: "margin-top:4px" }, cap > 0 ? `${T.cap} ${money(cap)} · ${T.left} ${money(sp.left_cny || 0)}` : T.noCap)),
          h("div", {}, h("div", { class: "k" }, T.spendToday), h("div", { class: "v", title: usd(sp.today_cny, rate) }, money(sp.today_cny)), h("div", { class: "k", style: "margin-top:4px" }, T.tokens(a.used))),
          h("div", {}, h("div", { class: "k" }, T.requests), h("div", { class: "v" }, fmt(sp.requests_total)), h("div", { class: "k", style: "margin-top:4px" }, s.unlimited ? T.noCap : `${T.grant}: ${fmt(a.granted)}`))),
        h("div", { class: "fine", style: "padding:0 16px 10px" }, T.poolLine(money(a.grant_cny || 0), a.left_cny === null || a.left_cny === undefined ? null : money(a.left_cny), a.invites || 0, !!a.contribute_bonus_at),
          a.invited_by ? [" · ", T.invitedBy, " ", h("code", {}, String(a.invited_by).slice(0, 8))] : null),
        h("div", { class: "acts" },
          s.unlimited ? null : h("button", { class: "btn quiet", onclick: () => doGrant(a) }, T.grant),
          h("button", { class: "btn quiet", onclick: () => doCredit(a) }, T.credit),
          a.listed ? null : h("button", { class: "btn quiet", onclick: () => doMember(a) }, a.unlimited ? T.unmakeMember : T.makeMember),
          h("button", { class: "btn quiet", onclick: () => doDisable(a) }, a.disabled ? T.enable : T.disable),
          h("button", { class: "btn danger", onclick: () => doDelete(a) }, T.remove))),
      h("div", { class: "label" }, T.byKind), h("div", { class: "card" },
        h("div", { class: "label", style: "margin:12px 16px 4px" }, T.usageToday), kindRows(u.today && u.today.by_kind, rate),
        h("div", { class: "label", style: "margin:12px 16px 4px" }, T.usagePeriod(p.days || days)), kindRows(p.by_kind, rate),
        h("div", { class: "label", style: "margin:12px 16px 4px" }, T.usageTotal), kindRows(u.total && u.total.by_kind, rate)),
      h("div", { class: "label" }, T.byDay(p.days || days)), h("div", { class: "card" }, dayBars(p.by_day, p.days || days, s.day_offset_h, rate)),
      h("div", { class: "label" }, T.byModel), h("div", { class: "card" }, modelRows(p.by_model, rate, kinds)),
      h("div", { class: "label" }, T.addresses, ` · ${fmt((detail.addresses || []).length)}`), h("div", { class: "card" }, (detail.addresses || []).length ? (detail.addresses || []).map((x) => h("div", { class: "row tap", onclick: () => openAddress(x.ip, a.id) },
        h("span", { class: "tile grey", html: ICON.web }),
        h("div", { class: "txt" }, h("div", { class: "t" }, h("code", {}, x.ip), " ", ...(x.platforms || []).map((p) => h("span", { class: "pill", style: "margin-left:4px" }, T.dPlatforms[p] || p))),
          h("div", { class: "s" }, `${T.times(x.n)} · ${T.firstSeen} ${when(x.first_seen)} · ${T.lastSeen} ${when(x.last_seen)}`)))) : h("div", { class: "empty" }, T.none),
        h("div", { class: "fine", style: "padding:6px 16px 10px" }, T.addrNote)),
      h("div", { class: "label" }, T.sessions, ` · ${fmt((detail.sessions || []).length)}`), h("div", { class: "card" }, (detail.sessions || []).length ? (detail.sessions || []).map((k) => h("div", { class: "row" },
        h("span", { class: "tile" + (k.revoked_at ? " grey" : ""), html: /web|网页|browser/i.test(k.device || "") ? ICON.web : /phone|android|手机|iphone/i.test(k.device || "") ? ICON.phone : ICON.computer }),
        h("div", { class: "txt" }, h("div", { class: "t" }, k.device || "—", k.revoked_at ? [" ", h("span", { class: "pill" }, T.revoked)] : null),
          h("div", { class: "s" }, `${T.via[k.via] || k.via} · ${when(k.created_at)}${k.last_used_at ? ` · ${T.lastUsed} ${ago(k.last_used_at)}` : ""}`, k.ua ? ` · ${clientLine(k.ua) || String(k.ua).split(" ")[0]}` : "", k.ip ? [" · ", ipChip(k.ip, a.id)] : null)),
        h("code", { class: "fine" }, k.prefix))) : h("div", { class: "empty" }, T.none)),
      h("div", { class: "label" }, T.devices, ` · ${fmt((detail.devices || []).length)}`), h("div", { class: "card" }, (detail.devices || []).length ? (detail.devices || []).map((d) => h("div", { class: "row" },
        h("span", { class: "tile" + (d.online ? "" : " grey"), html: deviceIcon(d.kind) }),
        h("div", { class: "txt" }, h("div", { class: "t" }, d.name || d.id, " ", h("span", { class: "pill " + (d.online ? "ok" : "") }, d.online ? T.online : T.offline)),
          h("div", { class: "s" }, [d.kind, d.os, d.version ? "v" + d.version : "", d.last_seen ? `${T.lastSeen} ${ago(d.last_seen)}` : "", d.first_seen ? `${T.firstSeen} ${dateOf(d.first_seen)}` : ""].filter(Boolean).join(" · "), d.ip ? [" · ", ipChip(d.ip, a.id)] : null)),
        Array.isArray(d.actions) && d.actions.length ? h("span", { class: "pill", title: d.actions.join(", ") }, d.actions.length) : null)) : h("div", { class: "empty" }, T.none)),
      h("div", { class: "label" }, T.ledger, ` · ${fmt(detail.ledger_total || (detail.recent || []).length)}`), h("div", { class: "card ledger" },
        pagedList(detail.recent || [], detail.ledger_total || (detail.recent || []).length, (before) => api("GET", `/v1/admin/accounts/${encodeURIComponent(a.id)}/ledger?limit=200&before=${before}`), (r) => ledgerLine(r, a.id), "lines")),
      h("div", { class: "label" }, T.timeline, ` · ${fmt(detail.events_total || (detail.events || []).length)}`), h("div", { class: "card feed" },
        pagedList(detail.events || [], detail.events_total || (detail.events || []).length, (before) => api("GET", `/v1/admin/accounts/${encodeURIComponent(a.id)}/events?limit=200&before=${before}`), (e) => eventRow(e, false, a.id))),
      ...(detail.demo ? [h("div", { class: "label" }, T.demoOfAccount, ` · ${fmt(detail.demo.visits_total || 0)}`), h("div", { class: "card feed" },
        detail.demo.visitor ? h("div", { class: "fine", style: "padding:10px 16px 4px" }, T.demoAccountLine(detail.demo.visitor), detail.demo.visitor.last_ua ? ` · ${browserOf(detail.demo.visitor.last_ua)}` : "") : null,
        (detail.demo.visits || []).length ? (detail.demo.visits || []).map((v) => visitRow(v, false)) : h("div", { class: "empty" }, T.demoNoneHere))] : []),
      ...(a.contribute || a.samples ? [h("div", { class: "label" }, T.samplesAll, ` · ${fmt(a.samples || 0)}`), h("div", { class: "card" },
        h("div", { class: "acts", style: "padding:10px 16px 0" }, a.samples ? h("button", { class: "btn quiet sm", onclick: () => exportSamples(a.id) }, T.exportThis) : null),
        h("div", { class: "fine", style: "padding:6px 16px 0" }, T.samplesNote), samplesBox(a.id))] : []),
      h("div", { class: "fine", style: "padding:14px 4px 4px" }, h("b", {}, T.recorded), " ", T.recordedNote),
    );
  }
  /** One statement line: when, kind, model, what it took, what it cost — and, 0.10, from where and with what. */
  function ledgerLine(r, accountId) {
    return h("div", { class: "line" },
      h("span", { class: "c when" }, when(r.ts)),
      h("span", { class: "c" }, h("span", { class: "pill " + ({ chat: "blue", image: "violet", video: "cyan", realtime: "ok", grant: "ok", credit: "ok" }[r.kind] || "") }, T.kinds[r.kind] || r.kind)),
      h("span", { class: "c grow" }, h("code", {}, r.model || ""), r.detail && r.detail.from ? h("span", { class: "fine" }, ` ${r.detail.from}`) : null, r.detail && r.detail.note ? h("span", { class: "fine" }, ` ${r.detail.note}`) : null),
      h("span", { class: "c num" }, r.kind === "chat" ? T.inOut(r.prompt_tokens, r.completion_tokens) : r.kind === "grant" || r.kind === "credit" ? (r.detail && r.detail.credit_uy ? money(r.detail.credit_uy / 1e6) : fmt(-r.charged)) : fmt(r.charged)),
      h("span", { class: "c num" }, money(r.cost_cny)),
      h("span", { class: "c fine" }, r.ua ? clientLine(r.ua) : "", r.ip ? [" ", ipChip(r.ip, accountId)] : null));
  }

  /** Every turn one account kept, newest first, page by page to the first; each row is the whole turn (sampleRow). */
  function samplesBox(accountId) {
    const box = h("div", {}, h("div", { class: "empty" }, T.loading));
    let before = 0, shown = 0, total = 0;
    const list = h("div", {});
    const foot = h("div", { class: "pager fine" });
    const paint = () => {
      const more = shown < total && before;
      foot.replaceChildren(...[h("span", {}, more ? T.shown(shown, total) : T.allShown(total)), more ? h("button", { class: "btn quiet sm", style: "margin-left:10px", onclick: load }, T.loadMore) : null].filter(Boolean));
    };
    const load = async () => {
      try {
        const r = await api("GET", `/v1/admin/samples?account_id=${encodeURIComponent(accountId)}&limit=20${before ? `&before=${before}` : ""}`);
        const items = r.samples || [];
        total = r.total || 0;
        if (shown === 0) box.replaceChildren(...[items.length ? list : h("div", { class: "empty" }, T.noSamples), total ? foot : null].filter(Boolean));
        list.append(...items.map((smp) => sampleRow(smp)));
        shown += items.length;
        before = items.length ? items[items.length - 1].ts : 0;
        if (!items.length) total = shown;
        paint();
      } catch (e) { box.replaceChildren(h("div", { class: "hint bad" }, e.message)); }
    };
    load();
    return box;
  }

  // ── main ───────────────────────────────────────────────────────
  function drawMain() {
    const s = ov.settings || {}, rate = Number(s.usd_cny || 0), kinds = s.model_kinds || {};
    const c = ov.accounts || {}, today = ov.today || {}, week = ov.week || {}, period = ov.period || {}, sig = ov.signals_today || {};
    const list = (accounts && accounts.accounts) || [];
    const shown = q ? list.filter((a) => (a.hint || "").includes(q) || (a.identifier || "").includes(q) || (a.id || "").startsWith(q) || (a.last_ip || "").includes(q)) : list;
    const kpi = (k, v, sub, small) => h("div", { class: "kpi" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v, small ? h("small", {}, small) : null), h("div", { class: "s", title: sub }, sub));
    const spendKpi = (label, t) => kpi(`${T.kSpent} · ${label}`, money(t.cost_cny), T.kSpentSub(t.requests, t.charged), usd(t.cost_cny, rate));

    const rows = shown.map((a) => h("tr", { onclick: () => openAccount(a.id) },
      h("td", {}, h("div", { class: "who" }, h("div", { class: "disc" }, initial(a)),
        h("div", { style: "min-width:0" }, h("div", { class: "n" }, a.hint),
          h("div", { class: "tags" },
            h("span", { class: "pill" }, a.channel === "phone" ? T.phone : T.email),
            a.member ? h("span", { class: "pill ok" }, a.listed ? T.listed : T.member) : null,
            a.has_password ? h("span", { class: "pill violet" }, T.password) : null,
            a.disabled ? h("span", { class: "pill bad" }, T.disabled) : null,
            a.locked ? h("span", { class: "pill warn" }, T.locked) : null)))),
      h("td", { class: "hide-sm" }, dateOf(a.created_at)),
      h("td", { class: "num" }, money(a.spent_cny), h("span", { class: "sub" }, money(a.spent_today_cny))),
      h("td", { class: "num hide-sm" }, fmt(a.used), h("span", { class: "sub" }, fmt(a.used_today))),
      h("td", { class: "num hide-sm" }, fmt(a.requests)),
      h("td", { class: "hide-sm" }, a.last_active_at ? ago(a.last_active_at) : T.never, h("span", { class: "sub" }, `${a.live_keys || 0} ${zh ? "个登录" : "sign-ins"}`)),
      h("td", { class: "hide-sm" }, a.last_ua || a.last_ip ? [a.last_ua ? h("div", {}, clientLine(a.last_ua) || String(a.last_ua).split(" ")[0]) : null, a.last_ip ? h("div", {}, ipChip(a.last_ip, a.id)) : null] : T.none),
      h("td", {}, (a.devices || []).length ? h("div", { class: "dev" }, ...(a.devices || []).map((d) => h("span", { title: `${d.kind || ""} ${d.os || ""} · ${d.online ? T.online : ago(d.last_seen)}` }, h("i", { class: "dot" + (d.online ? " on" : "") }), d.name || d.id))) : T.none),
    ));

    app.replaceChildren(h("div", { class: "admin" },
      h("div", { class: "bar" },
        h("img", { src: "../mark.svg", alt: "" }),
        h("h1", {}, T.title, h("small", {}, location.host, ov.version ? ` · v${ov.version}` : "")),
        h("div", { class: "seg" }, ...[7, 30, 90].map((d) => h("button", { class: d === days ? "on" : "", onclick: () => { days = d; SS.setItem("nm.admin.days", d); load(); } }, T.period(d)))),
        h("button", { class: "round", title: T.refresh, html: ICON.refresh, onclick: load }),
        h("button", { class: "round", title: T.lock, html: ICON.lock, onclick: () => { token = ""; SS.removeItem("nm.admin"); ov = null; draw(); } })),
      err ? h("div", { class: "hint bad", style: "margin:0 0 14px" }, err) : null,
      h("div", { class: "kpis" },
        kpi(T.kAccounts, fmt(c.total), T.kAccountsSub(c)),
        kpi(`${T.kActive} · ${T.today}`, fmt(today.active_accounts), T.kActiveSub(today.new_accounts || 0), `/ ${fmt(period.active_accounts)} ${T.period(days)}`),
        spendKpi(T.today, today), spendKpi(T.week, week), spendKpi(T.period(days), period),
        kpi(T.kOnline, fmt(ov.online_devices), T.kOnlineSub(c.devices || 0, c.live_keys || 0)),
        kpi(T.kSignals, fmt((sig.sign_ins || 0) + (sig.calls || 0)), T.kSignalsSub({ sign_ins: 0, sign_in_failures: 0, budget_refusals: 0, upstream_errors: 0, calls: 0, ...sig })),
        (() => { const ct = ov.contributions || {}; const k = kpi(T.kSamples, fmt(ct.samples || 0), T.kSamplesSub(ct.accounts || 0)); if (ct.samples) k.append(h("button", { class: "btn quiet sm", style: "margin-top:6px", onclick: () => exportSamples() }, T.exportSamples)); return k; })()),
      h("div", { class: "grid" },
        h("div", { class: "panel span" }, h("h2", {}, T.byDay(Math.min(days, 90))), dayBars(usage && usage.days, Math.min(days, 90), s.day_offset_h, rate)),
        trendsPanel(), placesPanel(), dataPanel(), demoPanel(), sitePanel(),
        h("div", { class: "panel" }, h("h2", {}, `${T.byKind} · ${T.today}`), kindRows(today.by_kind, rate), h("h2", {}, `${T.byKind} · ${T.period(days)}`), kindRows(period.by_kind, rate)),
        h("div", { class: "panel" }, h("h2", {}, `${T.byModel} · ${T.period(days)}`), modelRows(period.by_model, rate, kinds)),
        catalogPanel(),
        h("div", { class: "panel" }, h("h2", {}, T.top(days)), (ov.top_accounts || []).length ? (ov.top_accounts || []).map((t) => h("div", { class: "row tap", onclick: () => openAccount(t.account_id) },
          h("span", { class: "tile grey", html: ICON.person }), h("div", { class: "txt" }, h("div", { class: "t" }, t.hint), h("div", { class: "s" }, `${T.reqs(t.requests)} · ${T.tokens(t.charged)}`)),
          h("span", { class: "v" }, h("b", {}, money(t.cost_cny))))) : h("div", { class: "empty" }, T.none)),
        h("div", { class: "panel feed" }, h("h2", {}, T.events),
          h("div", { class: "filter" }, ...FILTERS.map(([k, name]) => h("button", { class: k === filter ? "on" : "", onclick: () => { filter = k; loadFiltered(); } }, T[name]))),
          h("div", { class: "list" }, ...((filter ? filtered : ov.events) || []).slice(0, 60).map((e) => eventRow(e, true)),
            !((filter ? filtered : ov.events) || []).length ? h("div", { class: "empty" }, T.none) : null)),
        h("div", { class: "panel span" },
          h("h2", {}, T.accounts, h("span", { class: "pill" }, shown.length), h("span", { class: "sp" }),
            h("span", { class: "search" }, h("input", { type: "search", placeholder: T.search, value: q, oninput: (e) => { q = e.target.value.trim(); drawMain(); const i = app.querySelector(".search input"); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } } }))),
          rows.length ? h("table", {},
            h("thead", {}, h("tr", {},
              h("th", {}, T.thWho), h("th", { class: "hide-sm" }, T.thJoined), h("th", { class: "num" }, T.thSpent), h("th", { class: "num hide-sm" }, T.thTokens),
              h("th", { class: "num hide-sm" }, T.thReqs), h("th", { class: "hide-sm" }, T.thActive), h("th", { class: "hide-sm" }, T.thClient), h("th", {}, T.thDevices))),
            h("tbody", {}, ...rows)) : h("div", { class: "empty" }, T.noAccounts)),
        h("div", { class: "panel span" },
          h("h2", {}, T.config),
          h("div", { class: "kv" },
            h("b", {}, T.kAccounts), h("span", {}, `${s.signup_open ? T.signupOpen : T.signupClosed} · ${T.capLine(s.allowance_cny, s.allowance_usd, s.invite_bonus_cny)} · ${T.perMinute(s.per_minute_requests)} · ${T.pwMin(s.password_min_len || 8)}`),
            h("b", {}, T.realtime), h("span", {}, s.realtime_enabled ? T.on : T.off),
            h("b", {}, T.allowed), h("code", {}, (s.allowed_identifiers || []).join(", ") || T.allowedNone),
            h("b", {}, T.rate), h("span", {}, T.rateLine(rate)),
            h("b", {}, T.prices), h("span", {}, ...Object.entries(s.prices || {}).map(([id, p]) => h("div", {}, h("span", { class: "pill " + ({ chat: "blue", image: "violet", video: "cyan", realtime: "ok" }[kinds[id]] || ""), style: "margin-right:6px" }, T.kinds[kinds[id]] || kinds[id] || ""), h("code", {}, id), " ", T.priceLine(p)))),
            h("b", {}, T.sender), h("span", {}, s.sender || "log"),
            h("b", {}, T.version), h("span", {}, ov.version || "")))),
      h("p", { class: "foot" }, T.foot),
    ));
  }

  function draw() {
    if (!token || !ov) drawGate(); else drawMain();
    if (drawerEl) drawDrawer();
  }

  document.title = T.title;
  if (token) load(); else draw();
})();
