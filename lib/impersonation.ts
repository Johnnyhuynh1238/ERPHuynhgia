import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Admin "đóng vai" user khác để hỗ trợ / xem UI.
// Cookie HMAC-signed, hết hạn 60 phút; getCurrentUser đọc cookie và swap user.
export const IMPERSONATE_COOKIE = "hg_impersonate";
export const IMPERSONATE_TTL_MS = 60 * 60 * 1000;

function secret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Thiếu NEXTAUTH_SECRET");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function buildImpersonationCookieValue(targetUserId: string): string {
  const expires = Date.now() + IMPERSONATE_TTL_MS;
  const payload = `${targetUserId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

// Trả về targetUserId nếu cookie hợp lệ + chưa hết hạn; null nếu không.
export function readImpersonationTarget(): string | null {
  const raw = cookies().get(IMPERSONATE_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [targetUserId, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!targetUserId || !Number.isFinite(expires) || Date.now() > expires) return null;
  const expected = sign(`${targetUserId}.${expiresStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return targetUserId;
}
