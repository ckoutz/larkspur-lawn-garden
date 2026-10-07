// Captures the Güd Office screenshots from the Larkspur demo at phone (390×844)
// and desktop (1440×900) size. Run right after `gvas-seed-demo --reset
// --sign-in-link <dashboard>` and pass the printed one-time link:
//
//   SIGN_IN_LINK='https://…/portal/login?token=…' node capture.mjs
//
// It first books one fictional walk-through through the real Gus chat and
// leaves it waiting under Needs you, so every dashboard shot shows it; it never
// approves, pays or sends anything.
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const site = process.env.SITE_URL ?? "https://larkspur-lawn-garden.netlify.app";
const dashboard = process.env.DASHBOARD_URL ?? "https://larkspur-dashboard.vercel.app";
// Netlify publishes this whole repo, so images go next to it, not inside it.
const out = process.env.OUT_DIR ?? fileURLToPath(new URL("../../../larkspur-shots", import.meta.url));
const link = process.env.SIGN_IN_LINK;
if (!link) throw new Error("SIGN_IN_LINK is required (from gvas-seed-demo --sign-in-link)");
mkdirSync(out, { recursive: true });

const sizes = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
];
const browser = process.env.CDP_URL
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch();
const context = await browser.newContext({
  viewport: sizes[0][1],
  deviceScaleFactor: Number(process.env.SCALE ?? 2),
  timezoneId: "America/Los_Angeles",
});

const page = await context.newPage();
// A desktop browser's scrollbars would sit inside a phone-sized shot.
await (await context.newCDPSession(page)).send("Emulation.setScrollbarsHidden", { hidden: true });

async function shoot(name, prepare, only) {
  // A one-size shot clears the other size's image left by an earlier run.
  for (const [size] of sizes.filter(([size]) => only && size !== only)) {
    rmSync(`${out}/${name}-${size}.png`, { force: true });
  }
  for (const [size, viewport] of sizes.filter(([size]) => !only || size === only)) {
    await page.setViewportSize(viewport);
    await prepare(size);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-${size}.png` });
    console.log(`${out}/${name}-${size}.png`);
  }
}
const open = async (path) => {
  await page.goto(`${dashboard}${path}`, { waitUntil: "networkidle" });
};
const scrollTo = async (locator, block = "center") => {
  await locator.evaluate((el, block) => el.scrollIntoView({ block }), block);
};
const sectionTop = async (heading) => {
  await scrollTo(page.getByText(heading, { exact: true }).first(), "start");
  await page.evaluate(() => scrollBy(0, -24));
};
// Ends the shot just below the section, so the next card's top doesn't peek in.
const sectionBottom = async (heading) => {
  await page.getByText(heading, { exact: true }).first().evaluate((el) => {
    const { bottom } = el.closest("section").getBoundingClientRect();
    scrollBy(0, bottom + 16 - innerHeight);
  });
};

await page.goto(link);
await page.waitForURL(/\/portal\/owner/, { timeout: 30000 });

// The booking chat comes first, so Maya's request shows in every dashboard
// shot: a real conversation with Gus until he offers openings.
const answers = [
  // "I have your details. Would you like to choose a time…?" mentions contact
  // details too, so it is answered before the contact pattern sees it.
  [/(would you like|want) to (choose|pick|book|see)[^?]*time/i, "Yes, please."],
  [/urgent|emergency/i, "Routine, no rush."],
  [/name/i, "I'm Maya Chen."],
  [/how big|size|square|how large/i, "The backyard is about 900 square feet."],
  [/email|e-mail|phone|contact|reach/i, "maya.chen@example.com, 510-555-0163."],
  [/service|which|what kind/i, "A backyard garden redesign: native planting beds and a gravel seating area."],
  [/address|where|located/i, "88 Linden Street, Berkeley."],
];
const lastReply = async () =>
  (await page.$$eval(".gus-row.agent .gus-bubble", (b) => b.at(-1)?.textContent)) ?? "";
await page.setViewportSize(sizes[0][1]);
await page.goto(`${site}/book.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".gus-row.agent", { timeout: 30000 });
let say =
  "Hi! We'd like to redesign the backyard: native planting beds in place of the lawn and a small gravel seating area. We're at 88 Linden Street, Berkeley.";
for (let turn = 0; turn < 10 && !(await page.$(".gus-slot")); turn++) {
  await page.fill(".gus-input", say);
  await page.click(".gus-send");
  await page.waitForSelector(".gus-typing", { state: "detached", timeout: 90000 });
  const reply = await lastReply();
  say = (answers.find(([re]) => re.test(reply)) ?? [null, "That's everything. Can I pick a time?"])[1];
}
if (!(await page.$(".gus-slot"))) throw new Error(`Gus offered no openings; last reply: ${await lastReply()}`);
// Resizing after a render leaves the chat log mid-scroll; the widget itself
// scrolls to the newest message on every render.
const framechat = async (size) => {
  if (size === "phone") await scrollTo(page.locator(".gus").first(), "end");
  else await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.querySelectorAll(".gus-log").forEach((log) => (log.scrollTop = log.scrollHeight)));
};
await shoot("5-gus-chat", framechat);
await page.click(".gus-slot");
await page.waitForSelector(".gus-typing", { state: "detached", timeout: 90000 });
await shoot("5b-gus-request-sent", framechat);

await shoot("1-owner-home", () => open("/portal/owner"));
// The phone Quotes table scrolls sideways, so the phone gets the week's calendar.
await shoot("2-calendar", async () => {
  await open("/portal/owner/calendar");
  await scrollTo(page.locator("main h2").first(), "start");
  await page.evaluate(() => scrollBy(0, -24));
}, "phone");
await shoot("2-quotes", () => open("/portal/owner/quotes"), "desktop");
await shoot("3-quote-mark-paid", async (size) => {
  await open("/portal/owner/quotes");
  // On the phone the section is shorter than the screen and the Quotes table
  // (which scrolls sideways there) would show below it.
  if (size === "phone") await sectionBottom("Waiting for payment");
  else await sectionTop("Waiting for payment");
});
await shoot("4-manual-plan", async () => {
  await open("/portal/owner/quotes");
  await sectionTop("Monthly plans");
});

// Shot 1 already shows the request waiting with Approve booking, so there is no
// separate approval shot; clear the one an earlier run left.
for (const [size] of sizes) rmSync(`${out}/6-owner-approval-${size}.png`, { force: true });

await context.close();
await browser.close();
