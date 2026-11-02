import { NextResponse } from "next/server";
import { esignContent, findEsignByToken } from "@/lib/acceptance-esign";
import { getObjectFromMinio } from "@/lib/minio";

export const runtime = "nodejs";

/** PDF biên bản đã ký — chỉ mở được bằng đúng token của BB đó. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = await findEsignByToken(params.token);
  if (!found || found.esign.status !== "xong" || !found.esign.pdfKey) {
    return new NextResponse("Không tìm thấy", { status: 404 });
  }
  const obj = await getObjectFromMinio(found.esign.pdfKey);
  const c = esignContent(found.esign);
  const name = `BB nghiem thu ${c.projectCode}.pdf`;
  return new NextResponse(new Uint8Array(obj.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
