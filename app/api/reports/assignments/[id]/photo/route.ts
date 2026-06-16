import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { validateProgressPhotoFreshness } from "@/lib/photo-validation";
import { requireEngineerForTodayAssignment } from "../../_helpers";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function safeExt(value: string | null) {
  const v = (value || "jpg").toLowerCase();
  return v === "png" || v === "webp" || v === "jpg" ? v : "jpg";
}

function contentTypeFromExt(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireEngineerForTodayAssignment(params.id);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Vui lòng chọn ảnh" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ message: "File không đúng định dạng ảnh (jpg/png/webp)" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: "Ảnh vượt quá 25MB" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const originalLastModifiedRaw = formData.get("originalLastModified");
    const originalLastModified = originalLastModifiedRaw ? Number(originalLastModifiedRaw) : null;

    const freshness = await validateProgressPhotoFreshness(
      buffer,
      file.name,
      originalLastModified ?? (file.lastModified || null),
    );
    if (!freshness.ok) {
      return NextResponse.json({ message: freshness.message }, { status: 400 });
    }

    const ext = extFromMime(file.type);
    const photoId = randomUUID();
    const key = `report-photos/${params.id}/${photoId}.${ext}`;

    await putObjectToMinio({ key, body: buffer, contentType: file.type });

    const photoUrl = `/api/reports/assignments/${params.id}/photo?p=${photoId}&e=${ext}`;
    return NextResponse.json({ photoUrl });
  } catch (error) {
    console.error("Report assignment photo upload failed", error);
    return NextResponse.json({ message: "Upload ảnh thất bại" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const url = new URL(request.url);
  const photoId = url.searchParams.get("p") || "";
  const ext = safeExt(url.searchParams.get("e"));
  if (!photoId.match(/^[a-f0-9-]{36}$/)) {
    return NextResponse.json({ message: "Tham số không hợp lệ" }, { status: 400 });
  }

  const assignment = await prisma.taskDailyAssignment.findUnique({
    where: { id: params.id },
    select: {
      ksUserId: true,
      projectId: true,
      tptcAssignment: { select: { projectId: true, assignedByUserId: true } },
    },
  });
  if (!assignment) return NextResponse.json({ message: "Không tìm thấy nhiệm vụ" }, { status: 404 });

  const projectId = assignment.projectId || assignment.tptcAssignment?.projectId || null;
  const isOwner = assignment.ksUserId === user.id;
  const isTptcAssigner = assignment.tptcAssignment?.assignedByUserId === user.id;
  const isAdmin = user.role === "admin";
  const isTptc = user.role === "construction_manager";
  let allowed = isOwner || isTptcAssigner || isAdmin;
  if (!allowed && isTptc && projectId) {
    const member = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id },
      select: { id: true },
    });
    allowed = Boolean(member);
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền xem ảnh" }, { status: 403 });
  }

  const key = `report-photos/${params.id}/${photoId}.${ext}`;
  try {
    const { buffer, contentType } = await getObjectFromMinio(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType || contentTypeFromExt(ext),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ message: "Ảnh không tồn tại" }, { status: 404 });
  }
}
