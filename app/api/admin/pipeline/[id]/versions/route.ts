import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { loadPipelineState } from "@/lib/pipeline-server";

const CreateSchema = z.object({
  note: z.string().trim().max(200).nullable().optional(),
});

// Tạo phiên bản mới (mô tả mới + báo giá mới, cùng số). Khách đổi ý sau công bố (SOP-10 bước 16)
// → chỉ thêm phiên bản, giữ nguyên giai đoạn, ngày giai đoạn và phiên bản chốt HĐ.
// Từ giai đoạn 3 (Hợp đồng) trở đi không tạo phiên bản: đổi sau ký đi phụ lục HĐ (SOP-11).
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: "Ghi chú quá dài (tối đa 200 ký tự)" },
      { status: 400 },
    );

  const current = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: { stage: true, versions: { select: { versionNo: true } } },
  });
  if (!current)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );
  if (current.stage >= 3) {
    return NextResponse.json(
      {
        message:
          "Dự án đã sang giai đoạn Hợp đồng. Khách đổi yêu cầu sau ký thì làm phụ lục hợp đồng, không tạo phiên bản mới.",
      },
      { status: 409 },
    );
  }

  const nos = current.versions.map((v) => v.versionNo);
  const nextNo = nos.length ? Math.max.apply(null, nos) + 1 : 1;

  await prisma.projectPipelineVersion.create({
    data: {
      pipelineId: params.id,
      versionNo: nextNo,
      note: parsed.data.note || null,
    },
  });

  return NextResponse.json(await loadPipelineState(params.id), { status: 201 });
}
