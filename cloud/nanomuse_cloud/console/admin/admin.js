/* nanoMuse Cloud — the operator's page. Static, no build step: the admin
   token (X-Admin-Token) is asked for once and kept in sessionStorage, so it
   is gone when the tab closes. Everything comes from /v1/admin/*. */
(() => {
  "use strict";

  const zh = (navigator.language || "").toLowerCase().startsWith("zh");
  const T = zh ? {
    title: "nanoMuse Cloud 后台", tokenLabel: "管理口令", tokenHint: "服务器上 /opt/nanomuse/relay/ADMIN_TOKEN.txt 里的那一行；只留在这个标签页里。",
    enter: "进入", wrong: "口令不对。", offline: "连不上服务器。", refresh: "刷新", lock: "锁定",
    accounts: "账号", noAccounts: "还没有人登录过。", usage: (h) => `最近 14 天（按 UTC${h >= 0 ? "+" : ""}${h} 的自然日）`, settings: "当前配置",
    kpiAccounts: "账号", kpiToday: "今天花费", kpiTotal: "累计花费", kpiOnline: "在线设备", kpiRequests: "累计请求", kpiKnown: (n) => `共记住 ${n} 台`,
    tokens: "tokens", unlimited: "不限额度", limited: (n) => `每人 ${fmt(n)}`, daily: (n) => (n > 0 ? `每天 ${fmt(n)}` : "不限每日"),
    capCny: (c, u) => (c > 0 ? `非成员每天 ¥${c}（≈ $${u}）` : "不限每日花费"), signupOpen: "开放注册", signupClosed: "仅白名单可登录",
    thIdentifier: "手机号 / 邮箱", thCreated: "注册", thSpent: "花费 累计 / 今天", thUsed: "tokens 累计 / 今天", thGrant: "额度", thActive: "最近活跃", thDevices: "设备", thActions: "操作",
    never: "从未", phone: "手机", email: "邮箱", disabled: "已禁用", unknown: "（旧账号，无明文）", member: "成员 · 不限", listed: "白名单",
    grant: "加额度", grantPrompt: (who) => `给 ${who} 加多少 tokens？负数扣减。`, disable: "禁用", enable: "恢复",
    makeMember: "设为成员", unmakeMember: "取消成员", memberConfirm: (who) => `把 ${who} 设为成员？成员不受每日花费上限限制，费用由你承担。`,
    listedNote: "（在服务器白名单里，改 ALLOWED_IDENTIFIERS 才能取消）",
    disableConfirm: (who) => `禁用 ${who}？TA 的所有设备会立刻断开，再登录会被拒。`, remove: "删除",
    removeConfirm: (who) => `删除 ${who} 的账号、密钥、用量记录和设备？不可恢复。`,
    keys: (n) => `${n} 个登录`, none: "—", allowed: "白名单（不限额）", allowedNone: "（空）", sender: "验证码渠道", models: "模型", prices: "单价（¥）",
    priceLine: (p) => [p.per_m_input || p.per_m_output ? `输入 ${p.per_m_input} / 输出 ${p.per_m_output} 每百万 tokens` : null,
      p.per_image ? `每张 ${p.per_image}${p.per_image_2k ? `（2k ${p.per_image_2k}）` : ""}` : null, p.per_second ? `每秒 ${p.per_second}` : null].filter(Boolean).join("；"),
    rate: "汇率", rateLine: (r) => `1 美元 = ${r} 元（仅用于显示）`,
    perMinute: (n) => (n > 0 ? `每分钟 ${n} 次` : "不限频"), version: "版本",
    foot: "识别信息只在这个页面用管理口令解出来看；数据库里存的是加密后的值。请不要把这个页面截图发出去。金额按模型服务商的北京地区标价估算。",
    chat: "对话", image: "图片", video: "视频", requests: "次",
  } : {
    title: "nanoMuse Cloud admin", tokenLabel: "Admin token", tokenHint: "The line in /opt/nanomuse/relay/ADMIN_TOKEN.txt on the server; it stays in this tab only.",
    enter: "Open", wrong: "That token is not right.", offline: "Cannot reach the server.", refresh: "Refresh", lock: "Lock",
    accounts: "Accounts", noAccounts: "Nobody has signed in yet.", usage: (h) => `Last 14 days (UTC${h >= 0 ? "+" : ""}${h} days)`, settings: "Configuration",
    kpiAccounts: "accounts", kpiToday: "spent today", kpiTotal: "spent in all", kpiOnline: "devices online", kpiRequests: "requests in all", kpiKnown: (n) => `${n} remembered`,
    tokens: "tokens", unlimited: "no ceiling", limited: (n) => `${fmt(n)} each`, daily: (n) => (n > 0 ? `${fmt(n)} a day` : "no daily cap"),
    capCny: (c, u) => (c > 0 ? `¥${c} (≈ $${u}) a day for non-members` : "no daily spend cap"), signupOpen: "sign-up open", signupClosed: "members only",
    thIdentifier: "Phone / e-mail", thCreated: "Joined", thSpent: "Spent all / today", thUsed: "Tokens all / today", thGrant: "Grant", thActive: "Last active", thDevices: "Devices", thActions: "",
    never: "never", phone: "phone", email: "e-mail", disabled: "disabled", unknown: "(older account, no plaintext)", member: "member · no cap", listed: "listed",
    grant: "Grant", grantPrompt: (who) => `How many tokens for ${who}? Negative takes away.`, disable: "Disable", enable: "Enable",
    makeMember: "Make member", unmakeMember: "Unmake member", memberConfirm: (who) => `Make ${who} a member? Members have no daily spend cap; you pay their bill.`,
    listedNote: "(on the server's list; edit ALLOWED_IDENTIFIERS to remove)",
    disableConfirm: (who) => `Disable ${who}? Every device of theirs drops at once and cannot sign in again.`, remove: "Delete",
    removeConfirm: (who) => `Delete the account, keys, usage and devices of ${who}? This cannot be undone.`,
    keys: (n) => `${n} sign-in${n === 1 ? "" : "s"}`, none: "—", allowed: "Members (no cap)", allowedNone: "(none)", sender: "Code sender", models: "Models", prices: "Prices (¥)",
    priceLine: (p) => [p.per_m_input || p.per_m_output ? `${p.per_m_input} in / ${p.per_m_output} out per M tokens` : null,
      p.per_image ? `${p.per_image} a picture${p.per_image_2k ? ` (${p.per_image_2k} at 2k)` : ""}` : null, p.per_second ? `${p.per_second} a second` : null].filter(Boolean).join("; "),
    rate: "Rate", rateLine: (r) => `1 USD = ${r} CNY (display only)`,
    perMinute: (n) => (n > 0 ? `${n} a minute` : "no rate limit"), version: "Version",
    foot: "Identifiers are decrypted for this page only, with the admin token; the database holds ciphertext. Do not share screenshots of this page. Money is estimated at the provider's Beijing list prices.",
    chat: "chat", image: "image", video: "video", requests: "req",
  };
  function money(cny, rate) {
    const c = Number(cny || 0);
    const usd = rate > 0 ? c / rate : 0;
    const f = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(v > 0 && v < 0.01 ? 4 : 2));
    return `¥${f(c)} · $${f(usd)}`;
  }

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
  async function doMember(a) {
    if (!a.unlimited && !confirm(T.memberConfirm(who(a)))) return;
    try { await api("POST", "/v1/admin/unlimited", { account_id: a.id, unlimited: !a.unlimited }); } catch (e) { alert(e.message); }
    await load();
  }

  function drawMain() {
    const s = data.settings || {};
    const rate = Number(s.usd_cny || 0);
    const accounts = data.accounts || [];
    const today = accounts.reduce((n, a) => n + (a.used_today || 0), 0);
    const total = accounts.reduce((n, a) => n + (a.used || 0), 0);
    const spentToday = accounts.reduce((n, a) => n + (a.spent_today_cny || 0), 0);
    const spentTotal = accounts.reduce((n, a) => n + (a.spent_cny || 0), 0);
    const reqs = accounts.reduce((n, a) => n + (a.requests || 0), 0);
    const online = accounts.reduce((n, a) => n + (a.devices || []).filter((d) => d.online).length, 0);
    const known = accounts.reduce((n, a) => n + (a.devices || []).length, 0);

    const rows = accounts.map((a) => h("tr", {},
      h("td", {}, h("div", { class: "id" },
        a.identifier || h("span", { style: "color:var(--ink-3);font-weight:400" }, a.hint + " " + T.unknown),
        h("small", {},
          h("span", { class: "tag" }, a.channel === "phone" ? T.phone : T.email),
          a.member ? h("span", { class: "tag on", title: a.listed ? T.listed : "" }, T.member) : null,
          a.disabled ? h("span", { class: "tag off" }, T.disabled) : null,
          T.keys(a.live_keys || 0)))),
      h("td", { class: "hide-sm" }, when(a.created_at)),
      h("td", { class: "num" }, money(a.spent_cny, rate), h("br"), h("span", { style: "color:var(--ink-3)" }, money(a.spent_today_cny, rate))),
      h("td", { class: "num hide-sm" }, fmt(a.used), h("br"), h("span", { style: "color:var(--ink-3)" }, fmt(a.used_today))),
      h("td", { class: "num hide-sm" }, s.unlimited ? T.unlimited : fmt(a.granted)),
      h("td", { class: "hide-sm" }, when(a.last_active_at)),
      h("td", {}, (a.devices || []).length ? h("div", { class: "dev" }, ...(a.devices || []).map((d) =>
        h("span", { title: (d.os || "") + " · " + when(d.last_seen) }, h("i", { class: "dot" + (d.online ? " on" : "") }), d.name || d.id))) : T.none),
      h("td", {}, h("div", { class: "acts" },
        s.unlimited ? null : h("button", { onclick: () => doGrant(a) }, T.grant),
        a.listed ? h("span", { class: "tag on", title: T.listedNote }, T.listed) : h("button", { onclick: () => doMember(a) }, a.unlimited ? T.unmakeMember : T.makeMember),
        h("button", { onclick: () => doDisable(a) }, a.disabled ? T.enable : T.disable),
        h("button", { class: "danger", onclick: () => doDelete(a) }, T.remove))),
    ));

    // usage by day: one column per local day (the relay's DAY_OFFSET_H), kinds folded into a total with a tooltip
    const offset = Number(s.day_offset_h || 0) * 3600;
    const byDay = new Map();
    for (const r of (usage && usage.days) || []) {
      const d = byDay.get(r.day) || { day: r.day, total: 0, cost: 0, parts: [] };
      d.total += r.charged || 0; d.cost += r.cost_cny || 0;
      d.parts.push(`${T[r.kind] || r.kind} ${money(r.cost_cny, rate)} · ${fmt(r.charged)} ${T.tokens} (${r.requests} ${T.requests})`);
      byDay.set(r.day, d);
    }
    const days = [];
    const nowS = Math.floor(Date.now() / 1000);
    const start = nowS - ((nowS + offset) % 86400) - 13 * 86400;
    for (let i = 0; i < 14; i++) { const k = start + i * 86400; days.push(byDay.get(k) || { day: k, total: 0, cost: 0, parts: [] }); }
    const max = Math.max(0.0001, ...days.map((d) => d.cost));

    app.replaceChildren(h("div", { class: "admin" },
      h("div", { class: "bar" },
        h("img", { src: "../mark.svg", alt: "" }),
        h("h1", {}, T.title, h("small", {}, location.host)),
        h("button", { onclick: load }, T.refresh),
        h("button", { onclick: () => { token = ""; SS.removeItem("nm.admin"); data = null; draw(); } }, T.lock)),
      err ? h("div", { class: "hint bad", style: "margin:0 0 14px" }, err) : null,
      h("div", { class: "cards" },
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiAccounts), h("div", { class: "v" }, accounts.length), h("div", { class: "s" }, (s.signup_open ? T.signupOpen : T.signupClosed) + " · " + T.capCny(s.daily_cap_cny, s.daily_cap_usd))),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiToday), h("div", { class: "v" }, money(spentToday, rate)), h("div", { class: "s" }, fmt(today) + " " + T.tokens)),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiTotal), h("div", { class: "v" }, money(spentTotal, rate)), h("div", { class: "s" }, fmt(total) + " " + T.tokens)),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiRequests), h("div", { class: "v" }, fmt(reqs)), h("div", { class: "s" }, T.perMinute(s.per_minute_requests))),
        h("div", { class: "kpi" }, h("div", { class: "k" }, T.kpiOnline), h("div", { class: "v" }, online), h("div", { class: "s" }, T.kpiKnown(known)))),
      h("div", { class: "panel" },
        h("h2", {}, T.accounts, h("span", { class: "sp" })),
        accounts.length ? h("table", {},
          h("thead", {}, h("tr", {},
            h("th", {}, T.thIdentifier), h("th", { class: "hide-sm" }, T.thCreated), h("th", { class: "num" }, T.thSpent), h("th", { class: "num hide-sm" }, T.thUsed),
            h("th", { class: "num hide-sm" }, T.thGrant), h("th", { class: "hide-sm" }, T.thActive), h("th", {}, T.thDevices), h("th", {}, T.thActions))),
          h("tbody", {}, ...rows)) : h("div", { class: "empty" }, T.noAccounts)),
      h("div", { class: "panel" },
        h("h2", {}, T.usage(Number(s.day_offset_h || 0))),
        h("div", { class: "days" }, ...days.map((d) => h("div", { class: "col", title: d.parts.join("\n") || money(0, rate) },
          h("div", { class: "barv", style: `height:${Math.max(2, Math.round(80 * d.cost / max))}px` }),
          h("div", { class: "lbl" }, day(d.day)))))),
      h("div", { class: "panel" },
        h("h2", {}, T.settings),
        h("div", { class: "kv" },
          h("b", {}, T.allowed), h("code", {}, (s.allowed_identifiers || []).join(", ") || T.allowedNone),
          h("b", {}, T.rate), h("span", {}, T.rateLine(rate)),
          h("b", {}, T.prices), h("span", {}, ...Object.entries(s.prices || {}).map(([id, p]) => h("div", {}, h("code", {}, id), " ", T.priceLine(p)))),
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
