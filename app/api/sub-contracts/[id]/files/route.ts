import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractWriteUser } from "@/lib/sub-contract-auth";

const MAX_BYTES = 15 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f) => f instanceof File) as File[];

  if (files.length === 0) {
    return NextResponse.json({ message: "Vui lòng chọn file" }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: `File ${file.name} vượt quá 15MB` }, { status: 400 });
    }
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "sub-contracts", params.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const created = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFilename(file.name)}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, buffer);

    const row = await prisma.subContractFile.create({
      data: {
        subContractId: params.id,
        fileName: file.name,
        fileUrl: `/uploads/sub-contracts/${params.id}/${fileName}`,
        fileType: file.type || "application/octet-stream",
        uploadedBy: user.id,
      },
      include: {
        uploader: {
          select: { id: true, fullName: true },
        },
      },
    });

    created.push(row);
  }

  return NextResponse.json({
    files: created,
    message: `Đã tải lên ${created.length} tài liệu`,
  });
}
