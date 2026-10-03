#!/usr/bin/env node
// Start the harness the way the app does — the Electron binary in Node mode, the staged dsh,
// a throwaway home with the nanoMuse profile — and check that (1) the composed configuration
// carries the bundle's patches and (2) the Host comes up and answers. No display is needed,
// so this runs on every CI platform after packaging.
//
//   node scripts/smoke.mjs                 # development: node_modules/electron + ./dsh
//   node scripts/smoke.mjs --app <dir>     # the unpacked app electron-builder left (dist/*-unpacked, dist/mac*/…​.app)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const args = process.argv.slice(2);
const appArg = args[args.indexOf("--app") + 1];

let electron;
let dshDir;
if (args.includes("--app") && appArg) {
  const unpacked = resolve(appArg);
  if (process.platform === "darwin") {
    const bundle = unpacked.endsWith(".app") ? unpacked : readdirSync(unpacked).map((f) => join(unpacked, f)).find((f) => f.endsWith(".app"));
    if (!bundle) throw new Error(`no .app under ${unpacked}`);
    const macos = join(bundle, "Contents", "MacOS");
    electron = join(macos, readdirSync(macos)[0]);
    dshDir = join(bundle, "Contents", "Resources", "dsh");
  } else {
    const exe = readdirSync(unpacked).find((f) => (process.platform === "win32" ? f.endsWith(".exe") && !/uninstall/i.test(f) : f === "nanomuse-desktop"));
    if (!exe) throw new Error(`no executable under ${unpacked}`);
    electron = join(unpacked, exe);
    dshDir = join(unpacked, "resources", "dsh");
  }
} else {
  const electronPkg = join(appDir, "node_modules", "electron");
  const { default: path } = await import(join(electronPkg, "index.js")).catch(() => ({ default: undefined }));
  electron = path;
  dshDir = join(appDir, "dsh");
}
if (!electron || !existsSync(electron)) throw new Error(`no Electron binary at ${electron}`);
const bin = join(dshDir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
if (!existsSync(bin)) throw new Error(`no staged dsh at ${bin} — run scripts/prepare-dsh.mjs`);

// the profile, as src/main.ts writes it
const home = mkdtempSync(join(tmpdir(), "nanomuse-desktop-smoke-"));
const profile = join(home, "profiles", "nanomuse");
mkdirSync(join(profile, "node_modules"), { recursive: true });
writeFileSync(
  join(profile, "package.json"),
  `${JSON.stringify({ name: "dsh-profile-nanomuse", private: true, dependencies: { "dsh-nanomuse": "*" }, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-nanomuse"] } } }, null, 2)}\n`,
);
writeFileSync(join(profile, "cordis.yml"), "[]\n");
writeFileSync(join(profile, "cordis.patch.yml"), "[]\n");
symlinkSync(join(dshDir, "node_modules", "dsh-nanomuse"), join(profile, "node_modules", "dsh-nanomuse"), process.platform === "win32" ? "junction" : "dir");

const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", DSH_HOME: home, ELECTRON_NO_ATTACH_CONSOLE: "1" };
const redact = (s) => s.replace(/token=\S+/g, "token=…");
const cleanup = () => rmSync(home, { recursive: true, force: true });

console.log(`electron: ${electron}\ndsh: ${dshDir}\nhome: ${home}`);

// 1. the composed configuration
const dump = spawnSync(electron, ["--expose-internals", bin, "--profile", "nanomuse", "--dump-config"], { env, encoding: "utf8", timeout: 180_000 });
const patched = (dump.stdout.match(/patched by dsh-nanomuse/g) ?? []).length;
if (dump.status !== 0 || patched < 3) {
  console.error(dump.stdout.slice(-2000));
  console.error(dump.stderr.slice(-4000));
  cleanup();
  throw new Error(`--dump-config: exit ${dump.status}, ${patched} rows patched by the bundle`);
}
console.log(`dump-config: ${patched} rows patched by dsh-nanomuse`);

// 2. the Host
const port = await new Promise((resolvePort, reject) => {
  const srv = createServer();
  srv.on("error", reject);
  srv.listen(0, "127.0.0.1", () => {
    const p = srv.address().port;
    srv.close(() => resolvePort(p));
  });
});
const child = spawn(electron, ["--expose-internals", bin, "nanomuse", "--no-open", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
let err = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (c) => {
  out += c;
});
child.stderr.on("data", (c) => {
  err += c;
});
const url = await new Promise((resolveUrl, reject) => {
  const timer = setTimeout(() => reject(new Error("the Host did not announce its address within 120 s")), 120_000);
  const look = () => {
    const m = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(out);
    if (m) {
      clearTimeout(timer);
      resolveUrl(m[1]);
    }
  };
  child.stdout.on("data", look);
  child.on("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`the Host exited early (${code})`));
  });
}).catch((exc) => {
  console.error(redact(out.slice(-2000)));
  console.error(err.slice(-4000));
  child.kill("SIGKILL");
  cleanup();
  throw exc;
});
console.log(`host: ${redact(url)}`);
const noToken = await fetch(new URL(url).origin + "/", { redirect: "manual" }).then((r) => r.status);
const withToken = await fetch(url, { redirect: "manual" }).then((r) => r.status);
console.log(`GET / → ${noToken}; with the token → ${withToken}`);
const warnings = (out.match(/did not activate/g) ?? []).length;
if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
else child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 1500));
cleanup();
if (noToken !== 401 || withToken >= 400) throw new Error("the Host did not answer as dsh's web app does");
if (warnings > 0) {
  console.error(redact(out));
  throw new Error("some entries did not activate");
}
console.log("ok: the harness boots with the nanoMuse bundle");
