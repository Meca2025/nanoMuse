/* Sign in with the phone's own number — the page an app opens in a WebView (onetap.py has
   the whole flow). It asks the relay for the carrier SDK's tokens, loads that SDK from the
   URL the relay names (nothing of it ships here), lets the carrier's dialog confirm the
   number, hands the carrier's token back to the relay and tells the app it is done:
   nanomuse://onetap/done (the app then claims the key with its verifier) or
   nanomuse://onetap/cancel (back to the code). The page never sees the key. */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const state = (params.get("state") || "").toLowerCase();
  const device = params.get("device") || "";
  const invite = params.get("invite") || "";
  const inApp = params.get("app") === "1";
  const zh = (params.get("lang") || navigator.language || "").toLowerCase().startsWith("zh");
  const T = zh
    ? {
        title: "本机号码登录",
        preparing: "正在联系运营商…",
        ready: "请在弹出的页面里确认号码。",
        verifying: "正在登录…",
        done: (hint) => `已登录 ${hint}`,
        wifi: "一键登录要用手机流量：请先关掉 Wi‑Fi、开着流量，再重试。",
        noSim: "这台手机里没有检测到 SIM 卡。",
        unavailable: "运营商暂时确认不了这台手机的号码。",
        needData: "只在开着手机流量、关掉 Wi‑Fi 时可用；换个方式也只多两步。",
        noState: "请在 nanoMuse App 里打开这个页面。",
        retry: "重试",
        useCode: "改用验证码登录",
        back: "返回 App",
        other: "换个方式登录",
        btn: "本机号码登录",
        privacy: "nanoMuse 隐私说明",
        failed: (code) => `没成功${code ? `（${code}）` : ""}。`,
      }
    : {
        title: "Sign in with this phone's number",
        preparing: "Reaching the carrier…",
        ready: "Confirm the number in the carrier's dialog.",
        verifying: "Signing in…",
        done: (hint) => `Signed in as ${hint}`,
        wifi: "This needs mobile data: turn Wi‑Fi off, keep mobile data on, then try again.",
        noSim: "No SIM card was found in this phone.",
        unavailable: "The carrier cannot confirm this phone's number right now.",
        needData: "Works with mobile data on and Wi‑Fi off; the code is two more steps.",
        noState: "Open this page from the nanoMuse app.",
        retry: "Try again",
        useCode: "Use a code instead",
        back: "Back to the app",
        other: "Sign in another way",
        btn: "Sign in with this number",
        privacy: "nanoMuse privacy notes",
        failed: (code) => `That did not work${code ? ` (${code})` : ""}.`,
      };

  const app = document.getElementById("app");
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) el.append(kid);
    return el;
  };

  function leave(result) {
    // The app's WebView intercepts these; a plain browser stays on the page.
    if (inApp) location.href = "nanomuse://onetap/" + result;
  }
  window.nmOneTapCancel = () => leave("cancel");

  function draw(status, kind, actions, hint) {
    app.replaceChildren(
      h("div", { class: "card rise" },
        h("div", { class: "disc" }, h("img", { src: "mark.svg", alt: "" })),
        h("h1", {}, T.title),
        kind === "busy" ? h("div", { class: "spin" }) : null,
        h("p", { class: "status " + (kind === "ok" ? "ok" : kind === "bad" ? "bad" : "") }, status),
        hint ? h("p", { class: "hint" }, hint) : null,
        h("div", { class: "actions" }, ...(actions || []))),
    );
  }

  const retryBtn = () => h("button", { class: "btn", onclick: start }, T.retry);
  const codeBtn = () => (inApp ? h("button", { class: "btn quiet", onclick: () => leave("cancel") }, T.useCode) : null);

  async function post(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) {
      const err = (data && data.error) || {};
      throw Object.assign(new Error(err.message || r.statusText), { code: err.code || String(r.status), aliyun: err.aliyun });
    }
    return data;
  }

  let sdkLoaded = null;
  function loadSdk(url) {
    if (window.PhoneNumberServer) return Promise.resolve();
    if (sdkLoaded) return sdkLoaded;
    sdkLoaded = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => (window.PhoneNumberServer ? resolve() : reject(new Error("sdk")));
      s.onerror = () => reject(new Error("sdk"));
      document.head.append(s);
    });
    return sdkLoaded;
  }

  async function start() {
    if (state.length !== 64) {
      draw(T.noState, "bad", []);
      return;
    }
    draw(T.preparing, "busy", []);
    let tok;
    try {
      tok = await post("/v1/auth/onetap/token", {});
      await loadSdk(tok.sdk_url);
    } catch (e) {
      draw(T.unavailable, "bad", [retryBtn(), codeBtn()], T.needData);
      return;
    }
    const server = new window.PhoneNumberServer();
    const net = typeof server.getConnection === "function" ? server.getConnection() : "unknown";
    if (net === "wifi") {
      draw(T.wifi, "bad", [retryBtn(), codeBtn()]);
      return;
    }
    server.checkLoginAvailable({
      accessToken: tok.access_token,
      jwtToken: tok.jwt_token,
      success: (res) => {
        if (res && res.code != null && String(res.code) !== "600000") return fail(res.code);
        draw(T.ready, "", [codeBtn()]);
        server.getLoginToken({
          success: (res) => finish(res && res.spToken),
          error: (res) => fail(res && res.code),
          watch: () => {},
          authPageOption: {
            navText: T.title,
            btnText: T.btn,
            isDialog: true,
            manualClose: false,
            privacyOne: [T.privacy, "https://github.com/nano-muse/nanoMuse/blob/main/docs/privacy.md"],
            showCustomView: true,
            customView: {
              element: '<div class="nm-other" onclick="window.nmOneTapCancel()">' + T.other + "</div>",
              style: ".nm-other{margin:14px 0 4px;text-align:center;color:#0a66e4;font-size:14px}",
              js: "",
            },
          },
        });
      },
      error: (res) => fail(res && res.code),
    });
  }

  // The SDK's codes that mean "not on mobile data" (600008 data off, 600011 token refused
  // with Wi‑Fi on, 600012 prefetch failed, 4100xx the carrier could not use the data path)
  // get the one sentence that helps; 600007 is no SIM; the rest show their number.
  function fail(code) {
    const c = String(code == null ? "" : code);
    const text = ["600008", "600011", "600012", "410003", "410004"].includes(c) ? T.wifi : c === "600007" ? T.noSim : T.failed(c);
    draw(text, "bad", [retryBtn(), codeBtn()], T.needData);
  }

  async function finish(spToken) {
    if (!spToken) {
      draw(T.failed(""), "bad", [retryBtn(), codeBtn()]);
      return;
    }
    draw(T.verifying, "busy", []);
    try {
      const out = await post("/v1/auth/onetap/verify", { state, sp_token: spToken, device, invite });
      draw(T.done(out.hint || ""), "ok", inApp ? [h("button", { class: "btn", onclick: () => leave("done") }, T.back)] : []);
      setTimeout(() => leave("done"), 500);
    } catch (e) {
      draw(T.failed(e.aliyun || e.code), "bad", [retryBtn(), codeBtn()], T.needData);
    }
  }

  start();
})();
