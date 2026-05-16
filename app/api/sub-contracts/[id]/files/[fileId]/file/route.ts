import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string; fileId: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const file = await prisma.subContractFile.findFirst({
    where: { id: params.fileId, subContractId: params.id },
    select: { fileName: true, fileUrl: true, fileType: true },
  });
  if (!file) return NextResponse.json({ message: "Không tìm thấy tài liệu" }, { status: 404 });

  const contentType = file.fileType || "application/octet-stream";
  const inline = contentType === "application/pdf" || contentType.startsWith("image/");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`;

  if (file.fileUrl.startsWith("minio://")) {
    try {
      const obj = await getObjectFromMinio(file.fileUrl.slice("minio://".length));
      return new NextResponse(new Uint8Array(obj.buffer), {
        status: 200,
        headers: {
          "Content-Type": obj.contentType || contentType,
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.json({ message: "Không đọc được file" }, { status: 502 });
    }
  }

  // Legacy: file vẫn ở public/uploads. Serve qua API thay vì để Next public-serve.
  const absPath = path.join(process.cwd(), "public", file.fileUrl.replace(/^\//, ""));
  try {
    const buffer = await fs.readFile(absPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Không đọc được file" }, { status: 404 });
  }
}
