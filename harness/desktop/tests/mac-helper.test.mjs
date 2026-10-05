// The helper client (src/mac-helper.ts) against a fake "nanoMuse Computer Use" — an HTTP
// server in this process that behaves like the Swift one: reads the token file the client
// wrote, writes the port file, checks the bearer token, answers the five routes. Run after
// `tsc -p tsconfig.json` (npm test does both). No Mac, no Electron needed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { MacHelper, MacHelperError, HELPER_NAME, QUARANTINE_KEPT_TEXT, clearQuarantine, defaultHelperPath, describeAction, translocated } from "../out/mac-helper.js";

const roots = [];
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "nm-mac-helper-"));
  roots.push(dir);
  return dir;
}

/** A directory that stands for the .app bundle (present() only looks for it). */
function fakeBundle(dir) {
  const app = join(dir, `${HELPER_NAME}.app`);
  mkdirSync(app, { recursive: true });
  return app;
}

/**
 * The fake helper: `launch` starts it the way `open` would start the real one, with the same
 * arguments. `mode` picks the behaviour: "ok", "denied" (no Screen Recording), "no-port"
 * (never writes the port file), "dies" (answers once, then closes).
 */
function fakeHelper(mode = "ok") {
  const state = { token: "", requests: [], servers: [], quit: 0, pid: 4242 };
  const launch = async (appPath, args) => {
    state.appPath = appPath;
    state.args = args;
    if (mode === "no-port") return;
    const arg = (name) => args[args.indexOf(name) + 1];
    state.token = readFileSync(arg("--token-file"), "utf8").trim();
    state.parentPid = Number(arg("--parent-pid"));
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const send = (status, obj) => {
          res.writeHead(status, { "content-type": "application/json", connection: "close" });
          res.end(JSON.stringify(obj));
        };
        if (req.headers.authorization !== `Bearer ${state.token}`) return send(401, { error: "unauthorized", message: "a bearer token is required" });
        const json = body ? JSON.parse(body) : {};
        state.requests.push({ method: req.method, path: req.url, body: json });
        const status = { screen: mode === "denied" ? "denied" : "granted", accessibility: mode !== "denied", pid: state.pid, version: "0.1.38", display: { width: 1440, height: 900, scale: 2 } };
        if (req.method === "GET" && req.url === "/status") {
          send(200, status);
          if (mode === "dies") server.close();
          return;
        }
        if (req.method === "POST" && req.url === "/request") return send(200, status);
        if (req.method === "POST" && req.url === "/screenshot") {
          if (mode === "denied") return send(403, { error: "screen_denied", message: "Screen Recording is off for nanoMuse Computer Use" });
          return send(200, { base64: Buffer.from("png").toString("base64"), mime: json.format === "png" ? "image/png" : "image/jpeg", width: json.width ?? 1440, height: json.height ?? 900, screen: { width: 1440, height: 900 }, scale: 2 });
        }
        if (req.method === "POST" && req.url === "/execute") {
          if (!json.action) return send(400, { error: "bad_action", message: "unknown action ''" });
          return send(200, { ok: true, note: "" });
        }
        if (req.method === "POST" && req.url === "/quit") {
          state.quit += 1;
          send(200, { ok: true });
          setTimeout(() => server.close(), 50);
          return;
        }
        send(404, { error: "not_found", message: `no route ${req.method} ${req.url}` });
      });
    });
    state.servers.push(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    state.port = server.address().port;
    // the real helper writes it atomically; a short delay stands for its start-up
    setTimeout(() => writeFileSync(arg("--port-file"), `${JSON.stringify({ port: state.port, pid: state.pid, version: "0.1.38" })}\n`), 30);
  };
  state.launch = launch;
  state.closeAll = () => state.servers.forEach((s) => s.close());
  return state;
}

