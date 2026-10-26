// Usage: node shoot.mjs <url> <outdir> <width> <height> [light|dark]
import { spawn } from "node:child_process";
const [url, out, w = "1440", h = "900", scheme = "light"] = process.argv.slice(2);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${out}/../chrome-prof`, `--window-size=${w},${h}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40; i++) { try { const l = await (await fetch("http://127.0.0.1:9333/json")).json(); const p = l.find(t => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map(a => a.value || a.description).join(" ")); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 760 });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
await send("Page.navigate", { url }); await sleep(2500);
const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
const stops = await ev(`[...document.querySelectorAll('[data-stop]')].map(s=>{const r=s.getBoundingClientRect();return [s.id||s.dataset.stop, s.dataset.stop, r.top+scrollY, r.height]})`);
const fs = await import("node:fs");
const shots = [];
for (const [name, kind, top, height] of stops) {
  const H = +h, mid = top + height / 2 - H / 2;
  const targets = kind === "growth"
    ? [["growth-start", top - H * 0.05], ["growth-mid", top + (height - H * 1.1) / 2], ["growth-end", top + height - H * 1.15]]
    : (name === "engine" || name === "build") ? [[name + "-arriving", mid - H * 0.6], [name, mid]] : height > H * 1.4 ? [[name, top - H * 0.05]] : [[name, mid]];
  for (const [label, y] of targets) {
    await ev(`scrollTo(0, ${Math.max(0, y)})`); await sleep(2200);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const f = `${out}/${w}-${scheme}-${label}.png`; fs.writeFileSync(f, Buffer.from(data, "base64")); shots.push(f);
  }
}
function innerH(f) { return +h * f; }
console.log(JSON.stringify({ shots, errors }, null, 1));
ws.close(); chrome.kill();
