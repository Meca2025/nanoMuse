/* nanoMuse web console — a front door to the Muses on your devices.
   No build step, no framework: one WebSocket to /v1/hub as a `web` device,
   `task` calls to the device you pick, events streamed back. */
(() => {
  "use strict";

  // ── i18n ────────────────────────────────────────────────────────
  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const T = zh ? {
    tagline: "你的每一台设备，都是你的 Muse。",
    identifier: "手机号或邮箱", code: "验证码", sendCode: "发送验证码", signIn: "登录", another: "换一个号码或邮箱",
    codeSent: "验证码已发送，十分钟内有效。", relay: "服务器", fine: "登录后，这个页面能看到你账号下所有在线的设备，并让它们各自的 Muse 去做事。网页本身不操作任何设备。",
    devices: "设备", noDevices: "还没有设备接入。用同一个账号在手机上登录 nanoMuse，或在电脑上运行 nanoMuse Desktop，它们就会出现在这里。",
    online: "在线", offline: "离线", phone: "手机", computer: "电脑", web: "网页", thisTab: "这个页面",
    signOut: "退出", connected: "已连接", connecting: "连接中…", disconnected: "已断开，正在重连…",
    pick: "在左边选一台设备", pickSub: "然后像发消息一样告诉它要做什么。手机上的 Muse 会用手机的应用和沙盒，电脑上的 Muse 会用电脑的 shell、文件和屏幕；它们也能互相帮忙。",
    placeholder: (n) => `让 ${n} 做点什么…`, offlineNote: (n) => `${n} 现在不在线，消息发不过去。`,
    thinking: "思考中", running: "执行", result: "结果", asks: "转交", remote: "对方",
    approvalTitle: (d) => `${d} 想执行一个需要确认的操作`, allow: "允许", deny: "拒绝", allowed: "已允许", denied: "已拒绝", expired: "已超时", stop: "停止",
    stopped: "已停止。", clear: "清空记录", errorOffline: "设备已离线，没有收到回答。", errorTimeout: "等太久了，没有收到回答。", errorBusy: "这台设备正在处理上一条消息。",
    busy: (n) => `${n} 正在处理…`, sentFrom: "来自网页", waitingPhone: "手机上的 Muse 正在处理，完成后会把结果发回来。",
    lastSeen: "上次在线", justNow: "刚刚", minAgo: (m) => `${m} 分钟前`, hAgo: (h) => `${h} 小时前`, dAgo: (d) => `${d} 天前`,
    risks: { destructive: "会删除或改写", outbound: "会向外发送", system: "系统级操作", install: "安装软件", money: "涉及付款" },
    errors: { bad_identifier: "请输入手机号或邮箱地址。", code_wrong: "验证码不对。", code_expired: "验证码已过期，请重新发送。", code_too_often: "发送太频繁，稍等几分钟。", not_invited: "这是一台私人中转，这个号码或邮箱不在名单上。", send_failed: "验证码发送失败，请稍后再试。", bad_key: "登录已失效，请重新登录。", offline: "连不上服务器。" },
  } : {
    tagline: "Every device you own, a Muse of yours.",
    identifier: "Phone number or e-mail", code: "Verification code", sendCode: "Send code", signIn: "Sign in", another: "Use another number or address",
    codeSent: "A six-digit code is on its way; it is good for ten minutes.", relay: "Server", fine: "Once signed in, this page shows every device of your account that is online and lets each device's Muse do things. The page itself operates nothing.",
    devices: "Devices", noDevices: "No device yet. Sign in to nanoMuse on your phone with this account, or run nanoMuse Desktop on a computer, and they appear here.",
    online: "online", offline: "offline", phone: "phone", computer: "computer", web: "browser", thisTab: "this tab",
    signOut: "Sign out", connected: "connected", connecting: "connecting…", disconnected: "disconnected, reconnecting…",
    pick: "Pick a device on the left", pickSub: "then tell it what to do, like a message. The Muse on a phone uses the phone's apps and sandbox; the one on a computer uses its shell, files and screen; and they can ask each other.",
    placeholder: (n) => `Ask ${n} to do something…`, offlineNote: (n) => `${n} is offline; nothing can be sent.`,
    thinking: "thinking", running: "run", result: "result", asks: "asks", remote: "there",
    approvalTitle: (d) => `${d} wants to do something that needs your OK`, allow: "Allow", deny: "Don't", allowed: "allowed", denied: "declined", expired: "timed out", stop: "Stop",
    stopped: "Stopped.", clear: "Clear history", errorOffline: "The device went offline before answering.", errorTimeout: "No answer in time.", errorBusy: "That device is still on the previous message.",
    busy: (n) => `${n} is working…`, sentFrom: "from the web", waitingPhone: "The Muse on the phone is working; the answer comes back here when it is done.",
    lastSeen: "last seen", justNow: "just now", minAgo: (m) => `${m} min ago`, hAgo: (h) => `${h} h ago`, dAgo: (d) => `${d} d ago`,
    risks: { destructive: "removes or rewrites", outbound: "sends something out", system: "system-level", install: "installs software", money: "a payment" },
    errors: { bad_identifier: "Enter a mobile number or an e-mail address.", code_wrong: "That code is not right.", code_expired: "That code has expired; send a new one.", code_too_often: "Too many codes; wait a few minutes.", not_invited: "This relay is private; that number or address is not on its list.", send_failed: "The code could not be sent; try again shortly.", bad_key: "Your sign-in has expired; sign in again.", offline: "Cannot reach the server." },
  };

  // ── state ───────────────────────────────────────────────────────
  const LS = window.localStorage;
  const base = location.origin;
  const params = new URLSearchParams(location.search);
  let key = LS.getItem("nm.key") || "";
  let hint = LS.getItem("nm.hint") || "";
  let ws = null, wsState = "off", backoff = 1000, devices = [], selected = params.get("device") || LS.getItem("nm.selected") || "";
  const pending = new Map(); // call id → {onEvent, resolve, reject}
  const chats = new Map(); // device id → {messages:[], busy:false, callId:null}
  const webId = LS.getItem("nm.webid") || ("web-" + Math.random().toString(36).slice(2, 12));
  LS.setItem("nm.webid", webId);

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
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // A very small Markdown: paragraphs, **bold**, `code`, ```blocks```, links, lists.
  function md(text) {
    const blocks = String(text).split(/```/);
    let out = "";
    blocks.forEach((b, i) => {
      if (i % 2 === 1) { out += `<pre>${esc(b.replace(/^\w*\n/, ""))}</pre>`; return; }
      const paras = b.split(/\n{2,}/).filter((p) => p.trim());
      for (const p of paras) {
        let s = esc(p);
        s = s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
          .replace(/^(?:[-*] .*(?:\n|$))+/gm, (m) => "<ul>" + m.trim().split("\n").map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`).join("") + "</ul>")
          .replace(/^#{1,3} (.*)$/gm, "<b>$1</b>");
        out += `<p>${s.replace(/\n/g, "<br>")}</p>`;
      }
    });
    return out;
  }

  // ── cloud HTTP ───────────────────────────────────────────────────
  async function api(method, path, body, token) {
    const r = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => { throw { code: "offline" }; });
    if (r.status === 204) return {};
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: (data.error && data.error.code) || `http_${r.status}`, message: (data.error && data.error.message) || "" };
    return data;
  }
  const errText = (e) => T.errors[e.code] || e.message || e.code || String(e);

  // ── sign in view ─────────────────────────────────────────────────
  function renderSignIn() {
    let identifier = LS.getItem("nm.identifier") || "", sent = false, busy = false, msg = "", bad = false;
    const draw = () => {
      app.replaceChildren(h("div", { class: "signin" }, h("div", { class: "card" },
        h("img", { src: "mark.svg", alt: "" }),
        h("h1", {}, "nanoMuse"),
        h("p", { class: "sub" }, T.tagline),
        h("div", { class: "field" }, h("label", {}, T.identifier),
          h("input", { id: "ident", type: "text", autocomplete: "username", value: identifier, disabled: sent ? "" : null, oninput: (e) => { identifier = e.target.value; } })),
        sent ? h("div", { class: "field" }, h("label", {}, T.code),
          h("input", { id: "code", type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", onkeydown: (e) => { if (e.key === "Enter") verify(); } })) : null,
        h("button", { class: "btn", disabled: busy ? "" : null, onclick: sent ? verify : send }, sent ? T.signIn : T.sendCode),
        sent ? h("button", { class: "btn ghost", onclick: () => { sent = false; msg = ""; draw(); } }, T.another) : null,
        h("div", { class: "hint" + (bad ? " bad" : "") }, msg),
        h("p", { class: "fine" }, T.fine, h("br"), `${T.relay}: ${base}`),
      )));
      const focus = document.getElementById(sent ? "code" : "ident");
      if (focus) focus.focus();
    };
    async function send() {
      identifier = identifier.trim(); if (!identifier) return;
      busy = true; msg = ""; bad = false; draw();
      try { await api("POST", "/v1/auth/code", { identifier }); LS.setItem("nm.identifier", identifier); sent = true; msg = T.codeSent; }
      catch (e) { msg = errText(e); bad = true; }
      busy = false; draw();
    }
    async function verify() {
      const code = (document.getElementById("code") || {}).value || "";
      if (code.replace(/\D/g, "").length !== 6) return;
      busy = true; draw();
      try {
        const r = await api("POST", "/v1/auth/verify", { identifier, code: code.replace(/\D/g, ""), device: `Web console · ${navigator.platform || "browser"}` });
        key = r.api_key; hint = (r.account && r.account.hint) || identifier;
        LS.setItem("nm.key", key); LS.setItem("nm.hint", hint);
        renderMain(); connect();
        return;
      } catch (e) { msg = errText(e); bad = true; }
      busy = false; draw();
    }
    draw();
  }

  // ── hub socket ───────────────────────────────────────────────────
  function connect() {
    if (!key) return;
    if (ws) { try { ws.onclose = null; ws.close(); } catch (_) { /* ignore */ } }
    wsState = "connecting"; drawStatus();
    const url = base.replace(/^http/, "ws") + "/v1/hub";
    ws = new WebSocket(url);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", key, device: { id: webId, name: zh ? "网页" : "Web console", kind: "web", os: navigator.platform || "browser", version: "0.1.17", actions: [] } }));
    };
    ws.onmessage = (ev) => {
      let f; try { f = JSON.parse(ev.data); } catch (_) { return; }
      if (f.type === "welcome") { wsState = "on"; backoff = 1000; devices = f.devices || []; drawAll(); }
      else if (f.type === "devices") { devices = f.devices || []; drawSide(); drawHead(); }
      else if (f.type === "error" && !f.id) {
        if (f.code === "bad_key") { signOut(true); }
        else console.warn("hub:", f.code, f.message);
      } else if (f.id && pending.has(f.id)) {
        const p = pending.get(f.id);
        if (f.type === "event") p.onEvent(f.body || {});
        else if (f.type === "result") { pending.delete(f.id); f.ok ? p.resolve(f.body || {}) : p.reject({ code: f.error || "failed", message: f.message || "" }); }
        else if (f.type === "error") { pending.delete(f.id); p.reject({ code: f.code, message: f.message }); }
      }
    };
    ws.onclose = (ev) => {
      wsState = "off"; drawStatus();
      for (const [id, p] of pending) { p.reject({ code: "disconnected", message: "" }); pending.delete(id); }
      if (ev.code === 4001) { signOut(true); return; }
      setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000);
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  function call(to, action, args, onEvent) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) { reject({ code: "disconnected" }); return; }
      const id = Math.random().toString(36).slice(2, 14);
      pending.set(id, { onEvent: onEvent || (() => {}), resolve, reject });
      ws.send(JSON.stringify({ type: "call", id, to, action, args: args || {} }));
    });
  }
  function signOut(expired) {
    if (!expired && key) api("POST", "/v1/auth/sign-out", {}, key).catch(() => {});
    key = ""; hint = ""; LS.removeItem("nm.key"); LS.removeItem("nm.hint");
    if (ws) { try { ws.onclose = null; ws.close(); } catch (_) { /* ignore */ } ws = null; }
    renderSignIn();
  }

  // ── chats ────────────────────────────────────────────────────────
  function chat(id) {
    if (!chats.has(id)) {
      let messages = [];
      try { messages = JSON.parse(LS.getItem("nm.chat." + id) || "[]"); } catch (_) { /* fresh */ }
      chats.set(id, { messages, busy: false, callId: null, steps: [] });
    }
    return chats.get(id);
  }
  function persist(id) {
    const c = chat(id);
    const keep = c.messages.slice(-60).map((m) => (m.image && m.image.length > 400000 ? { ...m, image: null } : m));
    try { LS.setItem("nm.chat." + id, JSON.stringify(keep)); } catch (_) { /* quota */ }
  }
  function convId(deviceId) {
    let c = LS.getItem("nm.conv." + deviceId);
    if (!c) { c = "web-" + Math.random().toString(36).slice(2, 12); LS.setItem("nm.conv." + deviceId, c); }
    return c;
  }
  const dev = (id) => devices.find((d) => d.id === id);
  const kindLabel = (k) => T[k] || k;
  function ago(ts) {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 90) return T.justNow; if (s < 3600) return T.minAgo(Math.floor(s / 60)); if (s < 86400) return T.hAgo(Math.floor(s / 3600)); return T.dAgo(Math.floor(s / 86400));
  }

  async function send(text) {
    const d = dev(selected); if (!d || !d.online) return;
    const c = chat(d.id);
    if (c.busy) return;
    c.messages.push({ role: "me", text }); c.busy = true; c.steps = []; persist(d.id); drawChat(); drawComposer();
    const conversation = convId(d.id);
    const onEvent = (b) => {
      const stage = b.stage;
      if (stage === "thinking") c.steps.push({ kind: "thinking" });
      else if (stage === "tool") c.steps.push({ kind: "tool", k: T.running, v: `${b.name} ${b.summary || ""}` });
      else if (stage === "delegate") c.steps.push({ kind: "tool", k: T.asks, v: `${b.device}: ${b.task}` });
      else if (stage === "remote") { const bb = b.body || {}; if (bb.stage === "tool") c.steps.push({ kind: "remote", k: `${b.device} ${T.running}`, v: `${bb.name} ${bb.summary || ""}` }); }
      else if (stage === "text" && b.interim) c.messages.push({ role: "them", text: b.text, from: d.name });
      else if (stage === "image" && b.data) c.messages.push({ role: "them", image: `data:${b.mime || "image/png"};base64,${b.data}`, from: b.from || d.name });
      else if (stage === "approval") c.messages.push({ role: "approval", id: b.approval_id, preview: b.preview, risk: b.risk, reason: b.reason, state: "open" });
      else if (stage === "error") c.steps.push({ kind: "err", k: "!", v: b.message || b.code });
      else if (stage === "done") c.steps = c.steps.filter((s) => s.kind !== "thinking");
      drawChat();
    };
    try {
      const r = await call(d.id, "task", { text, conversation, from: zh ? "网页" : "web console" }, onEvent);
      c.messages.push({ role: "them", text: r.text || r.answer || JSON.stringify(r), from: d.name });
    } catch (e) {
      const m = e.code === "device_offline" ? T.errorOffline : e.code === "busy" ? T.errorBusy : e.code === "timeout" ? T.errorTimeout : (e.message || e.code);
      c.messages.push({ role: "them", text: `⚠ ${m}`, from: d.name });
    }
    c.busy = false; c.steps = []; for (const m of c.messages) if (m.role === "approval" && m.state === "open") m.state = "expired";
    persist(d.id); drawChat(); drawComposer();
  }
  async function decide(deviceId, approvalId, allow) {
    const c = chat(deviceId); const a = c.messages.find((m) => m.role === "approval" && m.id === approvalId); if (!a || a.state !== "open") return;
    a.state = allow ? "allowed" : "denied"; persist(deviceId); drawChat();
    try { await call(deviceId, "approve", { approval_id: approvalId, allow }); } catch (_) { /* the task reports it */ }
  }
  async function stop() {
    const d = dev(selected); if (!d) return;
    try { await call(d.id, "stop", { conversation: convId(d.id) }); } catch (_) { /* ignore */ }
  }

  // ── main view ────────────────────────────────────────────────────
  let els = {};
  function renderMain() {
    els = {};
    els.side = h("aside", { class: "side" });
    els.chat = h("section", { class: "chat" });
    app.replaceChildren(h("div", { class: "main" }, els.side, els.chat));
    drawAll();
  }
  function drawAll() { drawSide(); drawChatShell(); }
  function drawStatus() { const s = els.status; if (s) { s.className = "status " + (wsState === "on" ? "on" : wsState === "off" ? "off" : ""); s.title = wsState === "on" ? T.connected : wsState === "off" ? T.disconnected : T.connecting; } }
  const glyph = (kind) => kind === "phone"
    ? '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>'
    : '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 17v3.5"/></svg>';
  function drawSide() {
    if (!els.side) return;
    const others = devices.filter((d) => d.kind !== "web");
    els.status = h("span", { class: "status" });
    els.side.replaceChildren(
      h("div", { class: "top" }, h("img", { src: "mark.svg", alt: "" }), h("b", {}, "nanoMuse"), els.status),
      h("h2", {}, T.devices),
      h("ul", { class: "devices" },
        others.length ? others.map((d) => h("li", { class: d.id === selected ? "active" : "", onclick: () => { selected = d.id; LS.setItem("nm.selected", d.id); history.replaceState(null, "", "?device=" + encodeURIComponent(d.id)); drawSide(); drawChatShell(); } },
          h("span", { class: "glyph", html: glyph(d.kind) }),
          h("div", { class: "txt" }, h("div", { class: "name" }, d.name), h("div", { class: "meta" }, `${kindLabel(d.kind)} · ${d.os || ""} · ${d.online ? T.online : `${T.lastSeen} ${ago(d.last_seen)}`}`)),
          h("span", { class: "dot" + (d.online ? " on" : "") }),
        )) : h("li", { class: "empty" }, T.noDevices)),
      h("div", { class: "foot" }, h("span", { class: "who" }, hint), h("button", { onclick: () => signOut(false) }, T.signOut)),
    );
    drawStatus();
  }
  function drawChatShell() {
    if (!els.chat) return;
    const d = dev(selected);
    if (!d) {
      els.chat.replaceChildren(h("div", { class: "empty-chat" }, h("img", { src: "mark.svg", alt: "" }), h("p", {}, h("b", {}, T.pick)), h("p", {}, T.pickSub)));
      return;
    }
    els.head = h("div", { class: "head" });
    els.messages = h("div", { class: "messages" });
    els.composer = h("div", { class: "composer" });
    els.chat.replaceChildren(els.head, els.messages, els.composer);
    drawHead(); drawChat(); drawComposer();
  }
  function drawHead() {
    const d = dev(selected); if (!els.head || !d) return;
    els.head.replaceChildren(
      h("span", { class: "glyph", html: glyph(d.kind), style: "width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(1,92,251,.1);color:var(--blue)" }),
      h("div", {}, h("div", { class: "name" }, d.name), h("div", { class: "sub" }, `${kindLabel(d.kind)} · ${d.os || ""} · ${d.online ? T.online : T.offline}`)),
      h("span", { class: "spacer" }),
      h("button", { onclick: () => { const c = chat(d.id); c.messages = []; persist(d.id); LS.removeItem("nm.conv." + d.id); drawChat(); } }, T.clear),
    );
    const g = els.head.querySelector(".glyph svg"); if (g) { g.style.width = "18px"; g.style.height = "18px"; g.style.fill = "none"; g.style.stroke = "currentColor"; g.style.strokeWidth = "1.8"; }
    drawComposer();
  }
  function drawChat() {
    const d = dev(selected); if (!els.messages || !d) return;
    const c = chat(d.id);
    const nodes = [];
    for (const m of c.messages) {
      if (m.role === "me") nodes.push(h("div", { class: "msg me" }, h("div", { class: "bubble" }, m.text)));
      else if (m.role === "approval") nodes.push(h("div", { class: "approval" + (m.state !== "open" ? " done" : "") },
        h("div", { class: "t" }, T.approvalTitle(d.name)),
        h("div", { class: "p" }, (T.risks[m.risk] || m.risk) + (m.reason ? ` · ${m.reason}` : ""), h("code", {}, m.preview || "")),
        m.state === "open"
          ? h("div", { class: "btns" }, h("button", { class: "yes", onclick: () => decide(d.id, m.id, true) }, T.allow), h("button", { onclick: () => decide(d.id, m.id, false) }, T.deny))
          : h("div", { class: "decided" }, m.state === "allowed" ? T.allowed : m.state === "denied" ? T.denied : T.expired)));
      else nodes.push(h("div", { class: "msg them" }, h("div", { class: "from" }, m.from || d.name),
        m.image ? h("div", { class: "bubble" }, h("img", { class: "shot", src: m.image, alt: "" })) : h("div", { class: "bubble", html: md(m.text || "") })));
    }
    if (c.busy) {
      const steps = c.steps.slice(-8);
      nodes.push(h("div", { class: "steps" },
        steps.filter((s) => s.kind !== "thinking").map((s) => h("div", { class: "step " + s.kind }, h("span", { class: "k" }, s.k), h("span", { class: "v", title: s.v }, s.v))),
        h("div", { class: "thinking" }, h("i"), d.kind === "phone" && !steps.length ? T.waitingPhone : T.busy(d.name))));
    }
    els.messages.replaceChildren(...nodes);
    els.messages.scrollTop = els.messages.scrollHeight;
  }
  function drawComposer() {
    const d = dev(selected); if (!els.composer || !d) return;
    const c = chat(d.id);
    const ta = h("textarea", { rows: "1", placeholder: T.placeholder(d.name), disabled: d.online ? null : "", onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } }, oninput: (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; } });
    const go = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; ta.style.height = "auto"; send(t); };
    els.composer.replaceChildren(
      h("div", { class: "box" }, ta,
        c.busy ? h("button", { class: "stop", title: T.stop, onclick: stop, html: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="#fff"/></svg>' })
          : h("button", { disabled: d.online ? null : "", onclick: go, html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' })),
      h("div", { class: "note" }, d.online ? (d.kind === "phone" ? (zh ? "手机上需要确认的操作，会在手机上弹出确认卡。" : "Anything that needs an OK on the phone is asked on the phone.") : (zh ? "需要确认的操作会在这里弹出确认卡。" : "Anything that needs an OK is asked here.")) : T.offlineNote(d.name)),
    );
    if (d.online && !c.busy) ta.focus();
  }

  // ── boot ─────────────────────────────────────────────────────────
  if (key) { renderMain(); connect(); } else renderSignIn();
})();
