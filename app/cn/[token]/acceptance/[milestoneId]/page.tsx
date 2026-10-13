import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isPdfPhoto, readAcceptancePhotos, type AcceptancePhoto } from "@/lib/acceptance-photos";
import { CustomerPhotoAlbum } from "../../_components/customer-photo-album";

export const dynamic = "force-dynamic";

// Nghiệm thu ký giấy tại công trình — cổng CN chỉ xem ảnh BB đã ký + ảnh công trình.
export default async function CustomerAcceptancePage({ params }: { params: { token: string; milestoneId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: project.id },
  });
  if (!milestone) notFound();

  const fileUrl = (p: AcceptancePhoto) =>
    `/api/customer/${params.token}/acceptance/${milestone.id}/file?key=${encodeURIComponent(p.key)}`;
  const bienBan = readAcceptancePhotos(milestone.bienBanPhotos);
  const bbImages = bienBan.filter((p) => !isPdfPhoto(p));
  const bbPdfs = bienBan.filter(isPdfPhoto);
  const site = readAcceptancePhotos(milestone.sitePhotos);
  const done = milestone.status === "signed";

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <Link href={`/cn/${params.token}/timeline`} className="text-xs text-orange-300 underline">
          ← Tiến độ
        </Link>
        <div className="mt-2 owner-section-title">MỐC NGHIỆM THU #{milestone.seq}</div>
        <h1 className="mt-1 text-lg font-bold text-white">{milestone.title}</h1>
        {milestone.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm owner-muted">{milestone.description}</p>
        ) : null}
        <div className={`mt-3 text-sm ${done ? "text-emerald-300" : "owner-muted"}`}>
          {done
            ? `✓ Đã nghiệm thu${milestone.signedAt ? ` · ${milestone.signedAt.toLocaleDateString("vi-VN")}` : ""}`
            : "Chưa nghiệm thu — biên bản sẽ được cập nhật sau khi các bên ký tại công trình."}
        </div>
      </section>

      <section className="owner-section">
        <div className="owner-section-title">BIÊN BẢN ĐÃ KÝ</div>
        {bienBan.length === 0 ? (
          <div className="mt-2 text-sm owner-muted">Chưa có biên bản.</div>
        ) : (
          <div className="mt-3 space-y-2">
            <CustomerPhotoAlbum
              photos={bbImages.map((p) => ({ id: p.key, url: fileUrl(p), caption: "Biên bản nghiệm thu" }))}
              gridClassName="grid grid-cols-2 gap-2"
              thumbnailClassName="h-40"
            />
            {bbPdfs.map((p) => (
              <a key={p.key} href={fileUrl(p)} target="_blank" rel="noreferrer" className="owner-card block text-sm text-white">
                📄 {p.name}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="owner-section">
        <div className="owner-section-title">ẢNH NGHIỆM THU CÔNG TRÌNH</div>
        {site.length === 0 ? (
          <div className="mt-2 text-sm owner-muted">Chưa có ảnh.</div>
        ) : (
          <div className="mt-3">
            <CustomerPhotoAlbum photos={site.map((p) => ({ id: p.key, url: fileUrl(p), caption: milestone.title }))} />
          </div>
        )}
      </section>
    </div>
  );
}