test("absent bundle: not present, never launched, every call says so", async () => {
  const dir = scratch();
  const helper = new MacHelper({ appPath: join(dir, "nowhere.app"), dataDir: join(dir, "data") });
  assert.equal(helper.present(), false);
  assert.equal(await helper.ready(), false);
  assert.equal(helper.running(), false);
  assert.equal(helper.cachedStatus(), null);
  assert.match(helper.failure(), /no helper bundle/);
  await assert.rejects(helper.screenshot(), (exc) => exc instanceof MacHelperError && exc.status === 503 && exc.code === "not_running");
  const off = new MacHelper({ appPath: undefined, dataDir: join(dir, "data2") });
  assert.equal(off.present(), false);
  assert.equal(await off.ready(), false);
});

test("start: token file 0600 before the launch, open's arguments, port discovery, status cached", async () => {
  const dir = scratch();
  const app = fakeBundle(dir);
  const fake = fakeHelper();
  const lines = [];
  const helper = new MacHelper({ appPath: app, dataDir: join(dir, "data"), launch: fake.launch, log: (l) => lines.push(l) });
  assert.equal(helper.present(), true);
  assert.equal(await helper.ready(), true);
  assert.equal(helper.running(), true);
  assert.equal(fake.appPath, app);
  assert.deepEqual(fake.args.slice(0, 1), ["--token-file"]);
  assert.ok(fake.args.includes("--port-file"));
  assert.equal(fake.parentPid, process.pid);
  assert.equal(fake.token.length, 48);
  // the token file is the person's alone while the helper runs
  assert.equal(statSync(fake.args[1]).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, "data")).mode & 0o777, 0o700);
  // the token the fake read is the one the client sends: /status was answered 200
  const status = helper.cachedStatus();
  assert.equal(status.screen, "granted");
  assert.equal(status.accessibility, true);
  assert.equal(status.pid, 4242);
  assert.equal(status.version, "0.1.38");
  assert.deepEqual(status.display, { width: 1440, height: 900, scale: 2 });
  assert.ok(lines.some((l) => l.includes("nanoMuse Computer Use 0.1.38") && l.includes("screen granted")));
  // a second ready() is a no-op
  assert.equal(await helper.ready(), true);
  assert.equal(fake.servers.length, 1);
  await helper.stop();
  assert.equal(fake.quit, 1);
  assert.equal(helper.running(), false);
  assert.equal(existsSync(join(dir, "data", "port")), false);
  assert.equal(existsSync(join(dir, "data", "token")), false);
});

test("the endpoints map one to one: status, request, screenshot, execute", async () => {
  const dir = scratch();
  const fake = fakeHelper();
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch });
  assert.equal(await helper.ready(), true);
  const asked = await helper.request("screen", true);
  assert.equal(asked.screen, "granted");
  assert.deepEqual(fake.requests.at(-1), { method: "POST", path: "/request", body: { what: "screen", pane: true } });
  const shot = await helper.screenshot({ width: 640, height: 400, format: "png", quality: 80 });
  assert.equal(shot.mime, "image/png");
  assert.equal(shot.width, 640);
  assert.equal(shot.height, 400);
  assert.deepEqual(shot.screen, { width: 1440, height: 900 });
  assert.equal(shot.scale, 2);
  assert.equal(Buffer.from(shot.base64, "base64").toString(), "png");
  assert.deepEqual(fake.requests.at(-1).body, { width: 640, height: 400, format: "png", quality: 80 });
  const done = await helper.execute({ action: "click", x: 10, y: 20 });
  assert.deepEqual(done, { ok: true, note: "" });
  assert.deepEqual(fake.requests.at(-1).body, { action: "click", x: 10, y: 20 });
  await assert.rejects(helper.execute({ action: "" }), (exc) => exc instanceof MacHelperError && exc.status === 400 && exc.code === "bad_action");
  await helper.stop();
});

test("denied: /screenshot's 403 comes through with its code; status says denied", async () => {
  const dir = scratch();
  const fake = fakeHelper("denied");
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch });
  assert.equal(await helper.ready(), true);
  assert.equal(helper.cachedStatus().screen, "denied");
  assert.equal(helper.cachedStatus().accessibility, false);
  await assert.rejects(helper.screenshot(), (exc) => exc instanceof MacHelperError && exc.status === 403 && exc.code === "screen_denied" && /nanoMuse Computer Use/.test(exc.message));
  await helper.stop();
});

