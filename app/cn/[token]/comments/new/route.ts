import { CommentTargetType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getClientIpFromHeaders } from "@/lib/customer-portal";
import { requireCustomerPortalApiAccess, validateCustomerCommentTarget } from "@/lib/customer-portal-v2";
import { fireAndForget, notifyCustomerComment } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function parseTargetType(value: string) {
  return Object.values(CommentTargetType).includes(value as CommentTargetType) ? (value as CommentTargetType) : null;
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) {
    if (access.status === 401) return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));
    return NextResponse.json({ message: access.message }, { status: access.status });
  }

  const formData = await request.formData();
  const taskIdRaw = String(formData.get("taskId") || "").trim();
  const eveningReportIdRaw = String(formData.get("eveningReportId") || "").trim();
  const targetTypeRaw = String(formData.get("targetType") || "").trim();
  const targetIdRaw = String(formData.get("targetId") || "").trim();
  const parentId = String(formData.get("parentId") || "").trim() || null;
  const content = String(formData.get("content") || "").trim();
  const referer = request.headers.get("referer") || `/cn/${params.token}/dashboard`;

  if (!content) return NextResponse.redirect(new URL(referer, request.url));

  const parsedTargetType = parseTargetType(targetTypeRaw);
  const targetType = parsedTargetType || (taskIdRaw ? CommentTargetType.task : eveningReportIdRaw ? CommentTargetType.journal_entry : CommentTargetType.project);
  const targetId = targetIdRaw || taskIdRaw || eveningReportIdRaw || access.project.id;

  const target = await validateCustomerCommentTarget(prisma, access.project.id, targetType, targetId);
  if (!target.ok) return NextResponse.json({ message: target.message }, { status: 400 });

  if (parentId) {
    const parent = await prisma.customerComment.findFirst({
      where: { id: parentId, projectId: access.project.id, targetType, targetId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ message: "Bình luận cha không hợp lệ" }, { status: 400 });
  }

  const created = await prisma.customerComment.create({
    data: {
      projectId: access.project.id,
      taskId: target.taskId,
      eveningReportId: target.eveningReportId,
      targetType,
      targetId,
      authorType: "customer",
      authorName: access.project.customerName,
      parentId,
      content,
      ipAddress: getClientIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent") || "",
      readByStaff: false,
    },
    select: { id: true, taskId: true },
  });

  fireAndForget(
    notifyCustomerComment({
      projectId: access.project.id,
      commentId: created.id,
      authorName: access.project.customerName,
      contentExcerpt: content.slice(0, 200),
      taskId: created.taskId,
    }),
  );

  return NextResponse.redirect(new URL(referer, request.url));
}
