import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";
import { canUserAccessSubContract, requireSubContractWriteUser } from "@/lib/sub-contract-auth";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
]);

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function extFromName(name: string) {
  const m = name.match(/\.([a-zA-Z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : "bin";
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
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ message: `File ${file.name} không thuộc định dạng cho phép (PDF, ảnh, doc/docx, xls/xlsx, zip, txt)` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: `File ${file.name} vượt quá 15MB` }, { status: 400 });
    }
  }

  const contractMeta = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, title: true },
  });

  const created = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const id = randomUUID();
    const ext = extFromName(file.name);
    const minioKey = `sub-contracts/${params.id}/${id}_${safeFilename(file.name)}.${ext}`;
    const contentType = file.type || "application/octet-stream";

    await putObjectToMinio({ key: minioKey, body: buffer, contentType });

    const row = await prisma.subContractFile.create({
      data: {
        id,
        subContractId: params.id,
        fileName: file.name,
        fileUrl: `minio://${minioKey}`,
        fileType: contentType,
        uploadedBy: user.id,
      },
      include: {
        uploader: {
          select: { id: true, fullName: true },
        },
      },
    });

    created.push({
      ...row,
      fileUrl: `/api/sub-contracts/${params.id}/files/${row.id}/file`,
    });
  }

  if (created.length > 0 && contractMeta) {
    await logProjectActivity(prisma, {
      projectId: access.projectId,
      actorId: user.id,
      entity: "sub_contract_file",
      entityId: params.id,
      action: "upload",
      summary: `Tải lên ${created.length} tài liệu cho HĐ thầu phụ ${contractMeta.code} "${contractMeta.title}": ${created.map((f) => f.fileName).join(", ")}`,
      metadata: {
        subContractId: params.id,
        fileCount: created.length,
        fileNames: created.map((f) => f.fileName),
        fileIds: created.map((f) => f.id),
      },
    });
  }

  return NextResponse.json({
    files: created,
    message: `Đã tải lên ${created.length} tài liệu`,
  });
}