test("a helper that never writes its port: ready() is false, and not retried for a while", async () => {
  const dir = scratch();
  const fake = fakeHelper("no-port");
  const lines = [];
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch, startTimeoutMs: 250, retryAfterMs: 60_000, log: (l) => lines.push(l) });
  assert.equal(await helper.ready(), false);
  assert.match(helper.failure(), /no port after/);
  assert.ok(lines.some((l) => /did not start/.test(l) && /Electron path/.test(l)));
  assert.equal(await helper.ready(), false);
  assert.equal(fake.args !== undefined, true);
});

test("a helper that dies: the next call fails as not_running and ready() launches it again", async () => {
  const dir = scratch();
  const fake = fakeHelper("dies");
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch });
  assert.equal(await helper.ready(), true);
  // the fake closed its server after the first /status; the socket is refused now
  await assert.rejects(helper.status(), (exc) => exc instanceof MacHelperError && exc.code === "not_running");
  assert.equal(helper.running(), false);
  assert.equal(helper.cachedStatus(), null);
  assert.equal(await helper.ready(), true);
  assert.equal(fake.servers.length, 2);
  fake.closeAll();
});

test("restart: /quit to the old one, then a fresh launch with a new token", async () => {
  const dir = scratch();
  const fake = fakeHelper();
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch });
  assert.equal(await helper.ready(), true);
  const first = fake.token;
  assert.equal(await helper.restart(), true);
  assert.equal(fake.quit, 1);
  assert.equal(fake.servers.length, 2);
  assert.notEqual(fake.token, first);
  assert.equal(helper.running(), true);
  await helper.stop();
});

test("restart: two at once are one — a single /quit, a single fresh launch; busy() and the last known status meanwhile", async () => {
  const dir = scratch();
  const fake = fakeHelper();
  const helper = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch });
  assert.equal(await helper.ready(), true);
  assert.equal(helper.busy(), false);
  const first = helper.restart();
  const second = helper.restart();
  assert.equal(first, second);
  // between the processes: not "not in use" — busy, and the last status stands in for the readers
  assert.equal(helper.busy(), true);
  assert.equal(helper.lastKnownStatus().screen, "granted");
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(fake.quit, 1);
  assert.equal(fake.servers.length, 2);
  assert.equal(helper.busy(), false);
  await helper.stop();
});

test("quarantine: a flag that came off is logged; one that stays is why the helper is not started", async () => {
  const dir = scratch();
  const fake = fakeHelper();
  const lines = [];
  const removed = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data"), launch: fake.launch, quarantine: () => ({ result: "removed", detail: "" }), log: (l) => lines.push(l) });
  assert.equal(await removed.ready(), true);
  assert.ok(lines.some((l) => /removed the quarantine flag/.test(l)));
  await removed.stop();
  const stuck = fakeHelper();
  const kept = new MacHelper({ appPath: fakeBundle(dir), dataDir: join(dir, "data2"), launch: stuck.launch, quarantine: () => ({ result: "kept", detail: "Operation not permitted" }) });
  assert.equal(await kept.ready(), false);
  assert.equal(stuck.args, undefined);
  assert.ok(kept.failure().includes(QUARANTINE_KEPT_TEXT));
  assert.match(kept.failure(), /Operation not permitted/);
});

