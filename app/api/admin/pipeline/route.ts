import { NextResponse } from "next/server";
import { z } from "zod";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { slugify, validateSlug } from "@/lib/pipeline";

const CreateSchema = z.object({
  name: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  slug: z.string().trim().optional(),
});

const DAY_MS = 86400000;

// Danh sách màn Dự án (admin, PC): dự án theo tiến độ (project_pipelines) + dự án thi công
// có sẵn chưa gắn pipeline (projects) — dự án cũ coi như đang ở giai đoạn 6/7 (Thi công/Bàn giao).
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [pipes, projects] = await Promise.all([
    prisma.projectPipeline.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        customerName: true,
        customerPhone: true,
        address: true,
        slug: true,
        stage: true,
        status: true,
        stageDates: true,
        versions: { select: { versionNo: true, descriptionUpdatedAt: true } },
        projectId: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      where: { pipeline: null },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        customerName: true,
        address: true,
        contractValue: true,
        startDate: true,
        expectedEndDate: true,
        status: true,
        projectManager: { select: { fullName: true } },
        mainEngineer: { select: { fullName: true } },
      },
    }),
  ]);

  const ids = projects.map((p) => p.id);
  const [inspectedCounts, validCounts] = await Promise.all([
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        isActive: true,
        status: TaskStatus.inspected,
      },
      _count: { projectId: true },
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        isActive: true,
        NOT: { status: TaskStatus.na },
      },
      _count: { projectId: true },
    }),
  ]);
  const inspectedMap = new Map(
    inspectedCounts.map((x) => [x.projectId, x._count.projectId]),
  );
  const validMap = new Map(
    validCounts.map((x) => [x.projectId, x._count.projectId]),
  );

  const now = Date.now();

  const pipelineRows = pipes.map((p) => ({
    kind: "pipeline" as const,
    id: p.id,
    code: null as string | null,
    name: p.name,
    customerName: p.customerName,
    address: p.address || "",
    slug: p.slug,
    stage: p.stage,
    status: p.status,
    lateDays: 0,
    stageDates: (p.stageDates || {}) as Record<string, string>,
    hasDescription: p.versions.some((v) => Boolean(v.descriptionUpdatedAt)),
    contractValue: null as number | null,
    engineer: null as string | null,
    manager: null as string | null,
    startDate: p.createdAt.toISOString(),
    endDate: null as string | null,
    progressPercent: 0,
    taskCount: 0,
    planning: false,
  }));

  const projectRows = projects.map((p) => {
    const totalTasks = validMap.get(p.id) || 0;
    const inspected = inspectedMap.get(p.id) || 0;
    const done = p.status === "completed";
    const late = !done
      ? Math.floor((now - new Date(p.expectedEndDate).getTime()) / DAY_MS)
      : 0;
    return {
      kind: "project" as const,
      id: p.id,
      code: p.code as string | null,
      name: p.name,
      customerName: p.customerName,
      address: p.address || "",
      slug: null as string | null,
      stage: done ? 7 : 6,
      status: done ? "done" : p.status === "paused" ? "paused" : "active",
      lateDays: late > 0 ? late : 0,
      stageDates: {} as Record<string, string>,
      hasDescription: false,
      contractValue: p.contractValue === null ? null : Number(p.contractValue),
      engineer: p.mainEngineer?.fullName || null,
      manager: p.projectManager?.fullName || null,
      startDate: p.startDate.toISOString(),
      endDate: p.expectedEndDate.toISOString() as string | null,
      progressPercent:
        totalTasks > 0 ? Math.round((inspected / totalTasks) * 100) : 0,
      taskCount: totalTasks,
      planning: p.status === "planning",
    };
  });

  // Dự án đi càng xa càng xuống dưới: GĐ 1 Mô tả ở đầu → GĐ 7 đã bàn giao ở cuối.
  // Cùng GĐ: đang chạy trước, tạm dừng/xong sau; rồi mới nhất trước.
  const statusRank = (s: string) => (s === "done" ? 2 : s === "paused" ? 1 : 0);
  const rows = [...pipelineRows, ...projectRows].sort(
    (a, b) =>
      a.stage - b.stage ||
      statusRank(a.status) - statusRank(b.status) ||
      b.startDate.localeCompare(a.startDate),
  );

  return NextResponse.json({ rows });
}

// Tạo dự án mới ở giai đoạn 1 · Mô tả. Link khách = huynhgia6.com/<slug> (tự sinh từ tên dự án nếu bỏ trống).
export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Cần nhập tên dự án và tên khách hàng" },
      { status: 400 },
    );
  }
  const { name, customerName, customerPhone, address } = parsed.data;
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);

  const slugError = validateSlug(slug);
  if (slugError)
    return NextResponse.json({ message: slugError }, { status: 400 });

  const existed = await prisma.projectPipeline.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existed) {
    return NextResponse.json(
      { message: `Link "${slug}" đã dùng cho dự án khác, đổi tên link` },
      { status: 409 },
    );
  }

  const created = await prisma.projectPipeline.create({
    data: {
      name,
      customerName,
      customerPhone: customerPhone || null,
      address: address || null,
      slug,
      createdById: user?.id ?? null,
      versions: { create: { versionNo: 1 } },
    },
    select: { id: true, slug: true },
  });
  return NextResponse.json(created, { status: 201 });
}
