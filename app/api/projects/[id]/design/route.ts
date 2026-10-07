import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { z } from "zod";
import { DESIGN_EXPENSE_SOURCES, DESIGN_STEPS } from "@/lib/design-steps";

// Màn GĐ 4 Thiết kế: dùng lại hồ sơ có sẵn của dự án.
// - Mặt bằng + bộ bản vẽ thi công = project_documents.design_step (bật khách xem → mục HỒ SƠ cổng chủ nhà).
// - 3D phối cảnh = nhóm ảnh thiết kế design_step 'phoi_canh' (băng ảnh trang chủ cổng).
// - Lệnh chi thiết kế thuê ngoài: expenses.source_type = thiet_ke_<bước>.
// - Chốt từng bước: project_pipelines.design_done {bước: ISO}.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const [docs, group, expenses, pipe] = await Promise.all([
    prisma.projectDocument.findMany({
      where: { projectId: params.id, designStep: { not: null } },
      orderBy: { uploadedAt: "asc" },
      select: {
        id: true,
        title: true,
        designStep: true,
        mimeType: true,
        fileSize: true,
      },
    }),
    prisma.designPhotoGroup.findFirst({
      where: { projectId: params.id, designStep: "phoi_canh" },
      select: {
        id: true,
        photos: {
          orderBy: [{ displayOrder: "asc" }, { uploadedAt: "asc" }],
          select: { id: true, caption: true, fileSizeKb: true },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        projectId: params.id,
        sourceType: { in: [...DESIGN_EXPENSE_SOURCES] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        amount: true,
        paidAmount: true,
        payee: true,
        note: true,
        status: true,
        sourceType: true,
      },
    }),
    prisma.projectPipeline.findUnique({
      where: { projectId: params.id },
      select: { designDone: true },
    }),
  ]);

  const docBase = `/api/projects/${params.id}/documents`;
  const photoBase = `/api/projects/${params.id}/design-photos`;
  const files = [
    ...docs.map((d) => ({
      id: d.id,
      name: d.title,
      designStep: d.designStep as string,
      isImage: d.mimeType.startsWith("image/"),
      sizeBytes: d.fileSize,
      viewUrl: `${docBase}/${d.id}/file`,
      thumbUrl: `${docBase}/${d.id}/file`,
      deleteUrl: `${docBase}/${d.id}`,
    })),
    ...(group?.photos || []).map((p, i) => ({
      id: p.id,
      name: p.caption || `Ảnh 3D ${i + 1}`,
      designStep: "phoi_canh",
      isImage: true,
      sizeBytes: p.fileSizeKb * 1024,
      viewUrl: `${photoBase}/${p.id}/file?variant=photo`,
      thumbUrl: `${photoBase}/${p.id}/file?variant=thumb`,
      deleteUrl: `/api/projects/${params.id}/design-groups/${group!.id}/photos/${p.id}`,
    })),
  ];

  return NextResponse.json({
    done: (pipe?.designDone || {}) as Record<string, string>,
    files,
    expenses: expenses.map((e) => ({
      id: e.id,
      code: e.code,
      amount: Number(e.paidAmount ?? e.amount),
      payee: e.payee,
      note: e.note,
      status: e.status,
      step: (e.sourceType || "").replace(/^thiet_ke_/, ""),
    })),
  });
}

// Lấy (hoặc tạo) nhóm ảnh "3D phối cảnh" bật khách xem, để màn Thiết kế tải ảnh vào.
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const existing = await prisma.designPhotoGroup.findFirst({
    where: { projectId: params.id, designStep: "phoi_canh" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ groupId: existing.id });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project)
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const created = await prisma.designPhotoGroup.create({
    data: {
      projectId: params.id,
      title: "3D phối cảnh",
      visibleToCustomer: true,
      designStep: "phoi_canh",
      displayOrder: -1,
      createdBy: user!.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ groupId: created.id });
}

const DoneSchema = z.object({
  step: z.enum(DESIGN_STEPS.map((s) => s.key) as [string, ...string[]]),
  done: z.boolean(),
});

// Chốt / mở lại 1 bước thiết kế.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = DoneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const pipe = await prisma.projectPipeline.findUnique({
    where: { projectId: params.id },
    select: { id: true, designDone: true },
  });
  if (!pipe)
    return NextResponse.json({ message: "Dự án chưa gắn tiến độ" }, { status: 404 });

  const next = { ...((pipe.designDone || {}) as Record<string, string>) };
  if (parsed.data.done) next[parsed.data.step] = new Date().toISOString();
  else delete next[parsed.data.step];

  await prisma.projectPipeline.update({
    where: { id: pipe.id },
    data: { designDone: next },
  });
  return NextResponse.json({ done: next });
}
