import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { getObjectFromMinio } from "@/lib/minio";
import { isPrepDocStep, prepDocKey } from "@/lib/prep-docs";
import { PREP_STEPS } from "@/lib/prep-steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: xem hồ sơ PDF cố định của 1 mục chuẩn bị (inline).
export async function GET(_req: Request, { params }: { params: { id: string; step: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  if (!isPrepDocStep(params.step)) return NextResponse.json({ message: "Mục không hợp lệ" }, { status: 400 });

  let obj;
  try {
    obj = await getObjectFromMinio(prepDocKey(params.id, params.step));
  } catch {
    return NextResponse.json({ message: "Chưa có hồ sơ PDF" }, { status: 404 });
  }
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { code: true } });
  const label = PREP_STEPS.find((s) => s.key === params.step)?.label ?? params.step;
  const name = `${project?.code ?? "DA"} - ${label}.pdf`;
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7e]|"/g, "_");
  return new NextResponse(new Uint8Array(obj.buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
