import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DesignViewer = { id: string; role: UserRole | string };

function isGlobalViewer(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export function buildDesignGroupVisibilityWhere(viewer: DesignViewer) {
  if (isGlobalViewer(viewer.role)) return {};
  return {
    OR: [
      { createdBy: viewer.id },
      { accessList: { some: { userId: viewer.id } } },
    ],
  };
}

export function canViewDesignGroupSync(
  viewer: DesignViewer,
  group: { createdBy?: string | null; accessList?: Array<{ userId: string }> },
) {
  if (isGlobalViewer(viewer.role)) return true;
  if (group.createdBy === viewer.id) return true;
  if (group.accessList?.some((a) => a.userId === viewer.id)) return true;
  return false;
}

export async function canViewDesignGroup(viewer: DesignViewer, groupId: string) {
  if (isGlobalViewer(viewer.role)) return true;
  const group = await prisma.designPhotoGroup.findUnique({
    where: { id: groupId },
    select: {
      createdBy: true,
      accessList: { where: { userId: viewer.id }, select: { id: true } },
    },
  });
  if (!group) return false;
  if (group.createdBy === viewer.id) return true;
  if (group.accessList.length > 0) return true;
  return false;
}

export function extractMinioKey(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("minio://")) return value.slice("minio://".length);
  try {
    return new URL(value, "http://local").searchParams.get("key");
  } catch {
    return null;
  }
}
