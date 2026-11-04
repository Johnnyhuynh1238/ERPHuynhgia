import { NextResponse } from "next/server";
import { loadDiaryLinkView } from "@/lib/customer-diary-link";
import { getObjectFromMinio } from "@/lib/minio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ảnh thứ i của nhật ký trong link /nk/<mã>: chỉ lấy được ảnh nhật ký đã duyệt của đúng dự án + ngày của link,
// theo số thứ tự (không nhận key ảnh từ ngoài). Link hết hạn → 410.
export async function GET(_req: Request, { params }: { params: { code: string; i: string } }) {
  const view = await loadDiaryLinkView(params.code, { withProgress: false });
  if (view.state === "expired") return NextResponse.json({ message: "Link đã hết hạn" }, { status: 410 });
  if (view.state !== "ok") return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const index = /^\d{1,3}$/.test(params.i) ? Number(params.i) : -1;
  const photo = index >= 0 ? view.photos[index] : undefined;
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
