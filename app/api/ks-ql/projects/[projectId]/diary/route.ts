import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getWorkDateVn } from "@/lib/attendance";
import { diaryDateError } from "@/lib/diary-date";
import { putObjectToMinio, deleteObjectFromMinio } from "@/lib/minio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDateParam(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  return getWorkDateVn();
}

async function ensureKsProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberAssignments: { some: { userId, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
}

function startOfNextDay(d: Date) {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const entryDate = parseDateParam(req.nextUrl.searchParams.get("date"));
  const nextDay = startOfNextDay(entryDate);

  const diary = await prisma.constructionDiary.findUnique({
    where: {
      projectId_ksId_entryDate: {
        projectId: project.id,
        ksId: user.id,
        entryDate,
      },
    },
    include: { approvedBy: { select: { fullName: true } } },
  });

  // Luồng đề xuất/nhận VT của KS đã gỡ (dùng mua-hàng mới của KT) → không còn hoạt động VT tự động.
  const activities: Array<{
    kind: string;
    at: string;
    label: string;
    href: string;
    sub?: string;
  }> = [];

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    entryDate: entryDate.toISOString().slice(0, 10),
    diary: diary
      ? {
          id: diary.id,
          workerCount: diary.workerCount,
          tasksDone: diary.tasksDone,
          issues: diary.issues,
          taskPhotos: (diary.taskPhotos as unknown as Array<{ key: string; contentType: string }>) || [],
          sitePhotos: (diary.sitePhotos as unknown as Array<{ key: string; contentType: string }>) || [],
          savedAt: diary.savedAt?.toISOString() ?? null,
          approvedAt: diary.approvedAt?.toISOString() ?? null,
          approvedByName: diary.approvedBy?.fullName ?? null,
          updatedAt: diary.updatedAt.toISOString(),
        }
      : null,
    activities,
  });
}

type StoredPhoto = { key: string; contentType: string; width: number | null; height: number | null };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PHOTOS_PER_KIND = 20;

function safeBaseName(name: string) {
  return (
    (name || "img")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.(jpe?g|png|webp)$/i, "")
      .slice(0, 60) || "img"
  );
}

function parseKeys(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Chốt 1 lần: form + ảnh mới + ảnh xoá gửi chung 1 request (multipart).
// Bắt điền đủ 5 mục: số thợ, công việc, ≥1 ảnh hạng mục, ≥1 ảnh toàn cảnh, vấn đề phát sinh.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: "Form không hợp lệ" }, { status: 400 });
  }

  const dateRaw = form.get("date");
  const entryDate = parseDateParam(typeof dateRaw === "string" ? dateRaw : null);
  const dateErr = diaryDateError(entryDate);
  if (dateErr) return NextResponse.json({ message: dateErr }, { status: 400 });
  const workerCount = Math.max(0, Math.min(500, Math.floor(Number(form.get("workerCount")) || 0)));
  const tasksDone = String(form.get("tasksDone") ?? "").slice(0, 4000).trim();
  const issues = String(form.get("issues") ?? "").slice(0, 4000).trim();

  if (workerCount <= 0) {
    return NextResponse.json({ message: "Số thợ phải > 0" }, { status: 400 });
  }
  if (!tasksDone) {
    return NextResponse.json({ message: "Cần điền mục công việc hôm nay" }, { status: 400 });
  }
  if (!issues) {
    return NextResponse.json(
      { message: "Cần điền mục vấn đề phát sinh (không có thì ghi \"Không có\")" },
      { status: 400 },
    );
  }

  const newFiles = {
    task: form.getAll("taskFiles").filter((x): x is File => x instanceof File),
    site: form.getAll("siteFiles").filter((x): x is File => x instanceof File),
  };
  for (const f of [...newFiles.task, ...newFiles.site]) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json({ message: `${f.name}: không phải JPG/PNG/WEBP` }, { status: 400 });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ message: `${f.name}: vượt 25MB` }, { status: 400 });
    }
  }
  const removeKeys = {
    task: new Set(parseKeys(form.get("removeTask"))),
    site: new Set(parseKeys(form.get("removeSite"))),
  };

  const key = { projectId: project.id, ksId: user.id, entryDate };
  const existing = await prisma.constructionDiary.findUnique({
    where: { projectId_ksId_entryDate: key },
    select: { id: true, approvedAt: true, taskPhotos: true, sitePhotos: true },
  });
  if (existing?.approvedAt) {
    return NextResponse.json(
      { message: "Nhật ký đã được ADMIN duyệt, không sửa được" },
      { status: 403 },
    );
  }

  const kept = {
    task: ((existing?.taskPhotos as unknown as StoredPhoto[]) || []).filter((p) => !removeKeys.task.has(p.key)),
    site: ((existing?.sitePhotos as unknown as StoredPhoto[]) || []).filter((p) => !removeKeys.site.has(p.key)),
  };
  const removed = [
    ...((existing?.taskPhotos as unknown as StoredPhoto[]) || []).filter((p) => removeKeys.task.has(p.key)),
    ...((existing?.sitePhotos as unknown as StoredPhoto[]) || []).filter((p) => removeKeys.site.has(p.key)),
  ].map((p) => p.key);

  for (const kind of ["task", "site"] as const) {
    const label = kind === "task" ? "ảnh hạng mục" : "ảnh toàn cảnh";
    const total = kept[kind].length + newFiles[kind].length;
    if (total < 1) {
      return NextResponse.json({ message: `Cần ít nhất 1 ${label}` }, { status: 400 });
    }
    if (total > MAX_PHOTOS_PER_KIND) {
      return NextResponse.json({ message: `Tối đa ${MAX_PHOTOS_PER_KIND} ${label}` }, { status: 400 });
    }
  }

  const ymd = entryDate.toISOString().slice(0, 10);
  const uploaded: string[] = [];
  let saved;
  try {
    for (const kind of ["task", "site"] as const) {
      for (const file of newFiles[kind]) {
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
        const objKey = `construction-diary/${project.id}/${user.id}/${ymd}/${kind}/${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
        await putObjectToMinio({ key: objKey, body: buffer, contentType: file.type });
        uploaded.push(objKey);
        kept[kind].push({ key: objKey, contentType: file.type, width, height });
      }
    }

    const now = new Date();
    const data = {
      workerCount,
      tasksDone,
      issues,
      taskPhotos: kept.task as unknown as Prisma.InputJsonValue,
      sitePhotos: kept.site as unknown as Prisma.InputJsonValue,
      savedAt: now,
    };
    saved = await prisma.constructionDiary.upsert({
      where: { projectId_ksId_entryDate: key },
      create: { ...key, ...data },
      update: data,
    });
  } catch (err) {
    await Promise.all(uploaded.map((k) => deleteObjectFromMinio(k).catch(() => undefined)));
    throw err;
  }

  // Ảnh bị xoá: chỉ gỡ khỏi MinIO sau khi DB đã lưu.
  await Promise.all(removed.map((k) => deleteObjectFromMinio(k).catch(() => undefined)));

  return NextResponse.json({
    ok: true,
    diary: {
      id: saved.id,
      workerCount: saved.workerCount,
      tasksDone: saved.tasksDone,
      issues: saved.issues,
      savedAt: saved.savedAt?.toISOString() ?? null,
    },
  });
}
