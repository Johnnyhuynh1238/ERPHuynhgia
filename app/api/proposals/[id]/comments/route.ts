import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  canCommentOnProposal,
  canViewProposal,
} from "@/lib/proposal-access";

export const runtime = "nodejs";

const postSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

async function loadProposal(id: string) {
  return prisma.materialProposal.findUnique({
    where: { id },
    select: { id: true, ksId: true },
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const proposal = await loadProposal(params.id);
  if (!proposal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canViewProposal(user.role, proposal.ksId, user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const comments = await prisma.materialProposalComment.findMany({
    where: { proposalId: params.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      authorRole: true,
      createdAt: true,
      author: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json({ comments });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canCommentOnProposal(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const proposal = await loadProposal(params.id);
  if (!proposal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canViewProposal(user.role, proposal.ksId, user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.flatten() }, { status: 400 });
  }

  const comment = await prisma.materialProposalComment.create({
    data: {
      proposalId: params.id,
      authorId: user.id,
      authorRole: user.role,
      body: parsed.data.body,
    },
    select: {
      id: true,
      body: true,
      authorRole: true,
      createdAt: true,
      author: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({ comment });
}
