import { SubContractStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractWriteUser } from "@/lib/sub-contract-auth";
import { serializeSubContract } from "@/lib/sub-contract-utils";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const row = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, projectId: true, code: true, title: true },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (row.status !== SubContractStatus.draft) {
    return NextResponse.json({ message: "Chỉ có thể kích hoạt từ trạng thái nháp" }, { status: 400 });
  }

  const updated = await prisma.subContract.update({
    where: { id: params.id },
    data: { status: SubContractStatus.active },
  });

  await logProjectActivity(prisma, {
    projectId: row.projectId,
    actorId: user.id,
    entity: "sub_contract",
    entityId: row.id,
    action: "activate",
    summary: `Kích hoạt HĐ thầu phụ ${row.code} "${row.title}"`,
    metadata: { previousStatus: row.status },
  });

  return NextResponse.json({
    contract: serializeSubContract(updated, true),
    message: "Đã kích hoạt hợp đồng",
  });
}
