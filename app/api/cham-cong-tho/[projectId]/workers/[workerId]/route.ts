import { randomUUID } from "node:crypto";
import { WorkerRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ATTENDANCE_ALLOWED_MIME, ATTENDANCE_MAX_PHOTO_BYTES } from "@/lib/attendance";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function assertProjectAccess(userId: string, role: string, projectId: string) {
  if (role === "admin") return true;
  const membership = await prisma.projectMemberAssignment.findFirst({
    where: { userId, projectId },
    select: { id: true },
  });
  return Boolean(membership);
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const ok = await assertProjectAccess(user.id, user.role, params.projectId);
  if (!ok) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.projectId },
    select: { id: true, idCardPhotoUrl: true },
  });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy thợ" }, { status: 404 });

  const fd = await request.formData().catch(() => null);
  if (!fd) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const data: {
    fullName?: string;
    phone?: string | null;
    role?: WorkerRole;
    idCardPhotoUrl?: string;
  } = {};

  if (fd.has("fullName")) {
    const fullName = String(fd.get("fullName") || "").trim();
    if (!fullName) return NextResponse.json({ message: "Thiếu họ tên" }, { status: 400 });
    if (fullName.length > 100) return NextResponse.json({ message: "Họ tên quá dài" }, { status: 400 });
    data.fullName = fullName;
  }
  if (fd.has("phone")) {
    const phone = String(fd.get("phone") || "").trim();
    if (phone && !/^[0-9+\-\s().]{6,20}$/.test(phone)) {
      return NextResponse.json({ message: "Số điện thoại không hợp lệ" }, { status: 400 });
    }
    data.phone = phone || null;
  }
  if (fd.has("role")) {
    const roleRaw = String(fd.get("role") || "").trim();
    data.role = roleRaw === "phu" ? WorkerRole.phu : WorkerRole.tho;
  }

  const idCardFile = fd.get("idCard");
  if (idCardFile && idCardFile instanceof File && idCardFile.size > 0) {
    if (!ATTENDANCE_ALLOWED_MIME.has(idCardFile.type)) {
      return NextResponse.json({ message: "Ảnh CCCD sai định dạng" }, { status: 400 });
    }
    if (idCardFile.size > ATTENDANCE_MAX_PHOTO_BYTES) {
      return NextResponse.json({ message: "Ảnh CCCD quá lớn" }, { status: 400 });
    }
    const id = randomUUID();
    const ext = extFromMime(idCardFile.type);
    const key = `worker-id-card/${params.projectId}/${id}.${ext}`;
    const buffer = Buffer.from(await idCardFile.arrayBuffer());
    await putObjectToMinio({ key, body: buffer, contentType: idCardFile.type });
    data.idCardPhotoUrl = key;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  const worker = await prisma.worker.update({
    where: { id: params.workerId },
    data,
    select: {
      id: true,
      fullName: true,
      phone: true,
      role: true,
      sortRank: true,
      idCardPhotoUrl: true,
    },
  });

  return NextResponse.json({
    ok: true,
    worker: {
      id: worker.id,
      fullName: worker.fullName,
      phone: worker.phone,
      role: worker.role,
      sortRank: worker.sortRank,
      hasIdCardPhoto: Boolean(worker.idCardPhotoUrl),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const ok = await assertProjectAccess(user.id, user.role, params.projectId);
  if (!ok) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.projectId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy thợ" }, { status: 404 });

  await prisma.worker.update({
    where: { id: params.workerId },
    data: { status: "inactive" },
  });

  return NextResponse.json({ ok: true });
}
