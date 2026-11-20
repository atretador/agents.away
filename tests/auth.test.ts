import { test, expect, describe, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Auth from "../src/auth";
import { config } from "../src/config";

const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140";
const req = (cookie = "") => new Request("https://phone.test/", { headers: { cookie, "user-agent": UA } });
const cookieFor = (sid: string) => "away_dev=" + encodeURIComponent(sid);
const realNow = Date.now;
const at = (ms: number) => { Date.now = () => realNow() + ms; };
const DAY = 86400_000;
afterEach(() => { Date.now = realNow; config.settings.signInDays = 30; });

const pair = () => Auth.redeemPairCode(Auth.newPairCode().code, UA, "10.0.0.4")!;

describe("pairing codes", () => {
  test("work once", () => {
    const { code } = Auth.newPairCode();
    expect(Auth.redeemPairCode(code, UA)).toBeString();
    expect(Auth.redeemPairCode(code, UA)).toBeNull();
  });
  test("expire after 10 minutes", () => {
    const { code, expiresInSec } = Auth.newPairCode();
    expect(expiresInSec).toBe(600);
    at(10 * 60_000 + 1000);
    expect(Auth.redeemPairCode(code, UA)).toBeNull();
  });
  test("unknown codes and the local token are refused", () => {
    expect(Auth.redeemPairCode("not-a-code", UA)).toBeNull();
    expect(Auth.redeemPairCode(config.token, UA)).toBeNull();
  });
});

describe("device sign-ins", () => {
  test("a paired device is signed in; others are not", () => {
    const sid = pair();
    expect(Auth.check(req(cookieFor(sid))).ok).toBe(true);
    expect(Auth.check(req()).ok).toBe(false);
    expect(Auth.check(req(cookieFor("forged"))).ok).toBe(false);
    expect(Auth.check(req("relay_auth=" + config.token)).ok).toBe(false); // the local token never signs a phone in
  });

  test("expire after the sign-in period without use, renew while used", () => {
    const sid = pair();
    at(29 * DAY);
    expect(Auth.check(req(cookieFor(sid))).ok).toBe(true); // use renews it
    at(29 * DAY + 29 * DAY);
    expect(Auth.check(req(cookieFor(sid))).ok).toBe(true);
    at(29 * DAY + 29 * DAY + 31 * DAY);
    expect(Auth.check(req(cookieFor(sid))).ok).toBe(false);
  });

  test("a shorter setting applies to existing devices", () => {
    const sid = pair();
    config.settings.signInDays = 1;
    at(2 * DAY);
    expect(Auth.check(req(cookieFor(sid))).ok).toBe(false);
  });

  test("cookie lifetime follows the setting and is HttpOnly + Secure", () => {
    config.settings.signInDays = 7;
    const c = Auth.deviceCookie("x");
    expect(c).toContain(`Max-Age=${7 * 86400}`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
  });

  test("sign out one device, or all others", () => {
    const a = pair(), b = pair(), c = pair();
    const keyOf = (sid: string) => (Auth.check(req(cookieFor(sid))) as any).key as string;
    const idOf = (sid: string) => Auth.listDevices(keyOf(sid)).find((d) => d.current)!.id;
    expect(Auth.signOut(idOf(a))).toBeString();
    expect(Auth.check(req(cookieFor(a))).ok).toBe(false);
    Auth.signOutOthers(keyOf(b));
    expect(Auth.check(req(cookieFor(b))).ok).toBe(true);
    expect(Auth.check(req(cookieFor(c))).ok).toBe(false);
  });

  test("only hashes of sign-ins are stored on disk", () => {
    const sid = pair();
    Auth.signOutOthers((Auth.check(req(cookieFor(sid))) as any).key); // flush to disk
    const file = readFileSync(join(process.env.AWAY_CONFIG_DIR!, "devices.json"), "utf8");
    expect(file).not.toContain(sid);
    expect(file).toContain("Pixel 9");
  });
});
