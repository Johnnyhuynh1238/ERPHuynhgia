import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// Trang công khai khách xem báo giá (chỉ đọc). Token = quoteShareToken trên HĐ thiết kế.
// Đọc app tĩnh, nhúng đúng quoteData của token, ép read-only → không lộ file gốc (còn auth-gated).

let TEMPLATE: string | null = null;
async function template() {
  if (TEMPLATE == null) {
    TEMPLATE = await fs.readFile(path.join(process.cwd(), "public", "bao-gia-app.html"), "utf8");
  }
  return TEMPLATE;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY = { project: "", donGiaTho: 0, dienTich: [], thoNhanCong: 0, thoHangMuc: [], hoanThien: [] };

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  if (!UUID_RE.test(params.token)) {
    return new NextResponse("Không tìm thấy báo giá", { status: 404 });
  }

  const contract = await prisma.designContract.findUnique({
    where: { quoteShareToken: params.token },
    select: { quoteData: true },
  });
  if (!contract) {
    return new NextResponse("Không tìm thấy báo giá", { status: 404 });
  }

  const data = contract.quoteData ?? EMPTY;
  // < để không có chuỗi </script> phá tag; JSON.parse vẫn đọc lại đúng "<".
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  let html = await template();
  html = html.replace(/(<script id="db"[^>]*>)[\s\S]*?(<\/script>)/, `$1${json}$2`);
  html = html.replace(/(<script id="kl"[^>]*>)[\s\S]*?(<\/script>)/, `$1{}$2`);
  html = html.replace('<script id="db"', '<script>window.__RO=1;</script>\n<script id="db"');

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
