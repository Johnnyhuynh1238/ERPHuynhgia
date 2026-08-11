import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { requireAdmin } from "@/lib/estimate";
import { estimateKeyPrefix } from "@/lib/estimate-detail";

export const runtime = "nodejs";

// GET ?key=... : stream 1 ảnh/PDF bản vẽ dự toán chi tiết của HĐ (admin).
// Chặn đọc ngoài phạm vi: key phải bắt đầu bằng estimate/contract/<id>/.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key.startsWith(estimateKeyPrefix(params.id))) {
    return NextResponse.json({ message: "Key không hợp lệ" }, { status: 400 });
  }

  try {
    const obj = await getObjectFromMinio(key);
    const isPdf = key.toLowerCase().endsWith(".pdf");
    return new NextResponse(new Uint8Array(obj.buffer), {
      headers: {
        "Content-Type": obj.contentType || (isPdf ? "application/pdf" : "image/jpeg"),
        "Content-Disposition": isPdf ? "inline" : "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "Không tìm thấy bản vẽ" }, { status: 404 });
  }
}
