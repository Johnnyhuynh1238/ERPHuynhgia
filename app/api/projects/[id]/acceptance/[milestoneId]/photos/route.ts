import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { putObjectToMinio, deleteObjectFromMinio } from "@/lib/minio";
import {
  ACCEPTANCE_BB_TYPES,
  ACCEPTANCE_IMAGE_TYPES,
  ACCEPTANCE_MAX_BYTES,
  ACCEPTANCE_MAX_PER_KIND,
  ACCEPTANCE_UPLOAD_ROLES,
  acceptancePhotoField,
  parseAcceptanceKind,
  readAcceptancePhotos,
  type AcceptancePhoto,
} from "@/lib/acceptance-photos";

export const runtime = "nodejs";

const MAX_FILES_PER_REQUEST = 10;

function safeBaseName(name: string) {
  return (
    (name || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.(jpe?g|png|webp|pdf)$/i, "")
      .slice(0, 60) || "file"
  );
}

function extOf(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "jpg";
}

async function loadMilestone(user: { id: string; role: string }, projectId: string, milestoneId: string) {
  return prisma.acceptanceMilestone.findFirst({
    where: { id: milestoneId, projectId, project: buildProjectAccessWhere(user) },
  });
}

// Có ảnh BB giấy → đã nghiệm thu. Hết ảnh BB (và không có chữ ký cổng CN cũ) → quay về chờ.
function statusPatch(
  current: { signatureUrl: string | null; signedAt: Date | null },
  bienBan: AcceptancePhoto[],
): Prisma.AcceptanceMilestoneUpdateInput {
  if (bienBan.length > 0) return { status: "signed", signedAt: current.signedAt ?? new Date() };
  if (current.signatureUrl) return {};
  return { status: "pending", signedAt: null, signerName: null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ACCEPTANCE_UPLOAD_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const kind = parseAcceptanceKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ message: "kind phải là bien_ban|site" }, { status: 400 });

  const milestone = await loadMilestone({ id: user.id, role: user.role }, params.id, params.milestoneId);
  if (!milestone) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: "Form không hợp lệ" }, { status: 400 });
  }
  const files = [...formData.getAll("file"), ...formData.getAll("files")].filter((x): x is File => x instanceof File);
  if (!files.length) return NextResponse.json({ message: "Chọn ít nhất 1 file" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ message: `Tối đa ${MAX_FILES_PER_REQUEST} file / lần` }, { status: 400 });
  }
  const allowed = kind === "bien_ban" ? ACCEPTANCE_BB_TYPES : ACCEPTANCE_IMAGE_TYPES;
  for (const f of files) {
    if (!allowed.includes(f.type)) {
      const hint = kind === "bien_ban" ? "JPG/PNG/WEBP/PDF" : "JPG/PNG/WEBP";
      return NextResponse.json({ message: `${f.name}: chỉ nhận ${hint}` }, { status: 400 });
    }
    if (f.size > ACCEPTANCE_MAX_BYTES) return NextResponse.json({ message: `${f.name}: vượt 25MB` }, { status: 400 });
  }

  const field = acceptancePhotoField(kind);
  const existing = readAcceptancePhotos(milestone[field]).slice();
  if (existing.length + files.length > ACCEPTANCE_MAX_PER_KIND) {
    return NextResponse.json(
      { message: `Tối đa ${ACCEPTANCE_MAX_PER_KIND} file/loại (hiện có ${existing.length})` },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    if (file.type !== "application/pdf") {
      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // ignore
      }
    }
    const key = `acceptance/${milestone.projectId}/${milestone.id}/${kind}/${randomUUID()}-${safeBaseName(file.name)}.${extOf(file.type)}`;
    await putObjectToMinio({ key, body: buffer, contentType: file.type });
    existing.push({ key, contentType: file.type, width, height, name: file.name || "file", uploadedBy: user.id, uploadedAt: now });
  }

  const bienBan = kind === "bien_ban" ? existing : readAcceptancePhotos(milestone.bienBanPhotos);
  await prisma.acceptanceMilestone.update({
    where: { id: milestone.id },
    data: { [field]: existing as unknown as Prisma.InputJsonValue, ...statusPatch(milestone, bienBan) },
  });
  return NextResponse.json({ ok: true, message: `Đã tải ${files.length} file` });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ACCEPTANCE_UPLOAD_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const kind = parseAcceptanceKind(req.nextUrl.searchParams.get("kind"));
  const key = req.nextUrl.searchParams.get("key");
  if (!kind || !key) return NextResponse.json({ message: "Thiếu kind / key" }, { status: 400 });

  const milestone = await loadMilestone({ id: user.id, role: user.role }, params.id, params.milestoneId);
  if (!milestone) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });

  const field = acceptancePhotoField(kind);
  const all = readAcceptancePhotos(milestone[field]);
  const target = all.find((p) => p.key === key);
  if (!target) return NextResponse.json({ message: "Không tìm thấy file" }, { status: 404 });
  // KS chỉ xoá file mình tải; admin xoá được hết.
  if (user.role !== "admin" && target.uploadedBy !== user.id) {
    return NextResponse.json({ message: "Chỉ xoá được file do mình tải lên" }, { status: 403 });
  }

  const rest = all.filter((p) => p.key !== key);
  try {
    await deleteObjectFromMinio(key);
  } catch {
    // vẫn gỡ khỏi DB
  }
  const bienBan = kind === "bien_ban" ? rest : readAcceptancePhotos(milestone.bienBanPhotos);
  await prisma.acceptanceMilestone.update({
    where: { id: milestone.id },
    data: { [field]: rest as unknown as Prisma.InputJsonValue, ...statusPatch(milestone, bienBan) },
  });
  return NextResponse.json({ ok: true, message: "Đã xoá file" });
}
