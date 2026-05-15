import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { DocumentsClient, type DocumentDto } from "./_components/documents-client";

export default async function ProjectDocumentsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });
  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const isAdmin = user.role === UserRole.admin;

  const baseSelect = {
    id: true,
    title: true,
    category: true,
    fileName: true,
    fileSize: true,
    mimeType: true,
    uploadedBy: true,
    uploadedAt: true,
    visibleToCustomer: true,
    uploader: { select: { id: true, fullName: true } },
  } as const;

  const documentsRaw = isAdmin
    ? await prisma.projectDocument.findMany({
        where: { projectId: params.id },
        select: {
          ...baseSelect,
          accessList: { select: { user: { select: { id: true, fullName: true, role: true } } } },
        },
        orderBy: { uploadedAt: "desc" },
      })
    : await prisma.projectDocument.findMany({
        where: {
          projectId: params.id,
          OR: [
            { uploadedBy: user.id },
            { accessList: { some: { userId: user.id } } },
          ],
        },
        select: baseSelect,
        orderBy: { uploadedAt: "desc" },
      });

  const documents: DocumentDto[] = documentsRaw.map((doc) => {
    const accessList = "accessList" in doc
      ? (doc.accessList as Array<{ user: { id: string; fullName: string; role: string } }>)
      : undefined;
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      uploader: doc.uploader,
      uploadedAt: doc.uploadedAt.toISOString(),
      visibleToCustomer: doc.visibleToCustomer,
      viewUrl: `/api/projects/${params.id}/documents/${doc.id}/file`,
      grantedUsers: accessList?.map((a) => a.user),
    };
  });

  const userOptions = isAdmin
    ? await prisma.user.findMany({
        where: { isActive: true, NOT: { role: UserRole.admin } },
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  return (
    <DocumentsClient
      projectId={params.id}
      isAdmin={isAdmin}
      initialDocuments={documents}
      userOptions={userOptions}
    />
  );
}
