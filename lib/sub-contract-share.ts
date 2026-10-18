import { createHmac, timingSafeEqual } from "node:crypto";

// Link công khai cho bên B (thầu phụ) đọc file HĐ: "/hd/<fileId>.<hmac>".
// Token HMAC theo id file → không đoán/sửa ra file khác. Up file mới (id mới) = link mới.
const SITE_URL = (process.env.NEXTAUTH_URL || "https://erp.huynhgia6.com").replace(/\/$/, "");

function sign(fileId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Thiếu NEXTAUTH_SECRET");
  return createHmac("sha256", secret).update(`hd-file:${fileId}`).digest("hex").slice(0, 32);
}

export function subContractFileShareUrl(fileId: string): string {
  return `${SITE_URL}/hd/${fileId}.${sign(fileId)}`;
}

export function parseSubContractFileToken(token: string): string | null {
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{32})$/.exec(token || "");
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return m[1];
}
