import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { notifyMaterialProposalNew } from "@/lib/notify-material-proposal";
import { parseProposalItems } from "@/lib/parse-proposal-items";

const createSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().trim().min(2).max(2000),
});

const ALLOWED_CREATE_ROLES = new Set<string>([UserRole.engineer, UserRole.admin]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!ALLOWED_CREATE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, description } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, name: true, code: true },
  });
  if (!project) {
    return NextResponse.json({ error: "project_not_accessible" }, { status: 403 });
  }

  const [ksRow, proposal] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    prisma.materialProposal.create({
      data: {
        ksId: user.id,
        projectId: project.id,
        description,
      },
      select: { id: true, createdAt: true },
    }),
  ]);

  notifyMaterialProposalNew({
    proposalId: proposal.id,
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    ksName: ksRow?.fullName || user.name || user.email || "KS",
    description,
    actorUserId: user.id,
  }).catch((err) => {
    console.error("[proposals.POST] notify failed", err);
  });

  // Fire-and-forget: parse description thành items, lưu vào parsed_items
  parseProposalItems(description)
    .then((items) => {
      if (!items) return;
      return prisma.materialProposal.update({
        where: { id: proposal.id },
        data: { parsedItems: items },
      });
    })
    .catch((err) => {
      console.error("[proposals.POST] parse failed", err?.message || err);
    });

  return NextResponse.json({ id: proposal.id, createdAt: proposal.createdAt }, { status: 201 });
}

const listSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(["pending", "accepted", "declined"]).optional(),
  orderStatus: z.enum(["not_ordered", "ordered", "received", "paid"]).optional(),
  ksId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ACCOUNTANT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    projectId: searchParams.get("projectId") || undefined,
    status: searchParams.get("status") || undefined,
    orderStatus: searchParams.get("orderStatus") || undefined,
    ksId: searchParams.get("ksId") || undefined,
    page: searchParams.get("page") || undefined,
    limit: searchParams.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const isAccountantView = ACCOUNTANT_ROLES.has(user.role);

  const where: Parameters<typeof prisma.materialProposal.findMany>[0] = { where: {} };
  if (parsed.data.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
      select: { id: true },
    });
    if (!proj) {
      return NextResponse.json({ error: "project_not_accessible" }, { status: 403 });
    }
    where.where = { ...where.where, projectId: proj.id };
  } else if (user.role === UserRole.engineer) {
    where.where = { ...where.where, ksId: user.id };
  }
  if (parsed.data.status) where.where = { ...where.where, status: parsed.data.status };
  if (parsed.data.orderStatus) where.where = { ...where.where, orderStatus: parsed.data.orderStatus };
  if (parsed.data.ksId && isAccountantView) {
    where.where = { ...where.where, ksId: parsed.data.ksId };
  }

  const [items, total] = await Promise.all([
    prisma.materialProposal.findMany({
      where: where.where,
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      skip: (parsed.data.page - 1) * parsed.data.limit,
      select: {
        id: true,
        description: true,
        status: true,
        orderStatus: true,
        parsedItems: true,
        processedNote: true,
        createdAt: true,
        acceptedAt: true,
        orderedAt: true,
        receivedAt: true,
        paidAt: true,
        ks: { select: { id: true, fullName: true } },
        project: { select: { id: true, code: true, name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.materialProposal.count({ where: where.where }),
  ]);

  return NextResponse.json({
    items,
    page: parsed.data.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / parsed.data.limit)),
    viewMode: isAccountantView ? "accountant" : "ks",
  });
}
