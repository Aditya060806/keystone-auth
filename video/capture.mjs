// Captures real screenshots of Keystone for the demo video.
// Usage: node capture.mjs   (needs `npm run dev` running on :3000)
import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./assets/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const EMAIL = `ada.lovelace+${Date.now().toString(36)}@example.com`;

// Hide dev-only chrome: the Next.js dev badge and the demo-mode code box
// (production with an email/SMS provider shows neither).
const CLEAN_CSS = `nextjs-portal{display:none!important}.border-dashed{display:none!important}*{caret-color:transparent!important}`;

async function clean(page) {
  await page.addStyleTag({ content: CLEAN_CSS });
  await page.evaluate(() => document.fonts.ready);
  await sleep(250);
}

async function shot(page, name, opts = {}) {
  await clean(page);
  await page.screenshot({ path: `${OUT}${name}.png`, ...opts });
  console.log("captured", name);
}

async function setReactValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    value,
  );
}

async function readDevCode(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => /^\d{6}$/.test(b.textContent.trim())),
  );
  return page.evaluate(
    () => [...document.querySelectorAll("button")].find((b) => /^\d{6}$/.test(b.textContent.trim())).textContent.trim(),
  );
}

async function clickText(page, text) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((b) => b.textContent.trim() === t);
    if (!el) throw new Error("No button " + t);
    el.click();
  }, text);
}

async function newPage(ctx, { ua, width, height, dpr, mobile = false }) {
  const page = await ctx.newPage();
  await page.setUserAgent(ua);
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  return page;
}

