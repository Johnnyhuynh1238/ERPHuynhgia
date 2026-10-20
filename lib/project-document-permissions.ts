import crypto from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { docVisibilityWhere } from "@/lib/project-doc-groups";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export type DocumentViewer = {
  id: string;
  role: UserRole | string;
};

export function sha256Hex(buffer: Buffer | string) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function computeDocumentSignature(
  docs: Array<{ id: string; contentHash: string }>,
) {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const joined = sorted.map((d) => `${d.id}:${d.contentHash}`).join("|");
  return sha256Hex(joined);
}

export function canViewProjectDocumentSync(
  viewer: DocumentViewer,
  doc: { uploadedBy?: string | null; accessList?: Array<{ userId: string }> },
) {
  if (viewer.role === UserRole.admin) return true;
  if (doc.uploadedBy === viewer.id) return true;
  if (doc.accessList?.some((a) => a.userId === viewer.id)) return true;
  return false;
}

export async function canViewProjectDocument(viewer: DocumentViewer, documentId: string) {
  if (viewer.role === UserRole.admin) return true;
  const doc = await prisma.projectDocument.findFirst({
    where: { id: documentId, ...docVisibilityWhere({ id: viewer.id, role: String(viewer.role) }) },
    select: { projectId: true, uploadedBy: true, accessList: { where: { userId: viewer.id }, select: { id: true } } },
  });
  if (!doc) return false;
  if (doc.uploadedBy === viewer.id || doc.accessList.length > 0) return true;
  // Xem theo quyền nhóm → phải là thành viên dự án.
  const member = await prisma.project.findFirst({
    where: { id: doc.projectId, ...buildProjectAccessWhere({ id: viewer.id, role: String(viewer.role) }) },
    select: { id: true },
  });
  return !!member;
}

export function buildDocumentVisibilityWhere(viewer: DocumentViewer) {
  return docVisibilityWhere({ id: viewer.id, role: String(viewer.role) });
}
