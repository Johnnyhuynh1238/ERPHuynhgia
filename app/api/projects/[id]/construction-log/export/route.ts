import { NextResponse } from "next/server";
import { GET as getPdfExport } from "@/app/api/projects/[id]/construction-log/export/pdf/route";
import { GET as getXlsxExport } from "@/app/api/projects/[id]/construction-log/export/xlsx/route";

export async function GET(request: Request, context: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (format === "pdf") {
    return getPdfExport(request, context);
  }

  if (format === "xlsx") {
    return getXlsxExport(request, context);
  }

  return NextResponse.json({ message: "format không hợp lệ, chỉ hỗ trợ pdf|xlsx" }, { status: 400 });
}
