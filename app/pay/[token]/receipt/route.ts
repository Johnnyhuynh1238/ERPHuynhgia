import path from "node:path";
import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function contentTypeFor(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

// Proxy ảnh chuyển khoản cho trang theo dõi công khai. Chỉ trả file của đúng
// lệnh chi khớp publicToken — không lộ file lệnh khác.
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const url = new URL(request.url);
  const index = Math.max(0, Number(url.searchParams.get("i") ?? "0") | 0);

  const expense = await prisma.expense.findUnique({
    where: { publicToken: params.token },
    select: { paidReceiptUrl: true, paidReceiptUrls: true, status: true },
  });
  if (!expense || expense.status !== "paid") {
    return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  }

  const list = expense.paidReceiptUrls?.length
    ? expense.paidReceiptUrls
    : expense.paidReceiptUrl
      ? [expense.paidReceiptUrl]
      : [];
  const stored = list[index] ?? null;
  if (!stored) return NextResponse.json({ message: "Không có file" }, { status: 404 });

  if (stored.startsWith("minio://")) {
    try {
      const obj = await getObjectFromMinio(stored.slice("minio://".length));
      return new NextResponse(new Uint8Array(obj.buffer), {
        headers: {
          "Content-Type": obj.contentType || contentTypeFor(stored),
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch {
      return NextResponse.json({ message: "Không đọc được file" }, { status: 502 });
    }
  }

  return NextResponse.redirect(stored);
}
