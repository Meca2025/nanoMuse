// The page around the phone: the language, the status line, the lines to try, and the two
// buttons. The phone is MobileGym in a frame on this origin, booted and framed by MobileGym's own
// scripts (state-builder.js powers it on into #demo-frame and runs the State Builder; boot-hero.js
// runs the gesture keys and the power button). The nanoMuse app on the phone exposes
// window.__NANOMUSE__ on the frame's window (demo/mobilegym/apps/nanoMuse/host.ts), which is how
// a tap here becomes text in the chat there.
(function () {
  "use strict";

  var root = document.documentElement;
  var frame = document.getElementById("demo-frame");
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
      if (i && lookGroup) {
        var why = lookGroup.querySelector(".why");
        if (!i.image_model) {
          // no image model on this showcase: the lines stay visible, but say why they will not draw
          lookGroup.classList.add("off");
          lookGroup.querySelectorAll(".chip").forEach(function (b) {
            b.disabled = true;
          });
          if (why) {
            why.innerHTML =
              '<i class="en">This showcase has no image model, so the Muse keeps its dragon look here. Your own nanoMuse draws.</i>' +
              '<i class="zh">这个展示站没有配图像模型，这里的 Muse 就一直是小龙的样子。你自己装的 nanoMuse 可以画。</i>';
          }
        } else if (!i.video_model && why) {
          // pictures but no clips: the face will not move here
          why.innerHTML =
            '<i class="en">Describe it and the Muse draws itself — four to pick from, then its poses.</i>' +
            '<i class="zh">说一句，它就把自己画出来：四张候选，选一张，再补齐表情。</i>';
        }
      }
      render();
    })
    .catch(function () {
      /* the status line manages without */
    });

  // ---- the phone -----------------------------------------------------------------------
  // state-builder.js puts the phone's frame into #demo-frame when the boot button is pressed, and
  // the boot button back when Power off is. The page presses the button for the visitor once.
  function phoneWindow() {
    var f = frame.querySelector("iframe");
    try {
      return f ? f.contentWindow : null;
    } catch (e) {
      return null;
    }
  }
  function powerOn() {
    var btn = document.getElementById("demo-boot-btn");
    if (btn) btn.click();
  }

  // ---- the phone's nanoMuse app ---------------------------------------------------------
  var hostWindow = null; // the frame's window the host below belongs to
  var host = null; // window.__NANOMUSE__ of the frame
  var state = null; // what it last told us
  var launched = false;
  var flash = null; // a short message in the status line, over the regular one

  // A Muse from an earlier visit whose time is up, or that the server no longer knows.
  function over(s) {
    return !!(s && s.demo) && (Date.now() / 1000 > s.demo.expiresAt || s.link === "unauthorized");
  }

  var renewedAt = 0; // when the page started a fresh Muse by itself
  function renewing() {
    return renewedAt > 0 && Date.now() - renewedAt < 20000;
  }
  function adopt(w) {
    var api = w && w.__NANOMUSE__;
    if (!api || host) return !!host;
    host = api;
    hostWindow = w;
    api.subscribe(function (s) {
      if (host !== api) return; // a phone that was powered off since
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
  function forget() {
    host = null;
    hostWindow = null;
    state = null;
    launched = false;
    render();
  }

  // Bring nanoMuse to the front once the simulated phone has booted (a beat after
  // __OS__ appears, so the launcher is there to animate from).
  function launch(w) {
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

  // The phone comes and goes (Power off, Click to start); follow whichever frame is there.
  setInterval(function () {
    var w = phoneWindow();
    if (!w) {
      if (host) forget();
      return;
    }
    if (host && hostWindow !== w) forget();
    adopt(w);
    launch(w);
  }, 250);

  // ---- the State Builder's drawer: beside the dock, level with the phone -------------------
  // MobileGym's stylesheet places the drawer assuming the phone is centred in the row; here the
  // panel shares the row, so the drawer follows the phone instead. Below 1280px their stylesheet
  // puts the drawer into the flow under the phone, and this leaves it alone.
  var drawer = document.getElementById("state-drawer");
  var layout = document.querySelector(".demo-layout");
  var rig = document.querySelector(".phone-rig");
  function placeDrawer() {
    if (!drawer || !layout || !rig) return;
    if (window.innerWidth < 1280) {
      drawer.style.left = "";
      drawer.style.top = "";
      return;
    }
    var l = layout.getBoundingClientRect();
    var r = rig.getBoundingClientRect(); // the phone as drawn (scaled to the viewport's height)
    // phone's right edge, the dock (14px gap, ~50px wide) and another 14px, as on their page
    drawer.style.left = Math.round(r.right - l.left + 78) + "px";
    drawer.style.top = Math.round(r.top - l.top) + "px";
  }
  if (drawer) {
    new MutationObserver(placeDrawer).observe(drawer, { attributes: true, attributeFilter: ["data-open"] });
    window.addEventListener("resize", placeDrawer);
    placeDrawer();
  }

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
    } else if (!phoneWindow()) {
      text = tr("The phone is off — Click to start.", "手机关着——点屏幕上的「Click to start」开机。");
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
      if (!phoneWindow()) {
        powerOn();
        say(tr("Turning the phone on; one moment.", "正在开机，稍等一下。"));
        return;
      }
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
    if (!phoneWindow()) powerOn();
    else if (host) host.open();
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
  // the phone turns itself on; a beat after the page is there, so the switch-on is seen
  setTimeout(powerOn, 400);
})();
