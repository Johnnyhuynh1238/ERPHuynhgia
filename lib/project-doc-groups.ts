import { Prisma, ProjectDocumentCategory, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Nhóm hồ sơ dự án theo chức năng. 5 nhóm gốc (system_key) + nhóm admin tự tạo.
// Nhóm mẫu (project_id NULL) được copy sang dự án qua hàm DB ensure_project_doc_groups().
export {
  SYSTEM_GROUP_KEYS, DOC_STATUSES, DOC_STATUS_LABEL, CAD_EXTENSIONS, fileExtension, isCadFile,
} from "./project-doc-groups-shared";
export type { SystemGroupKey, DocStatus, DocGroupDto, ProjectDocDto } from "./project-doc-groups-shared";
import { isCadFile, type DocGroupDto, type ProjectDocDto } from "./project-doc-groups-shared";

export async function ensureProjectDocGroups(projectId: string) {
  await prisma.$executeRaw`SELECT ensure_project_doc_groups(${projectId}::uuid)`;
}

// Cờ quyền nhóm tương ứng role người xem (admin thấy hết, không cần cờ).
export function groupPermFlagForRole(role: string): "permEngineer" | "permAccountant" | null {
  if (role === UserRole.engineer || role === UserRole.foreman || role === UserRole.construction_manager) return "permEngineer";
  if (role === UserRole.accountant) return "permAccountant";
  return null;
}

// Hồ sơ người không phải admin xem được: tự tải lên, được cấp riêng, hoặc file theo nhóm mà role được xem.
// Lưu ý: chỉ lọc ở cấp file — caller phải tự giới hạn dự án user là thành viên.
export function docVisibilityWhere(viewer: { id: string; role: string }): Prisma.ProjectDocumentWhereInput {
  if (viewer.role === UserRole.admin) return {};
  const flag = groupPermFlagForRole(viewer.role);
  const or: Prisma.ProjectDocumentWhereInput[] = [
    { uploadedBy: viewer.id },
    { accessList: { some: { userId: viewer.id } } },
  ];
  if (flag) or.push({ accessMode: "group", group: { [flag]: true } });
  return { OR: or };
}

// Đổi nhóm → category đi theo (category vẫn được AI dự án / link mời thầu / cổng khách đọc).
export function categoryForGroup(systemKey: string | null, current: ProjectDocumentCategory): ProjectDocumentCategory {
  if (systemKey === "ban_ve") return ProjectDocumentCategory.drawing;
  if (systemKey === "hd_chu_nha") {
    return current === "contract" || current === "estimate" || current === "legal" ? current : ProjectDocumentCategory.contract;
  }
  return current === "drawing" || current === "contract" || current === "estimate" ? ProjectDocumentCategory.other : current;
}

// Khách thấy file khi: theo nhóm + nhóm bật chủ nhà + không phải CAD + là bản hiện hành.
export function customerVisibleByGroup(group: { permCustomer: boolean } | null, fileName: string, isCurrent = true) {
  return !!group?.permCustomer && !isCadFile(fileName) && isCurrent;
}

export function parseSubfolders(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function toDocGroupDto(g: {
  id: string; systemKey: string | null; name: string; icon: string; description: string | null;
  subfolders: Prisma.JsonValue; displayOrder: number; permEngineer: boolean; permAccountant: boolean;
  permSubcontractor: boolean; permCustomer: boolean;
}): DocGroupDto {
  return {
    id: g.id,
    systemKey: g.systemKey,
    name: g.name,
    icon: g.icon,
    description: g.description,
    subfolders: parseSubfolders(g.subfolders),
    displayOrder: g.displayOrder,
    permEngineer: g.permEngineer,
    permAccountant: g.permAccountant,
    permSubcontractor: g.permSubcontractor,
    permCustomer: g.permCustomer,
  };
}

// Dữ liệu màn Hồ sơ dự án (page + API refresh dùng chung). Caller đã kiểm user là thành viên dự án.
export async function loadProjectDocsView(projectId: string, viewer: { id: string; role: string }) {
  await ensureProjectDocGroups(projectId);
  const isAdmin = viewer.role === UserRole.admin;

  const [groupsRaw, docsRaw] = await Promise.all([
    prisma.projectDocGroup.findMany({
      where: { projectId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.projectDocument.findMany({
      where: { projectId, ...docVisibilityWhere(viewer) },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        uploadedAt: true,
        visibleToCustomer: true,
        groupId: true,
        subfolder: true,
        status: true,
        accessMode: true,
        versionOfId: true,
        versionNo: true,
        isCurrent: true,
        uploader: { select: { id: true, fullName: true } },
        accessList: { select: { user: { select: { id: true, fullName: true, role: true } } } },
      },
    }),
  ]);

  const documents: ProjectDocDto[] = docsRaw.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    uploader: d.uploader,
    uploadedAt: d.uploadedAt.toISOString(),
    visibleToCustomer: d.visibleToCustomer,
    viewUrl: `/api/projects/${projectId}/documents/${d.id}/file`,
    groupId: d.groupId,
    subfolder: d.subfolder,
    status: d.status,
    accessMode: d.accessMode,
    versionNo: d.versionNo,
    rootId: d.versionOfId ?? d.id,
    isCurrent: d.isCurrent,
    grantedUsers: isAdmin ? d.accessList.map((a) => a.user) : undefined,
  }));

  const flag = groupPermFlagForRole(viewer.role);
  const groupIdsWithDocs = new Set(documents.map((d) => d.groupId));
  const groups = groupsRaw
    .filter((g) => isAdmin || (flag && g[flag]) || groupIdsWithDocs.has(g.id))
    .map(toDocGroupDto);

  return { groups, documents };
}

// Trường nhóm admin sửa được (tạo nhóm gửi đủ; sửa nhóm dùng .partial()).
// KHÔNG dùng .default(): zod v4 vẫn áp default trong .partial() → PATCH sẽ reset quyền.
export const groupFieldsSchema = z.object({
  name: z.string().trim().min(1, "Tên nhóm không được trống").max(80),
  icon: z.string().trim().min(1).max(16),
  description: z.string().trim().max(200).nullable().optional(),
  subfolders: z.array(z.string().trim().min(1).max(60)).max(30),
  permEngineer: z.boolean(),
  permAccountant: z.boolean(),
  permSubcontractor: z.boolean(),
  permCustomer: z.boolean(),
});

