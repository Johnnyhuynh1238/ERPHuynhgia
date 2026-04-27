import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";

export default async function CustomerPhotosPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const photos = await prisma.eveningReportPhoto.findMany({
    where: { eveningReport: { projectId: project.id } },
    orderBy: { uploadedAt: "desc" },
    take: 120,
    select: { id: true, photoUrl: true, thumbnailUrl: true, caption: true },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-lg font-semibold">Album ảnh công trường</div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <a key={photo.id} href={photo.photoUrl} target="_blank" className="block overflow-hidden rounded-xl border border-[#2d3249]">
            <img src={photo.thumbnailUrl} className="h-24 w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
