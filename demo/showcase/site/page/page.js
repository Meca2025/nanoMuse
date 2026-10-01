// The page around the phone: the language, the status line, the lines to try, and the two
// buttons. The phone is MobileGym in a frame on this origin; the nanoMuse app on it exposes
// window.__NANOMUSE__ on that frame's window (demo/mobilegym/apps/nanoMuse/host.ts), which is
// how a tap here becomes text in the chat there.
(function () {
  "use strict";

  var root = document.documentElement;
  var phone = document.getElementById("phone");
  var status = document.getElementById("status");
  var lookGroup = document.getElementById("group-look");

  // ---- language -------------------------------------------------------------------------
  function lang() {
    return root.getAttribute("data-lang") === "zh" ? "zh" : "en";
  }
  function setLang(l) {
    root.setAttribute("data-lang", l);
    root.lang = l === "zh" ? "zh-CN" : "en";
    document.title = l === "zh" ? "nanoMuse · 在浏览器里试" : "nanoMuse · Try it in the browser";
    try {
      localStorage.setItem("nm-lang", l);
    } catch (e) {
      /* private mode */
    }
    render();
  }
  document.getElementById("lang").addEventListener("click", function () {
    setLang(lang() === "zh" ? "en" : "zh");
  });
  function tr(en, zh) {
    return lang() === "zh" ? zh : en;
  }

  // ---- what the showcase offers ---------------------------------------------------------
  var info = null;
  fetch("/api/demo/info", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (i) {
      info = i;
      if (i && !i.image_model && lookGroup) {
        // no image model on this showcase: the lines stay visible, but say why they will not draw
        lookGroup.classList.add("off");
        lookGroup.querySelectorAll(".chip").forEach(function (b) {
          b.disabled = true;
        });
        var why = lookGroup.querySelector(".why");
        if (why) {
          why.innerHTML =
            '<i class="en">This showcase has no image model, so the Muse keeps its dragon look here. Your own nanoMuse draws.</i>' +
            '<i class="zh">这个展示站没有配图像模型，这里的 Muse 就一直是小龙的样子。你自己装的 nanoMuse 可以画。</i>';
        }
      }
      render();
    })
    .catch(function () {
      /* the status line manages without */
    });

  // ---- the phone's nanoMuse app ---------------------------------------------------------
  var host = null; // window.__NANOMUSE__ of the frame
  var state = null; // what it last told us
  var launched = false;
  var flash = null; // a short message in the status line, over the regular one

  function frameWindow() {
    try {
      return phone.contentWindow;
    } catch (e) {
      return null;
    }
  }

  // A Muse from an earlier visit whose time is up, or that the server no longer knows.
  function over(s) {
    return !!(s && s.demo) && (Date.now() / 1000 > s.demo.expiresAt || s.link === "unauthorized");
  }

  var renewedAt = 0; // when the page started a fresh Muse by itself
  function renewing() {
    return renewedAt > 0 && Date.now() - renewedAt < 20000;
  }
  function adopt() {
    var w = frameWindow();
    var api = w && w.__NANOMUSE__;
    if (!api || host) return !!host;
    host = api;
    api.subscribe(function (s) {
      state = s;
      // Coming back to a Muse that is gone: start a fresh one without being asked (once).
      if (!renewedAt && over(s)) {
        renewedAt = Date.now();
        Promise.resolve(api.reset()).catch(function () {
          /* the status line says to Start over */
        });
      }
      render();
    });
    return true;
  }

  // Bring nanoMuse to the front once the simulated phone has booted (a beat after
  // __OS__ appears, so the launcher is there to animate from).
  function launch() {
    var w = frameWindow();
    if (launched || !host || !w || !w.__OS__) return;
    launched = true;
    setTimeout(function () {
      try {
        host.open();
      } catch (e) {
        /* the person can open it on the phone */
      }
    }, 1200);
  }

  function watch() {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      adopt();
      launch();
      if ((host && launched) || tries > 150) clearInterval(timer);
    }, 200);
  }
  phone.addEventListener("load", watch);
  // the frame may have loaded before this script ran
  if (frameWindow() && frameWindow().document && frameWindow().document.readyState === "complete") watch();

  // ---- the status line ------------------------------------------------------------------
  function minutesLeft() {
    if (!state || !state.demo) return null;
    return Math.max(0, Math.round((state.demo.expiresAt - Date.now() / 1000) / 60));
  }

  function render() {
    var cls = "status";
    var text;
    if (flash) {
      text = flash;
      cls += " flash";
    } else if (!host) {
      text = tr("Starting the phone…", "手机启动中…");
    } else if (!state || !state.configured) {
      text = tr("Starting a Muse for you…", "正在为你启动一个 Muse…");
    } else if (state.demo && Date.now() / 1000 > state.demo.expiresAt) {
      text = renewing()
        ? tr("Starting a Muse for you…", "正在为你启动一个 Muse…")
        : tr("This Muse's time is up — Start over for a new one.", "这个 Muse 的时间到了——点「重新开始」再来一个。");
      if (!renewing()) cls += " warn";
    } else if (state.link === "unauthorized") {
      text = tr("The session has ended — Start over for a new one.", "会话已结束——点「重新开始」再来一个。");
      cls += " warn";
    } else if (state.link === "unreachable") {
      text = tr("Cannot reach your Muse right now; retrying…", "暂时连不上你的 Muse，正在重试…");
      cls += " warn";
    } else {
      var parts = [];
      var who = state.name && state.name.toLowerCase() !== "nanomuse" ? state.name : null;
      parts.push(who ? tr("Your Muse, " + who, "你的 Muse「" + who + "」") : tr("Your Muse", "你的 Muse"));
      var left = minutesLeft();
      if (left !== null) parts.push(tr(left + " min left", "还剩 " + left + " 分钟"));
      if (info && info.demo_model && !(state.demo && state.demo.byok)) parts.push(info.demo_model);
      if (state.link === "connecting" || state.web !== "ready") parts.push(tr("connecting…", "连接中…"));
      text = parts.join(" · ");
      cls += " live";
    }
    status.textContent = text;
    status.className = cls;
  }
  setInterval(render, 30000);

  function say(text, ms) {
    flash = text;
    render();
    setTimeout(function () {
      if (flash === text) {
        flash = null;
        render();
      }
    }, ms || 4000);
  }

  // ---- the lines to try -----------------------------------------------------------------
  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var text = lang() === "zh" ? chip.getAttribute("data-zh") : chip.getAttribute("data-en");
      if (!text) return;
      if (!host) {
        say(tr("The phone is still starting; one moment.", "手机还在启动，稍等一下。"));
        return;
      }
      if (state && !state.configured) {
        say(tr("Your Muse is still starting; one moment.", "你的 Muse 还在启动，稍等一下。"));
        return;
      }
      try {
        host.draft(text);
      } catch (e) {
        say(tr("Could not hand that to the phone.", "没能把这句话交给手机。"));
        return;
      }
      chip.classList.add("sent");
      setTimeout(function () {
        chip.classList.remove("sent");
      }, 1500);
      say(
        state && state.web === "ready"
          ? tr("In the chat on the phone — tap send.", "已填进手机里的对话框，点发送就行。")
          : tr("Will be in the chat as soon as the Muse is up.", "等 Muse 启动好就会出现在对话框里。"),
      );
    });
  });

  document.getElementById("open").addEventListener("click", function () {
    if (host) host.open();
  });
  document.getElementById("reset").addEventListener("click", function () {
    if (!host) return;
    var ok = window.confirm(
      tr(
        "End this Muse and start a fresh one? Everything in it is gone.",
        "结束这个 Muse，重新来一个？里面的一切都会消失。",
      ),
    );
    if (!ok) return;
    say(tr("Starting over…", "正在重新开始…"), 8000);
    Promise.resolve(host.reset()).catch(function () {
      /* the phone shows what happened */
    });
  });

  render();
})();
