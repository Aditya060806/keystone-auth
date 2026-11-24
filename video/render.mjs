// node render.mjs                 → out/keystone-demo.mp4 (1920×1080, 30 fps, 60 s)
// node render.mjs stills 4.6,5.2  → out/still-4.6.png, …  (spot-check frames)
// node render.mjs sheet 4,6,0.1   → out/sheet-4-6.png contact sheet of frames 4→6 s every 0.1 s
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FPS = 30, DURATION = +(process.env.DURATION ?? 60), START = +(process.env.START ?? 0);
const [mode = "video", arg = ""] = process.argv.slice(2);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
// Load the composition; retry if any asset failed (Chrome can hit ERR_INSUFFICIENT_RESOURCES
// under memory pressure, which leaves BOXES or images missing).
for (let attempt = 1; ; attempt++) {
  await page.goto(pathToFileURL(path.join(here, "comp.html")).href + "?render=1", { waitUntil: "load", timeout: 120_000 });
  const ok = await page.evaluate(async () => {
    if (!window.BOXES) return false;
    try { await window.READY; } catch { return false; }
    return [...document.images].every((i) => i.complete && i.naturalWidth > 0);
  });
  if (ok) break;
  if (attempt >= 4) throw new Error("composition failed to load after 4 attempts");
  console.error(`assets incomplete, retrying (${attempt})`);
  await new Promise((r) => setTimeout(r, 3000));
}

const frameAt = async (t, opts = {}) => {
  await page.evaluate((x) => window.seek(x), t);
  return page.screenshot({ type: "jpeg", quality: 96, optimizeForSpeed: true, ...opts });
};

try {
  if (mode === "stills") {
    for (const t of arg.split(",").map(Number)) {
      await page.evaluate((x) => window.seek(x), t);
      await page.screenshot({ path: path.join(here, "out", `still-${t}.png`) });
      console.log("still", t);
    }
  } else if (mode === "sheet") {
    // Contact sheet: tiles at 1/5 scale, 5 per row.
    const [a, b, dt] = arg.split(",").map(Number);
    const times = []; for (let t = a; t <= b + 1e-9; t += dt) times.push(+t.toFixed(3));
    const tiles = [];
    for (const t of times) tiles.push({ t, b64: (await frameAt(t, { encoding: "base64", type: "jpeg", quality: 70 })) });
    const sheet = await browser.newPage();
    const cols = 5, w = 384, h = 216;
    await sheet.setViewport({ width: cols * (w + 6), height: Math.ceil(tiles.length / cols) * (h + 24), deviceScaleFactor: 1 });
    await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${w + 6}px);font:12px sans-serif;color:#ddd">` +
      tiles.map((x) => `<div style="padding:3px"><img src="data:image/jpeg;base64,${x.b64}" style="width:${w}px;height:${h}px;display:block"><div>${x.t}s</div></div>`).join("") + "</body>");
    const out = path.join(here, "out", `sheet-${a}-${b}.png`);
    await sheet.screenshot({ path: out, fullPage: true });
    console.log("sheet", out);
  } else {
    const out = path.join(here, "out", arg || "keystone-demo.mp4");
    const ff = spawn(process.env.FFMPEG ?? "D:/ffmpeg/bin/ffmpeg.exe", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-color_range", "tv", "-profile:v", "high", "-movflags", "+faststart",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", out], { stdio: ["pipe", "inherit", "inherit"] });
    const total = FPS * DURATION;
    const started = Date.now();
    for (let f = 0; f < total; f++) {
      const buf = await frameAt(START + f / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 150 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg exit " + c)))));
    console.log("wrote", out);
  }
} finally {
  await browser.close();
}
