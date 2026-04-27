import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { mapCsvRowToTemplateData, parseTaskTemplateCsv } from "@/lib/task-template-csv";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const mode = (form.get("mode") || "preview").toString();

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Vui lòng chọn file CSV" }, { status: 400 });
  }

  const text = await file.text();

  let rows;
  try {
    rows = parseTaskTemplateCsv(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "CSV không hợp lệ";
    return NextResponse.json({ message: msg }, { status: 400 });
  }

  const mapped = rows.map((r) => mapCsvRowToTemplateData(r));

  const preview = [] as Array<{
    code: string;
    templateCategory: string;
    action: "create" | "update";
    name: string;
    phase: string;
    displayOrder: number;
  }>;

  for (const row of mapped) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { code: row.code, templateCategory: row.templateCategory },
      select: { id: true },
    });

    preview.push({
      code: row.code,
      templateCategory: row.templateCategory,
      action: existing ? "update" : "create",
      name: row.name,
      phase: row.phase,
      displayOrder: row.displayOrder,
    });
  }

  if (mode !== "confirm") {
    return NextResponse.json({
      mode: "preview",
      total: preview.length,
      preview,
    });
  }

  let created = 0;
  let updated = 0;

  for (const row of mapped) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { code: row.code, templateCategory: row.templateCategory },
      select: { id: true },
    });

    if (existing) {
      await prisma.taskTemplate.update({
        where: { id: existing.id },
        data: row,
      });
      updated += 1;
    } else {
      await prisma.taskTemplate.create({ data: row });
      created += 1;
    }
  }

  return NextResponse.json({
    mode: "confirm",
    created,
    updated,
    message: `Đã tạo mới ${created}, cập nhật ${updated} template`,
  });
}
