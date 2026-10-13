import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { listCompanyDocs } from "@/lib/company-docs";
import { isBidViewableDoc, newBidSlug } from "@/lib/bid-invite";

export const dynamic = "force-dynamic";

const SELECT = {
  bidSlug: true,
  bidPublishedAt: true,
  bidNote: true,
  bidDocKeys: true,
} as const;

function docKeys(raw: unknown) {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

function shape(row: { bidSlug: string | null; bidPublishedAt: Date | null; bidNote: string | null; bidDocKeys: unknown }) {
  return {
    slug: row.bidSlug,
    publishedAt: row.bidPublishedAt ? row.bidPublishedAt.toISOString() : null,
    note: row.bidNote || "",
    docKeys: docKeys(row.bidDocKeys),
  };
}

// Mời thầu nhân công: trạng thái link + Tài liệu chung xem được (PDF/ảnh) để chọn HĐ thầu phụ mẫu.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const row = await prisma.projectPipeline.findUnique({ where: { id: params.id }, select: SELECT });
  if (!row) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const docs = (await listCompanyDocs().then((r) => r.docs).catch(() => []))
    .filter((d) => isBidViewableDoc(d.key))
    .map((d) => ({ key: d.key, folder: d.folder, fileName: d.fileName }));
  return NextResponse.json({ bid: shape(row), docs });
}

const PatchSchema = z.object({
  published: z.boolean().optional(),
  note: z.string().max(20000).optional(),
  docKeys: z.array(z.string().max(400)).max(10).optional(),
  // Đổi mã link: link cũ chết ngay (thu hồi khi gửi nhầm / hết mời thầu).
  newLink: z.literal(true).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const body = parsed.data;

  const row = await prisma.projectPipeline.findUnique({ where: { id: params.id }, select: SELECT });
  if (!row) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const data: Prisma.ProjectPipelineUpdateInput = {};
  if (!row.bidSlug || body.newLink) data.bidSlug = newBidSlug();
  if (body.published !== undefined) data.bidPublishedAt = body.published ? new Date() : null;
  if (body.note !== undefined) data.bidNote = body.note.trim() || null;
  if (body.docKeys !== undefined) data.bidDocKeys = body.docKeys.filter(isBidViewableDoc);

  const saved = await prisma.projectPipeline.update({ where: { id: params.id }, data, select: SELECT });
  return NextResponse.json({ bid: shape(saved) });
}
