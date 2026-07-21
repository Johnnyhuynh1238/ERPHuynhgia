import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireMuaHang } from "@/lib/estimate";

// Chạy ở nodejs runtime để đọc được process.env.CLAUDE_WEB_SECRET (edge middleware lọc env lạ).
export const runtime = "nodejs";

// SSO webterminal: admin/accountant đã đăng nhập ERP → cấp cookie claude_code_session
// (đồng dạng /usr/local/bin/claude-web-auth: value = `${expiry}.${hmac_sha256_hex(SECRET, expiry)}`)
// cho parent domain .huynhgia6.com để iframe AI (huynhgia6.com/claude) nhận diện — khỏi mật khẩu riêng.
const TTL = 30 * 24 * 60 * 60;

export async function GET() {
  const { error } = await requireMuaHang(); // chỉ admin/accountant
  if (error) return error;

  const secret = process.env.CLAUDE_WEB_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "no-secret" });

  const expiry = Math.floor(Date.now() / 1000) + TTL;
  const sig = crypto.createHmac("sha256", secret).update(String(expiry)).digest("hex");

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "claude_code_session",
    value: `${expiry}.${sig}`,
    domain: ".huynhgia6.com",
    path: "/",
    maxAge: TTL,
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
