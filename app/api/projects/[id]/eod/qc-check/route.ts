import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canTickQcCheck, parseQcChecklist } from "@/lib/qc-mapping";
import { putObjectToMinio } from "@/lib/minio";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

const VALID_STATUS = new Set(["pending", "passed", "failed"]);

function safeBaseName(name: string) {
  return (name || "qc").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(jpe?g|png|webp)$/i, "").slice(0, 60) || "qc";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canTickQcCheck({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Dữ liệu form không hợp lệ" }, { status: 400 });
  }

  const outputId = String(formData.get("outputId") || "");
  const itemIndexRaw = String(formData.get("itemIndex") || "");
  const status = String(formData.get("status") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 300) || null;
  const file = formData.get("file");
  const clearPhoto = String(formData.get("clearPhoto") || "") === "1";

  const itemIndex = Number.parseInt(itemIndexRaw, 10);
  if (!outputId || Number.isNaN(itemIndex) || itemIndex < 0) {
    return NextResponse.json({ message: "Thiếu outputId/itemIndex" }, { status: 400 });
  }
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json({ message: "Trạng thái không hợp lệ" }, { status: 400 });
  }

  const output = await prisma.workOrderOutput.findFirst({
    where: { id: outputId, projectId: params.id },
    select: {
      id: true,
      date: true,
      workOrder: { select: { budgetItem: { select: { qcChecklist: true } } } },
    },
  });
  if (!output) return NextResponse.json({ message: "Không tìm thấy sản lượng" }, { status: 404 });

  const checklist = parseQcChecklist(output.workOrder.budgetItem.qcChecklist);
  if (itemIndex >= checklist.length) {
    return NextResponse.json({ message: "Mục QC không tồn tại" }, { status: 400 });
  }
  const itemTitle = checklist[itemIndex].title;

  let photoKey: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ message: "Ảnh phải là JPG/PNG/WEBP" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: "Ảnh vượt 25MB" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const dateStr = output.date.toISOString().slice(0, 10);
    photoKey = `eod-qc/${params.id}/${dateStr}/${output.id}/${itemIndex}-${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
    await putObjectToMinio({ key: photoKey, body: buffer, contentType: file.type });
  }

  const check = await prisma.workOrderOutputQcCheck.upsert({
    where: { outputId_itemIndex: { outputId, itemIndex } },
    create: {
      outputId,
      itemIndex,
      itemTitle,
      status: status as "pending" | "passed" | "failed",
      photoKey: photoKey ?? null,
      note,
      checkedById: user.id,
      checkedAt: new Date(),
    },
    update: {
      itemTitle,
      status: status as "pending" | "passed" | "failed",
      ...(photoKey ? { photoKey } : clearPhoto ? { photoKey: null } : {}),
      note,
      checkedById: user.id,
      checkedAt: new Date(),
    },
    select: { id: true, status: true, photoKey: true },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order_output_qc_check",
    entityId: check.id,
    action: "upsert",
    summary: `QC "${itemTitle}" → ${status}`,
    metadata: { outputId, itemIndex, status },
  });

  return NextResponse.json({ ok: true, check });
}
