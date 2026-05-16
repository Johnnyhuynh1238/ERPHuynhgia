import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractWriteUser } from "@/lib/sub-contract-auth";

export async function DELETE(_request: Request, { params }: { params: { id: string; fileId: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const file = await prisma.subContractFile.findFirst({
    where: {
      id: params.fileId,
      subContractId: params.id,
    },
    select: {
      id: true,
      fileUrl: true,
    },
  });

  if (!file) {
    return NextResponse.json({ message: "Không tìm thấy tài liệu" }, { status: 404 });
  }

  await prisma.subContractFile.delete({ where: { id: file.id } });

  if (file.fileUrl.startsWith("minio://")) {
    await deleteObjectFromMinio(file.fileUrl.slice("minio://".length)).catch(() => {});
  } else {
    const absPath = path.join(process.cwd(), "public", file.fileUrl.replace(/^\//, ""));
    await fs.unlink(absPath).catch(() => {});
  }

  return NextResponse.json({ message: "Đã xóa tài liệu" });
}
