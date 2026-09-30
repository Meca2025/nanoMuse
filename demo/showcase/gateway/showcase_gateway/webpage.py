"""The sign-in page of nanoMuse Web (``/web/``), one file, in both languages.

Two steps: an e-mail address, then the six-digit code nanoMuse Cloud sends (and, the first
time, a friend's invite code if there is one — ``?invite=`` in the address fills it in). On
success the browser goes to the account's own Muse at ``<slug>.<SESSION_DOMAIN>``. The page
is served by the gateway itself so that it has no build step and no assets to keep in step.
"""

from __future__ import annotations

PAGE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>nanoMuse Web</title>
<meta name="description" content="nanoMuse in the browser — sign in with an e-mail, no download. Free, open source, non-profit.">
<link rel="icon" href="https://nanomuse.cn/assets/icon-512.png">
<style>
:root{--bg:#F3F3F5;--card:#fff;--ink:#1C1B22;--muted:#6E6B7A;--line:#E4E3EA;--accent:#5B4EE6;--accent-ink:#fff;--warn:#B23B3B}
@media (prefers-color-scheme:dark){:root{--bg:#121216;--card:#1B1B21;--ink:#F1F0F5;--muted:#9C99AA;--line:#2C2B34;--accent:#8A7DFF;--accent-ink:#0F0E16}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,"PingFang SC","Noto Sans SC","Segoe UI",system-ui,sans-serif}
main{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px 28px;box-shadow:0 10px 40px rgba(0,0,0,.06)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.brand img{width:44px;height:44px;border-radius:12px}
.brand b{font-size:20px;letter-spacing:-.01em}
.brand small{display:block;color:var(--muted);font-size:13px;margin-top:1px}
h1{font-size:22px;margin:0 0 6px;letter-spacing:-.01em}
p{margin:0 0 18px;color:var(--muted);font-size:14.5px}
label{display:block;font-size:13px;color:var(--muted);margin:0 0 6px}
input{width:100%;font:inherit;font-size:17px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:transparent;color:var(--ink);outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
input.code{letter-spacing:.35em;text-align:center;font-variant-numeric:tabular-nums}
button{width:100%;margin-top:14px;font:inherit;font-weight:600;font-size:16px;padding:13px 16px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button[disabled]{opacity:.55;cursor:default}
button.ghost{background:transparent;color:var(--muted);font-weight:500;margin-top:6px;padding:8px}
.msg{min-height:22px;font-size:14px;margin-top:12px;color:var(--muted)}
.msg.err{color:var(--warn)}
.foot{margin-top:22px;font-size:12.5px;color:var(--muted);line-height:1.6}
.foot a{color:inherit}
.notice{margin:18px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:12px;font-size:13px;line-height:1.55;color:var(--ink)}
.notice b{display:block;margin-bottom:2px}
.notice b a{color:var(--accent);margin:0}
.notice a{color:var(--accent);text-decoration:none;margin-right:12px}
details.inv{margin-top:12px;font-size:13px;color:var(--muted)}
details.inv summary{cursor:pointer}
details.inv input{margin-top:8px;font-size:15px;text-transform:uppercase;letter-spacing:.12em}
.lang{position:fixed;top:14px;right:16px;font-size:13px;color:var(--muted);background:none;border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;width:auto;margin:0;font-weight:500}
.hidden{display:none}
i.en,i.zh{font-style:normal}
[data-lang="zh"] i.en,[data-lang="en"] i.zh{display:none}
</style>
</head>
<body data-lang="zh">
<button class="lang" id="lang" type="button">English</button>
<main>
<div class="card">
  <div class="brand"><img src="https://nanomuse.cn/assets/icon-512.png" alt=""><div><b>nanoMuse Web</b>
  <small><i class="zh">在浏览器里用，不用下载</i><i class="en">In the browser, nothing to install</i></small></div></div>

  <form id="step1">
    <h1><i class="zh">试试 nanoMuse</i><i class="en">Try nanoMuse</i></h1>
    <p><i class="zh">一个邮箱、一个验证码，一分钟后就有一台属于你的 nanoMuse，模型自带。它一直保存着，下次登录还在；之后手机和电脑用同一个账号登录，就是它。</i><i class="en">An e-mail, a code, and a minute later a nanoMuse of your own is here, model included. It keeps everything for your next visit; later, the same account on the phone and the desktop is the same nanoMuse.</i></p>
    <label for="ident"><i class="zh">邮箱</i><i class="en">E-mail</i></label>
    <input id="ident" name="identifier" autocomplete="email" inputmode="email" required autofocus>
    <details class="inv" id="inv">
      <summary><i class="zh">有邀请码？</i><i class="en">Have an invite code?</i></summary>
      <input id="invite" name="invite" maxlength="8" autocomplete="off" spellcheck="false" placeholder="ABCD2345">
    </details>
    <button id="send" type="submit"><i class="zh">发送验证码</i><i class="en">Send the code</i></button>
    <div class="msg" id="msg1"></div>
  </form>

  <form id="step2" class="hidden">
    <h1><i class="zh">输入验证码</i><i class="en">Enter the code</i></h1>
    <p><i class="zh">六位数字已发到 </i><i class="en">Six digits were sent to </i><b id="to"></b></p>
    <label for="code"><i class="zh">验证码</i><i class="en">Code</i></label>
    <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
    <button id="go" type="submit"><i class="zh">进入我的 nanoMuse</i><i class="en">Open my nanoMuse</i></button>
    <button id="back" class="ghost" type="button"><i class="zh">换个账号</i><i class="en">Use another account</i></button>
    <div class="msg" id="msg2"></div>
  </form>

  <div class="notice">
    <b><a href="https://nanomuse.cn/#open-source" rel="noopener"><i class="zh">免费 · 开源 · 非盈利 —— 开源共建，做属于所有人的个人智能体</i><i class="en">Free · Open source · Non-profit — open source, built together: a personal agent for all</i></a></b>
    <i class="zh">每个账号 ¥10 免费模型额度，由开发者承担；邀请一位新用户 +¥5，加入共创计划 +¥10；用完可以换自己的 key（推荐阿里云百炼）。默认不保存你的消息，数据不会出售。欢迎反馈问题、提需求、贡献代码——每一次参与，都在让个人智能体离所有人更近一步。</i>
    <i class="en">¥10 of model use free per account, paid by the developer; ¥5 more for each friend you invite, ¥10 more for joining the co-creation programme; then your own key (Alibaba Cloud Bailian is a good start). Messages are not stored by default and nothing is sold. Report a bug, ask for a feature, send a pull request — every one brings a personal agent within everyone's reach.</i>
    <br><a href="https://github.com/nano-muse/nanoMuse" rel="noopener"><i class="zh">去 GitHub 点 Star</i><i class="en">Star on GitHub</i></a><a href="https://github.com/nano-muse/nanoMuse/issues/new/choose" rel="noopener"><i class="zh">反馈问题 / 提需求</i><i class="en">Report a bug or ask for a feature</i></a><a href="https://nanomuse.cn/own-key" rel="noopener"><i class="zh">换自己的 key</i><i class="en">Bring your own key</i></a>
  </div>
  <div class="foot">
    <i class="zh">你的 nanoMuse 运行在我们的服务器上，数据只有你能访问；长时间不用会休眠，登录即唤醒。想让它在自己的设备上跑？<a href="https://nanomuse.cn/#download">下载应用</a>。</i>
    <i class="en">Your nanoMuse runs on our server and only you can reach it; it sleeps after a long quiet spell and wakes when you sign in. Want it on your own device? <a href="https://nanomuse.cn/#download">Download the app</a>.</i>
    <br><i class="zh">nanoMuse 是社区项目，与 Meta 无关。</i><i class="en">nanoMuse is a community project, not affiliated with Meta.</i>
  </div>
</div>
</main>
<script>
(function(){
  var zh = /^zh/i.test(navigator.language || "");
  try { var saved = localStorage.getItem("nm-lang"); if (saved) zh = saved === "zh"; } catch (e) {}
  var body = document.body, langBtn = document.getElementById("lang");
  function setLang(z){ zh = z; body.dataset.lang = z ? "zh" : "en"; langBtn.textContent = z ? "English" : "中文";
    document.documentElement.lang = z ? "zh-CN" : "en"; try { localStorage.setItem("nm-lang", z ? "zh" : "en"); } catch (e) {} }
  setLang(zh);
  langBtn.onclick = function(){ setLang(!zh); };

  var s1 = document.getElementById("step1"), s2 = document.getElementById("step2");
  var ident = document.getElementById("ident"), code = document.getElementById("code");
  var invite = document.getElementById("invite"), inv = document.getElementById("inv");
  function cleanInvite(v){ return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
  try {
    var fromUrl = cleanInvite(new URLSearchParams(location.search).get("invite"));
    if (fromUrl) { invite.value = fromUrl; inv.open = true; }
  } catch (e) {}
  var msg1 = document.getElementById("msg1"), msg2 = document.getElementById("msg2");
  var send = document.getElementById("send"), go = document.getElementById("go");
  var T = {
    sending: ["正在发送…", "Sending…"], sent: ["已发送", "Sent"],
    starting: ["正在准备你的 nanoMuse，第一次大约需要十几秒…", "Getting your nanoMuse ready — the first time takes ten seconds or so…"],
    ready: ["好了，正在进入…", "Ready, opening…"],
    network: ["网络不通，请稍后再试。", "Could not reach the server. Try again in a moment."]
  };
  function t(k){ return T[k][zh ? 0 : 1]; }
  function show(el, text, err){ el.textContent = text || ""; el.className = "msg" + (err ? " err" : ""); }
  function post(url, data){
    return fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)})
      .then(function(r){ return r.text().then(function(txt){ var j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) {} return {ok: r.ok, status: r.status, body: j}; }); });
  }
  s1.onsubmit = function(ev){
    ev.preventDefault(); send.disabled = true; show(msg1, t("sending"));
    post("/api/web/code", {identifier: ident.value.trim()}).then(function(r){
      send.disabled = false;
      if (!r.ok) { show(msg1, r.body.message || ("HTTP " + r.status), true); return; }
      document.getElementById("to").textContent = ident.value.trim();
      s1.classList.add("hidden"); s2.classList.remove("hidden"); show(msg2, t("sent")); code.value = ""; code.focus();
    }).catch(function(){ send.disabled = false; show(msg1, t("network"), true); });
  };
  s2.onsubmit = function(ev){
    ev.preventDefault(); go.disabled = true; show(msg2, t("starting"));
    post("/api/web/verify", {identifier: ident.value.trim(), code: code.value.trim(), invite: cleanInvite(invite.value)}).then(function(r){
      if (!r.ok) { go.disabled = false; show(msg2, r.body.message || ("HTTP " + r.status), true); return; }
      show(msg2, t("ready")); location.href = r.body.url;
    }).catch(function(){ go.disabled = false; show(msg2, t("network"), true); });
  };
  document.getElementById("back").onclick = function(){ s2.classList.add("hidden"); s1.classList.remove("hidden"); show(msg1, ""); ident.focus(); };
})();
</script>
</body>
</html>
"""