test("clearQuarantine: xattr's answers → none, removed, kept (with what it said); nothing off macOS", () => {
  const calls = [];
  const fakeXattr = (answers) => (cmd, args) => {
    calls.push([cmd, ...args]);
    const next = answers.shift();
    return typeof next === "string" ? { status: 1, stderr: next } : next;
  };
  const absent = { status: 1, stderr: "No such xattr: com.apple.quarantine" };
  const present = { status: 0, stdout: "0083;00000000;;UUID" };
  assert.deepEqual(clearQuarantine("/x/Helper.app", fakeXattr([absent]), "darwin"), { result: "none", detail: "" });
  assert.deepEqual(calls.at(-1), ["xattr", "-p", "com.apple.quarantine", "/x/Helper.app"]);
  assert.deepEqual(clearQuarantine("/x/Helper.app", fakeXattr([present, { status: 0, stderr: "" }, absent]), "darwin"), { result: "removed", detail: "" });
  assert.deepEqual(calls.at(-2), ["xattr", "-dr", "com.apple.quarantine", "/x/Helper.app"]);
  assert.deepEqual(clearQuarantine("/x/Helper.app", fakeXattr([present, { status: 1, stderr: "xattr: [Errno 30] Read-only file system\nmore" }, present]), "darwin"), {
    result: "kept",
    detail: "xattr: [Errno 30] Read-only file system",
  });
  assert.deepEqual(clearQuarantine("/x/Helper.app", fakeXattr([present, { error: new Error("spawn xattr ENOENT") }, present]), "darwin"), { result: "kept", detail: "spawn xattr ENOENT" });
  const before = calls.length;
  assert.deepEqual(clearQuarantine("/x/Helper.app", fakeXattr([]), "linux"), { result: "none", detail: "" });
  assert.equal(calls.length, before);
});

test("an app under App Translocation does not start its helper, and says why", async () => {
  const dir = scratch();
  const app = join(dir, "AppTranslocation", "4F1C", "d", "nanoMuse.app", "Contents", "Helpers", `${HELPER_NAME}.app`);
  mkdirSync(app, { recursive: true });
  assert.equal(translocated(app), true);
  assert.equal(translocated("/Applications/nanoMuse.app/Contents/Helpers/x.app"), false);
  const fake = fakeHelper();
  const helper = new MacHelper({ appPath: app, dataDir: join(dir, "data"), launch: fake.launch, quarantine: () => ({ result: "none", detail: "" }) });
  assert.equal(helper.present(), true);
  assert.equal(await helper.ready(), false);
  assert.equal(fake.args, undefined);
  assert.match(helper.failure(), /Applications folder/);
});

test("defaultHelperPath: the env override, Contents/Helpers when packaged, the build dir in development", () => {
  assert.equal(defaultHelperPath("/x/nanoMuse.app/Contents/MacOS/nanomuse-desktop", true, "/proj", { NANOMUSE_COMPUTER_USE_APP: "/elsewhere/Helper.app" }), "/elsewhere/Helper.app");
  assert.equal(defaultHelperPath("/x/nanoMuse.app/Contents/MacOS/nanomuse-desktop", true, "/proj", {}), "/x/nanoMuse.app/Contents/Helpers/nanoMuse Computer Use.app");
  assert.equal(defaultHelperPath("/usr/bin/electron", false, "/proj", {}), "/proj/mac/computer-use/build/nanoMuse Computer Use.app");
});

test("describeAction: the glow's words, as the operator phrases them", () => {
  assert.equal(describeAction({ action: "click" }), "click");
  assert.equal(describeAction({ action: "left_double" }), "double click");
  assert.equal(describeAction({ action: "right_single" }), "right click");
  assert.equal(describeAction({ action: "drag" }), "drag");
  assert.equal(describeAction({ action: "scroll", dy: -200 }), "scroll up");
  assert.equal(describeAction({ action: "scroll" }), "scroll down");
  assert.equal(describeAction({ action: "type", text: "hello\n" }), "typing “hello”");
  assert.equal(describeAction({ action: "type", text: "x".repeat(50) }), `typing “${"x".repeat(40)}…”`);
  assert.equal(describeAction({ action: "hotkey", keys: ["cmd", "c"] }), "keys cmd + c");
  assert.equal(describeAction({ action: "wait", seconds: 99 }), "waiting 10 s");
  assert.equal(describeAction({ action: "wait" }), "waiting 1 s");
  assert.equal(describeAction({ action: "mystery" }), "mystery");
});
