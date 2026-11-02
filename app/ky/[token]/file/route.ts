import { NextResponse } from "next/server";
import { esignKsData, findEsignByToken } from "@/lib/acceptance-esign";
import { getObjectFromMinio } from "@/lib/minio";

export const runtime = "nodejs";

/** Ảnh nghiệm thu KS chụp — chỉ trả ảnh nằm trong đúng BB của token (không mở ảnh BB khác). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const found = await findEsignByToken(params.token);
  const key = new URL(req.url).searchParams.get("key") || "";
  const photo = found ? (esignKsData(found.esign).photos ?? []).find((p) => p.key === key) : null;
  if (!photo) return new NextResponse("Không tìm thấy", { status: 404 });
  const obj = await getObjectFromMinio(photo.key);
  return new NextResponse(new Uint8Array(obj.buffer), {
    headers: { "content-type": photo.contentType, "cache-control": "private, max-age=3600" },
  });
}
