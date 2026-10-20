import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notAdminOnlyGroupWhere } from "@/lib/project-doc-groups";

// Hồ sơ dự án cho KS màn gọn (/ks-ql/sub/[id]/ho-so): KS phụ trách (pm_engineer) chỉ thấy file PDF
// admin đã cấp quyền riêng, file thuộc nhóm hồ sơ bật quyền Kỹ sư (theo nhóm), hoặc do KS tự tải lên.
// Nhóm chỉ-admin (HĐ chủ nhà) luôn bị loại, kể cả file được cấp riêng.
// Ảnh 3D / thiết kế: mặc định KS phụ trách xem được toàn bộ (không cần cấp quyền).
export function ksDocWhere(userId: string): Prisma.ProjectDocumentWhereInput {
  return {
    AND: [
      {
        OR: [
          { uploadedBy: userId },
          { accessList: { some: { userId } } },
          { accessMode: "group", group: { permEngineer: true } },
        ],
      },
      notAdminOnlyGroupWhere,
    ],
  };
}

export function findKsProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberAssignments: { some: { userId, role: "pm_engineer" } },
    },
    select: { id: true, name: true, customerName: true },
  });
}
