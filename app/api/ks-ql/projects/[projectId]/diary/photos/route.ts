import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio, deleteObjectFromMinio } from "@/lib/minio";
import { getWorkDateVn } from "@/lib/attendance";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_PHOTOS_PER_KIND = 20;

type StoredPhoto = { key: string; contentType: string; width: number | null; height: number | null };

function safeBaseName(name: string) {
  return (
    (name || "img")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.(jpe?g|png|webp)$/i, "")
      .slice(0, 60) || "img"
  );
}

function parseDate(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  return getWorkDateVn();
}

function readFiles(formData: FormData) {
  return [...formData.getAll("file"), ...formData.getAll("files")].filter(
    (x): x is File => x instanceof File,
  );
}

async function ensureKsProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberAssignments: { some: { userId, role: "pm_engineer" } },
    },
    select: { id: true },
  });
}

async function loadDiary(projectId: string, ksId: string, entryDate: Date) {
  return prisma.constructionDiary.findUnique({
    where: { projectId_ksId_entryDate: { projectId, ksId, entryDate } },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "task" && kind !== "site") {
    return NextResponse.json({ message: "kind phải là task|site" }, { status: 400 });
  }
  const entryDate = parseDate(url.searchParams.get("date"));

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: "Form không hợp lệ" }, { status: 400 });
  }
  const files = readFiles(formData);
  if (!files.length) return NextResponse.json({ message: "Chọn ít nhất 1 ảnh" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ message: `Tối đa ${MAX_FILES_PER_REQUEST} ảnh / lần` }, { status: 400 });
  }
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json({ message: `${f.name}: không phải JPG/PNG/WEBP` }, { status: 400 });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ message: `${f.name}: vượt 25MB` }, { status: 400 });
    }
  }

  const diary = await loadDiary(project.id, user.id, entryDate);
  if (!diary || !diary.savedAt) {
    return NextResponse.json(
      { message: "Hãy chốt nhật ký trước khi tải ảnh" },
      { status: 400 },
    );
  }
  const field = kind === "task" ? "taskPhotos" : "sitePhotos";
  const existing = ((diary[field] as unknown as StoredPhoto[]) || []).slice();
  if (existing.length + files.length > MAX_PHOTOS_PER_KIND) {
    return NextResponse.json(
      { message: `Tối đa ${MAX_PHOTOS_PER_KIND} ảnh/loại (hiện có ${existing.length})` },
      { status: 400 },
    );
  }

  const ymd = entryDate.toISOString().slice(0, 10);
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // ignore
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `construction-diary/${project.id}/${user.id}/${ymd}/${kind}/${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
    await putObjectToMinio({ key, body: buffer, contentType: file.type });
    existing.push({ key, contentType: file.type, width, height });
  }

  await prisma.constructionDiary.update({
    where: { id: diary.id },
    data: { [field]: existing as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, photos: existing });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const key = url.searchParams.get("key");
  if (kind !== "task" && kind !== "site") {
    return NextResponse.json({ message: "kind phải là task|site" }, { status: 400 });
  }
  if (!key) return NextResponse.json({ message: "Thiếu key ảnh" }, { status: 400 });
  const entryDate = parseDate(url.searchParams.get("date"));

  const diary = await prisma.constructionDiary.findUnique({
    where: { projectId_ksId_entryDate: { projectId: project.id, ksId: user.id, entryDate } },
  });
  if (!diary) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const field = kind === "task" ? "taskPhotos" : "sitePhotos";
  const photos = ((diary[field] as unknown as StoredPhoto[]) || []).filter((p) => p.key !== key);

  try {
    await deleteObjectFromMinio(key);
  } catch {
    // ignore — still remove from DB
  }

  await prisma.constructionDiary.update({
    where: { id: diary.id },
    data: { [field]: photos as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, photos });
}
