import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { parseSubContractFileToken } from "@/lib/sub-contract-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// File HĐ thầu phụ công khai (CHỈ ĐỌC) cho bên B — tự auth bằng token HMAC trên URL.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const fileId = parseSubContractFileToken(params.token);
  if (!fileId) return new NextResponse("Link không hợp lệ", { status: 404 });

  const file = await prisma.subContractFile.findUnique({
    where: { id: fileId },
    select: { fileName: true, fileUrl: true, fileType: true },
  });
  if (!file || !file.fileUrl.startsWith("minio://")) {
    return new NextResponse("Không tìm thấy hợp đồng", { status: 404 });
  }

  try {
    const obj = await getObjectFromMinio(file.fileUrl.slice("minio://".length));
    const contentType = obj.contentType || file.fileType || "application/pdf";
    const inline = contentType === "application/pdf";
    return new NextResponse(new Uint8Array(obj.buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new NextResponse("Không đọc được file", { status: 502 });
  }
}
