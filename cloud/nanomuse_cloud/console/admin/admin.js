/* nanoMuse Cloud — the operator's page. Static, no build step: the admin
   token (X-Admin-Token) is asked for once and kept in sessionStorage, so it
   is gone when the tab closes. Everything comes from /v1/admin/*. */
(() => {
  "use strict";

  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const T = zh ? {
    title: "nanoMuse Cloud 后台", tokenLabel: "管理口令", tokenHint: "服务器上 /opt/nanomuse/relay/ADMIN_TOKEN.txt 里的那一行；只留在这个标签页里。",
    enter: "进入", wrong: "口令不对。", offline: "连不上服务器。", refresh: "刷新", lock: "锁定",
    accounts: "账号", noAccounts: "还没有人登录过。", usage: "最近 14 天用量（按 UTC 日）", settings: "当前配置",
    kpiAccounts: "账号", kpiToday: "今天用掉", kpiTotal: "累计用掉", kpiOnline: "在线设备", kpiRequests: "累计请求", kpiKnown: (n) => `共记住 ${n} 台`,
    tokens: "tokens", unlimited: "不限额度", limited: (n) => `每人 ${fmt(n)}`, daily: (n) => (n > 0 ? `每天 ${fmt(n)}` : "不限每日"),
    thIdentifier: "手机号 / 邮箱", thCreated: "注册", thUsed: "已用 / 今天", thGrant: "额度", thActive: "最近活跃", thDevices: "设备", thActions: "操作",
    never: "从未", phone: "手机", email: "邮箱", disabled: "已禁用", unknown: "（旧账号，无明文）",
    grant: "加额度", grantPrompt: (who) => `给 ${who} 加多少 tokens？负数扣减。`, disable: "禁用", enable: "恢复",
    disableConfirm: (who) => `禁用 ${who}？TA 的所有设备会立刻断开，再登录会被拒。`, remove: "删除",
    removeConfirm: (who) => `删除 ${who} 的账号、密钥、用量记录和设备？不可恢复。`,
    keys: (n) => `${n} 个登录`, none: "—", allowed: "白名单", allowedNone: "（空 = 任何人都能登录）", sender: "验证码渠道", models: "模型",
    perMinute: (n) => (n > 0 ? `每分钟 ${n} 次` : "不限频"), version: "版本",
    foot: "识别信息只在这个页面用管理口令解出来看；数据库里存的是加密后的值。请不要把这个页面截图发出去。",
    chat: "对话", image: "图片", video: "视频", requests: "次",
  } : {
    title: "nanoMuse Cloud admin", tokenLabel: "Admin token", tokenHint: "The line in /opt/nanomuse/relay/ADMIN_TOKEN.txt on the server; it stays in this tab only.",
    enter: "Open", wrong: "That token is not right.", offline: "Cannot reach the server.", refresh: "Refresh", lock: "Lock",
    accounts: "Accounts", noAccounts: "Nobody has signed in yet.", usage: "Last 14 days (UTC days)", settings: "Configuration",
    kpiAccounts: "accounts", kpiToday: "spent today", kpiTotal: "spent in all", kpiOnline: "devices online", kpiRequests: "requests in all", kpiKnown: (n) => `${n} remembered`,
    tokens: "tokens", unlimited: "no ceiling", limited: (n) => `${fmt(n)} each`, daily: (n) => (n > 0 ? `${fmt(n)} a day` : "no daily cap"),
    thIdentifier: "Phone / e-mail", thCreated: "Joined", thUsed: "Used / today", thGrant: "Grant", thActive: "Last active", thDevices: "Devices", thActions: "",
    never: "never", phone: "phone", email: "e-mail", disabled: "disabled", unknown: "(older account, no plaintext)",
    grant: "Grant", grantPrompt: (who) => `How many tokens for ${who}? Negative takes away.`, disable: "Disable", enable: "Enable",
    disableConfirm: (who) => `Disable ${who}? Every device of theirs drops at once and cannot sign in again.`, remove: "Delete",
    removeConfirm: (who) => `Delete the account, keys, usage and devices of ${who}? This cannot be undone.`,
    keys: (n) => `${n} sign-in${n === 1 ? "" : "s"}`, none: "—", allowed: "Allow list", allowedNone: "(empty = anyone may sign in)", sender: "Code sender", models: "Models",
    perMinute: (n) => (n > 0 ? `${n} a minute` : "no rate limit"), version: "Version",
    foot: "Identifiers are decrypted for this page only, with the admin token; the database holds ciphertext. Do not share screenshots of this page.",
    chat: "chat", image: "image", video: "video", requests: "req",
  };

  function fmt(n) { return Number(n || 0).toLocaleString(zh ? "zh-CN" : "en-US"); }
  function short(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  }
  function when(ts) {
    if (!ts) return T.never;
    const d = new Date(ts * 1000);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 90) return zh ? "刚刚" : "just now";
    if (diff < 3600) return zh ? `${Math.floor(diff / 60)} 分钟前` : `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return zh ? `${Math.floor(diff / 3600)} 小时前` : `${Math.floor(diff / 3600)} h ago`;
    return d.toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function day(ts) { return new Date(ts * 1000).toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", timeZone: "UTC" }); }

  const SS = window.sessionStorage;
  let token = SS.getItem("nm.admin") || "";
  let data = null, usage = null, err = "";

  const app = document.getElementById("app");
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, headers: { "X-Admin-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { token = ""; SS.removeItem("nm.admin"); err = T.wrong; draw(); throw new Error("admin"); }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
    return j;
  }

  async function load() {
    try {
      [data, usage] = await Promise.all([api("GET", "/v1/admin/accounts"), api("GET", "/v1/admin/usage?days=14")]);
      err = "";
    } catch (e) {
      if (e.message !== "admin") err = T.offline + " " + e.message;
    }
    draw();
  }

  // ── views ───────────────────────────────────────────────────────
  function drawGate() {
    const input = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: "…" });
    const go = async () => { token = input.value.trim(); if (!token) return; SS.setItem("nm.admin", token); err = ""; await load(); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    app.replaceChildren(h("div", { class: "signin admin" },
      h("div", { class: "card" },
        h("img", { src: "../mark.svg", alt: "" }),
        h("h1", {}, T.title),
        h("div", { class: "field" }, h("label", {}, T.tokenLabel), input),
        h("button", { class: "btn", onclick: go }, T.enter),
        h("div", { class: "hint" + (err ? " bad" : "") }, err || T.tokenHint),
      )));
    input.focus();
  }

  function who(a) { return a.identifier || a.hint || a.id.slice(0, 8); }

  async function doGrant(a) {
    const v = prompt(T.grantPrompt(who(a)), "1000000");
    if (v === null) return;
    const n = parseInt(v.replace(/[\s,_]/g, ""), 10);
    if (!Number.isFinite(n) || n === 0) return;
    try { await api("POST", "/v1/admin/grant", { account_id: a.id, tokens: n }); } catch (e) { alert(e.message); }
    await load();
  }
  async function doDisable(a) {
    if (!a.disabled && !confirm(T.disableConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/disable", { account_id: a.id, disabled: !a.disabled }); } catch (e) { alert(e.message); }
    await load();
  }
  async function doDelete(a) {
    if (!confirm(T.removeConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/delete", { account_id: a.id }); } catch (e) { alert(e.message); }
    await load();
  }

  function drawMain() {
    const s = data.settings || {};
    const accounts = data.accounts || [];
    const today = accounts.reduce((n, a) => n + (a.used_today || 0), 0);
    const total = accounts.reduce((n, a) => n + (a.used || 0), 0);
    const reqs = accounts.reduce((n, a) => n + (a.requests || 0), 0);
    const online = accounts.reduce((n, a) => n + (a.devices || []).filter((d) => d.online).length, 0);
    const known = accounts.reduce((n, a) => n + (a.devices || []).length, 0);

    const rows = accounts.map((a) => h("tr", {},
      h("td", {}, h("div", { class: "id" },
        a.identifier || h("span", { style: "color:var(--ink-3);font-weight:400" }, a.hint + " " + T.unknown),
        h("small", {},
          h("span", { class: "tag" }, a.channel === "phone" ? T.phone : T.email),
          a.disabled ? h("span", { class: "tag off" }, T.disabled) : null,
          T.keys(a.live_keys || 0)))),
      h("td", { class: "hide-sm" }, when(a.created_at)),
      h("td", { class: "num" }, fmt(a.used), h("br"), h("span", { style: "color:var(--ink-3)" }, fmt(a.used_today))),
      h("td", { class: "num hide-sm" }, s.unlimited ? T.unlimited : fmt(a.granted)),
      h("td", { class: "hide-sm" }, when(a.last_active_at)),
      h("td", {}, (a.devices || []).length ? h("div", { class: "dev" }, ...(a.devices || []).map((d) =>
        h("span", { title: (d.os || "") + " · " + when(d.last_seen) }, h("i", { class: "dot" + (d.online ? " on" : "") }), d.name || d.id))) : T.none),
      h("td", {}, h("div", { class: "acts" },
        s.unlimited ? null : h("button", { onclick: () => doGrant(a) }, T.grant),
        h("button", { onclick: () => doDisable(a) }, a.disabled ? T.enable : T.disable),
        h("button", { class: "danger", onclick: () => doDelete(a) }, T.remove))),
    ));

    // usage by day: one column per UTC day, stacked kinds folded into a total with a tooltip
    const byDay = new Map();
    for (const r of (usage && usage.days) || []) {
      const d = byDay.get(r.day) || { day: r.day, total: 0, parts: [] };
      d.total += r.charged || 0; d.parts.push(`${T[r.kind] || r.kind} ${fmt(r.charged)} (${r.requests} ${T.requests})`);
      byDay.set(r.day, d);
    }
    const days = [];
    const start = Math.floor(Date.now() / 1000 / 86400) * 86400 - 13 * 86400;
    for (let i = 0; i < 14; i++) { const k = start + i * 86400; days.push(byDay.get(k) || { day: k, total: 0, parts: [] }); }
    const max = Math.max(1, ...days.map((d) => d.total));

    app.replaceChildren(h("div", { class: "admin" },
      h("div", { class: "bar" },
        h("img", { src: "../mark.svg", alt: "" }),
        h("h1", {}, T.title, h("small", {}, location.host)),
        h("button", { onclick: load }, T.refresh),
        h("button", { onclick: () => { token = ""; SS.removeItem("nm.admin"); data = null; draw(); } }, T.lock)),
      err ? h("div", { class: "hint bad", style: "margin:0 0 14px" }, err) : null,
      h("div", { class: "cards" },
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiAccounts), h("div", { class: "v" }, accounts.length), h("div", { class: "s" }, (s.unlimited ? T.unlimited : T.limited(s.signup_tokens)) + " · " + T.daily(s.daily_cap_tokens))),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiToday), h("div", { class: "v" }, short(today)), h("div", { class: "s" }, fmt(today) + " " + T.tokens)),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiTotal), h("div", { class: "v" }, short(total)), h("div", { class: "s" }, fmt(total) + " " + T.tokens)),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiRequests), h("div", { class: "v" }, fmt(reqs)), h("div", { class: "s" }, T.perMinute(s.per_minute_requests))),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiOnline), h("div", { class: "v" }, online), h("div", { class: "s" }, T.kpiKnown(known)))),
      h("div", { class: "panel" },
        h("h2", {}, T.accounts, h("span", { class: "sp" })),
        accounts.length ? h("table", {},
          h("thead", {}, h("tr", {},
            h("th", {}, T.thIdentifier), h("th", { class: "hide-sm" }, T.thCreated), h("th", { class: "num" }, T.thUsed),
            h("th", { class: "num hide-sm" }, T.thGrant), h("th", { class: "hide-sm" }, T.thActive), h("th", {}, T.thDevices), h("th", {}, T.thActions))),
          h("tbody", {}, ...rows)) : h("div", { class: "empty" }, T.noAccounts)),
      h("div", { class: "panel" },
        h("h2", {}, T.usage),
        h("div", { class: "days" }, ...days.map((d) => h("div", { class: "col", title: d.parts.join("\n") || fmt(0) },
          h("div", { class: "barv", style: `height:${Math.max(2, Math.round(80 * d.total / max))}px` }),
          h("div", { class: "lbl" }, day(d.day)))))),
      h("div", { class: "panel" },
        h("h2", {}, T.settings),
        h("div", { class: "kv" },
          h("b", {}, T.allowed), h("code", {}, (s.allowed_identifiers || []).join(", ") || T.allowedNone),
          h("b", {}, T.sender), h("span", {}, s.sender || "log"),
          h("b", {}, T.models), h("span", {}, (s.models || []).join(" · ")),
          h("b", {}, T.version), h("span", {}, s.version || ""))),
      h("p", { class: "foot" }, T.foot),
    ));
  }

  function draw() {
    if (!token || !data) drawGate(); else drawMain();
  }

  document.title = T.title;
  if (token) load(); else draw();
})();
