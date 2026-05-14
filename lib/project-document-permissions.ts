import crypto from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  const access = await prisma.projectDocumentAccess.findUnique({
    where: { documentId_userId: { documentId, userId: viewer.id } },
    select: { id: true },
  });
  if (access) return true;
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    select: { uploadedBy: true },
  });
  return !!doc && doc.uploadedBy === viewer.id;
}

export function buildDocumentVisibilityWhere(viewer: DocumentViewer) {
  if (viewer.role === UserRole.admin) return {};
  return {
    OR: [
      { uploadedBy: viewer.id },
      { accessList: { some: { userId: viewer.id } } },
    ],
  };
}
