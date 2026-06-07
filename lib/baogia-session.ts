// HMAC session token cho /api/leads/baogia/calculate.
// Frontend POST /api/leads/baogia/session → nhận {token, expiresAt}.
// Mỗi token sống 30 phút, bị bind vào IP. Bot bruteforce không có token → 401.

import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.BAOGIA_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "";

const TTL_MS = 30 * 60 * 1000; // 30 phút

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  if (!SECRET) {
    throw new Error("BAOGIA_SESSION_SECRET / AUTH_SECRET / NEXTAUTH_SECRET chưa cấu hình");
  }
  return b64url(createHmac("sha256", SECRET).update(payload).digest());
}

export function issueBaogiaToken(ip: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TTL_MS;
  // Format: <expiresAt>.<ipHash6>.<sig>
  // ipHash 6 ký tự (ngắn) — đủ để bind, không lộ IP trong token.
  const ipHash = b64url(createHmac("sha256", SECRET || "fallback").update(ip).digest()).slice(0, 8);
  const payload = `${expiresAt}.${ipHash}`;
  const sig = sign(payload);
  return { token: `${payload}.${sig}`, expiresAt };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "ip_mismatch" | "bad_sig" };

export function verifyBaogiaToken(token: string, ip: string): VerifyResult {
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [expStr, ipHash, sig] = parts as [string, string, string];
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  let expectedSig: string;
  try {
    expectedSig = sign(`${expStr}.${ipHash}`);
  } catch {
    return { ok: false, reason: "bad_sig" };
  }
  const a = fromB64Url(sig);
  const b = fromB64Url(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_sig" };
  }

  const expectedIpHash = b64url(
    createHmac("sha256", SECRET || "fallback").update(ip).digest(),
  ).slice(0, 8);
  if (expectedIpHash !== ipHash) return { ok: false, reason: "ip_mismatch" };

  return { ok: true };
}
