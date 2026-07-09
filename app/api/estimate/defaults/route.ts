import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: mẫu mô tả chung. ?name=Móng → 1 mẫu; không name → toàn bộ danh sách.
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (name) {
    const d = await prisma.estimateItemDefault.findUnique({ where: { name } });
    return NextResponse.json({ default: d ? { name: d.name, method: d.method, fields: d.fields } : null });
  }
  const list = await prisma.estimateItemDefault.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ defaults: list.map((d) => ({ name: d.name, method: d.method, fields: d.fields })) });
}

// PUT: lưu mẫu chung cho 1 hạng mục (upsert theo name). body {name, method}
export async function PUT(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên hạng mục" }, { status: 400 });
  const method = String(body.method ?? "").trim() || null;
  // fields (tuỳ chọn): mảng nhãn dòng ["Loại móng", …]
  const hasFields = Array.isArray(body.fields);
  const fields = hasFields
    ? (body.fields as unknown[]).map((f) => String(f ?? "").trim()).filter(Boolean)
    : undefined;

  const d = await prisma.estimateItemDefault.upsert({
    where: { name },
    create: { name, method, fields: fields ?? [] },
    update: { method, ...(fields ? { fields } : {}) },
  });
  return NextResponse.json({ default: { name: d.name, method: d.method, fields: d.fields } });
}
