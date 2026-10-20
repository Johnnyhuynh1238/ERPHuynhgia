import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildDesignGroupVisibilityWhere } from "@/lib/design-photos";
import { loadProjectDocsView } from "@/lib/project-doc-groups";
import { type DesignGroupDto } from "./_components/design-photos-client";
import { HoSoClient } from "./_components/ho-so-client";

export default async function ProjectDocumentsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true, name: true },
  });
  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const isAdmin = user.role === UserRole.admin;

  const { groups, documents } = await loadProjectDocsView(params.id, { id: user.id, role: user.role });

  const userOptions = isAdmin
    ? await prisma.user.findMany({
        where: { isActive: true, NOT: { role: UserRole.admin } },
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  const designGroupsRaw = await prisma.designPhotoGroup.findMany({
    where: {
      projectId: params.id,
      ...buildDesignGroupVisibilityWhere({ id: user.id, role: user.role }),
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      creator: { select: { id: true, fullName: true } },
      accessList: { select: { user: { select: { id: true, fullName: true, role: true } } } },
      photos: {
        orderBy: [{ displayOrder: "asc" }, { uploadedAt: "asc" }],
        select: { id: true, caption: true, displayOrder: true, uploadedAt: true },
      },
    },
  });

  const designGroups: DesignGroupDto[] = designGroupsRaw.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    visibleToCustomer: group.visibleToCustomer,
    displayOrder: group.displayOrder,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    creator: group.creator,
    grantedUsers: group.accessList.map((a) => a.user),
    photos: group.photos.map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      displayOrder: photo.displayOrder,
      uploadedAt: photo.uploadedAt.toISOString(),
      photoUrl: `/api/projects/${params.id}/design-photos/${photo.id}/file?variant=photo`,
      thumbnailUrl: `/api/projects/${params.id}/design-photos/${photo.id}/file?variant=thumb`,
    })),
    photoCount: group.photos.length,
  }));

  return (
    <HoSoClient
      projectId={params.id}
      projectName={project.name}
      isAdmin={isAdmin}
      initialGroups={groups}
      initialDocuments={documents}
      userOptions={userOptions}
      designGroups={designGroups}
    />
  );
}