async function waitForPath(page, path) {
  await page.waitForFunction((p) => location.pathname === p, { timeout: 60_000 }, path);
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

// Element boxes (CSS px, page coordinates) so the video can zoom/highlight precisely.
const boxes = {};
async function box(page, shotName, key, finder) {
  const b = await page.evaluate((src) => {
    const el = new Function("return (" + src + ")")()();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
  }, finder.toString());
  if (!b) throw new Error("box not found: " + key);
  (boxes[shotName] ??= {})[key] = b;
}
const byText = (sel, text) => `() => [...document.querySelectorAll("${sel}")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const sectionOf = (title) => `() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.trim().startsWith(${JSON.stringify(title)}))`;

async function waitForCooldown() {
  // The app enforces a 30 s resend cooldown per address.
  await sleep(31_000);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const laptopCtx = await browser.createBrowserContext();
  const phoneCtx = await browser.createBrowserContext();
  const laptop = await newPage(laptopCtx, { ua: WIN_UA, width: 1280, height: 800, dpr: 2 });
  const phone = await newPage(phoneCtx, { ua: IPHONE_UA, width: 390, height: 844, dpr: 3, mobile: true });

  // ── Landing ───────────────────────────────────────────────────────────
  await laptop.goto(BASE + "/", { waitUntil: "networkidle0" });
  await shot(laptop, "d01-landing");
  await box(laptop, "d01-landing", "h1", () => document.querySelector("h1"));
  await box(laptop, "d01-landing", "cta", byText("a", "Create an account"));
  await box(laptop, "d01-landing", "features", () => document.querySelector("h2")?.closest(".grid"));
  await box(laptop, "d01-landing", "logo", () => document.querySelector("header a"));

  // ── Sign-up ───────────────────────────────────────────────────────────
  await laptop.goto(BASE + "/signup", { waitUntil: "networkidle0" });
  await laptop.mouse.move(0, 0);
  await shot(laptop, "d02-signup-empty");
  await box(laptop, "signup", "card", () => document.querySelector("main .rounded-2xl"));
  await box(laptop, "signup", "tabs", () => document.querySelector('[role="tablist"]'));
  await box(laptop, "signup", "identifier", () => document.querySelector("#identifier"));
  await box(laptop, "signup", "surname", () => document.querySelector("#surname"));
  await box(laptop, "signup", "dob", () => document.querySelector("#dateOfBirth"));
  await box(laptop, "signup", "continue", byText("button", "Continue"));
  await box(laptop, "signup", "logo", () => document.querySelector("main a"));
  await clickText(laptop, "Phone");
  await laptop.waitForSelector('input[type="tel"]');
  await laptop.mouse.move(0, 0);
  await shot(laptop, "d03-signup-phone");

  await clickText(laptop, "Email");
  await laptop.waitForSelector('input[type="email"]');
  await laptop.type("#identifier", "ada@");
  await laptop.type("#surname", "L0velace");
  await setReactValue(laptop, "#dateOfBirth", "2019-04-01");
  await clickText(laptop, "Continue");
  await laptop.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length >= 3);
  await laptop.evaluate(() => document.activeElement?.blur());
  await shot(laptop, "d04-signup-errors");
  await box(laptop, "d04-signup-errors", "card", () => document.querySelector("main .rounded-2xl"));

  await laptop.goto(BASE + "/signup", { waitUntil: "networkidle0" });
  await laptop.type("#identifier", EMAIL);
  await laptop.type("#surname", "Lovelace");
  await setReactValue(laptop, "#dateOfBirth", "1990-12-10");
  await laptop.evaluate(() => document.activeElement?.blur());
  await shot(laptop, "d05-signup-filled");

  // ── Code step ─────────────────────────────────────────────────────────
  await clickText(laptop, "Continue");
  const code = await readDevCode(laptop);
  await shot(laptop, "d06-code-0");
  await box(laptop, "code", "card", () => document.querySelector("main .rounded-2xl"));
  await box(laptop, "code", "otp", () => document.querySelector('input[autocomplete="one-time-code"]').parentElement);
  await box(laptop, "code", "sentTo", () => document.querySelector("form p"));

  const wrong = code === "000000" ? "111111" : "000000";
  await laptop.type('input[autocomplete="one-time-code"]', wrong);
  await laptop.waitForFunction(() => document.body.innerText.includes("attempts left"));
  await sleep(300);
  await shot(laptop, "d07-code-wrong");
  await box(laptop, "d07-code-wrong", "alert", () => document.querySelector('[role="alert"]'));

  for (let i = 1; i <= 5; i++) {
    await laptop.type('input[autocomplete="one-time-code"]', code[i - 1]);
    await shot(laptop, `d06-code-${i}`);
  }
  await laptop.type('input[autocomplete="one-time-code"]', code[5]);
  await sleep(40);
  await laptop.addStyleTag({ content: CLEAN_CSS });
  await laptop.screenshot({ path: `${OUT}d06-code-6.png` });
  console.log("captured d06-code-6");

  await waitForPath(laptop, "/dashboard");
  await sleep(800);
  await laptop.mouse.move(0, 0);
  await shot(laptop, "d08-dashboard", { fullPage: true });
  await box(laptop, "d08-dashboard", "setup", byText("button", "Set up"));
  await box(laptop, "d08-dashboard", "prompt", () => document.querySelector("main section"));
  await box(laptop, "d08-dashboard", "device", sectionOf("This device"));
  await box(laptop, "d08-dashboard", "passkeys", sectionOf("Face ID"));
  await box(laptop, "d08-dashboard", "profile", sectionOf("Profile"));

  // ── Phone signs in (same account) ─────────────────────────────────────
  await phone.goto(BASE + "/login", { waitUntil: "networkidle0" });
  await shot(phone, "p01-login");
  await box(phone, "p01-login", "passkey", byText("button", "Sign in with"));
  await box(phone, "p01-login", "card", () => document.querySelector("main .rounded-2xl"));
  await waitForCooldown();
  await phone.type("#identifier", EMAIL);
  await clickText(phone, "Send code");
  const phoneCode = await readDevCode(phone);
  await shot(phone, "p02-code");
  await phone.type('input[autocomplete="one-time-code"]', phoneCode);
  await waitForPath(phone, "/dashboard");
  await sleep(800);
  await shot(phone, "p03-dashboard");
  await box(phone, "p03-dashboard", "device", sectionOf("This device"));

  // ── Laptop finds out it was signed out ────────────────────────────────
  // The laptop is still on its dashboard; its session watcher notices within
  // ~10 s and moves it to the login page with the "signed out" explanation.
  await laptop.bringToFront();
  await laptop.waitForFunction(() => location.search.includes("reason=replaced"), { timeout: 45_000 });
  await laptop.waitForSelector('[role="status"]');
  await sleep(600);
  await shot(laptop, "d09-login-replaced");
  await box(laptop, "d09-login-replaced", "banner", () => document.querySelector('[role="status"]'));
  await box(laptop, "d09-login-replaced", "card", () => document.querySelector("main .rounded-2xl"));

  await laptop.goto(BASE + "/login", { waitUntil: "networkidle0" });
  await shot(laptop, "d10-login");
  await box(laptop, "d10-login", "passkey", byText("button", "Sign in with"));
  await box(laptop, "d10-login", "card", () => document.querySelector("main .rounded-2xl"));

  // ── Laptop signs back in → activity log shows the whole story ─────────
  await waitForCooldown();
  await laptop.type("#identifier", EMAIL);
  await clickText(laptop, "Send code");
  const code3 = await readDevCode(laptop);
  await laptop.type('input[autocomplete="one-time-code"]', code3);
  await waitForPath(laptop, "/dashboard");
  await sleep(1200);
  await shot(laptop, "d11-dashboard-activity", { fullPage: true });
  await box(laptop, "d11-dashboard-activity", "activity", sectionOf("Recent security"));
  await box(laptop, "d11-dashboard-activity", "device", sectionOf("This device"));
  const fs = await import("node:fs");
  fs.writeFileSync(OUT + "boxes.json", JSON.stringify(boxes, null, 2));
  console.log("boxes saved");
} finally {
  await browser.close();
}
