import { prisma } from "@/lib/prisma";

// Hồ sơ dự án cho KS màn gọn (/ks-ql/sub/[id]/ho-so): KS phụ trách (pm_engineer) chỉ thấy file /
// nhóm ảnh admin đã cấp quyền (nút "Phân quyền xem" ở /projects/[id]/documents) hoặc do KS tự tải lên.
export function ksDocWhere(userId: string) {
  return { OR: [{ uploadedBy: userId }, { accessList: { some: { userId } } }] };
}

export function ksDesignGroupWhere(userId: string) {
  return { OR: [{ createdBy: userId }, { accessList: { some: { userId } } }] };
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
