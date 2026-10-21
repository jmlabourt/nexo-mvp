import { chromium } from "playwright-core";
export const USERS = JSON.parse(process.env.USERS);
export const OUT = process.env.OUT ?? "./e2e-capturas/";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
export const errors = [];
export async function as(who, viewport = { width: 1440, height: 900 }) {
  const now = Math.floor(Date.now() / 1000);
  const id = USERS[who];
  const user = { id, email: `${who}@demo.com`, aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {} };
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 86400, session_id: who })}.sig`;
  const session = { access_token: jwt, token_type: "bearer", expires_in: 86400, expires_at: now + 86400, refresh_token: "r", user };
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${who}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${who} console: ${m.text().slice(0, 200)}`));
  return page;
}
export async function go(page, path) {
  await page.goto((process.env.BASE ?? "http://localhost:3100") + path);
  await page.waitForSelector("main, body", { timeout: 30000 });
  await page.waitForTimeout(1200);
}
export async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + name + ".png", fullPage: true });
}
