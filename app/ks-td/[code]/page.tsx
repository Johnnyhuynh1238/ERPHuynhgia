import { homeLinkOf, resolveTienDoCode } from "@/lib/ks-day-link";
import { TienDoClient } from "@/app/projects/[id]/tien-do/_components/tien-do-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo tiến độ", robots: { index: false } };

// Báo cáo tiến độ mở từ link ngày "Việc của tôi" (Zalo) — KS không cần đăng nhập ERP (sếp 09/11/2026).
// Cùng màn + cùng luật tick với /ks-ql/sub/[projectId]/tien-do; mã hết hạn qua ngày.
export default async function KsTdPage({ params }: { params: { code: string } }) {
  const r = await resolveTienDoCode(params.code);
  if (!r) {
    return (
      <div className="min-h-screen bg-[#f4efe6] px-6 pt-16 text-center text-lg text-[#2b2622]">
        Link đã hết hạn — link chỉ dùng trong ngày.
        <br />
        Anh mở link thư ký gửi sáng nay.
      </div>
    );
  }
  const home = await homeLinkOf(r.user.id);

  return (
    <TienDoClient
      projectId={r.project.id}
      projectCode={r.project.code}
      projectName={r.project.name}
      projectAddress={r.project.address}
      backHref={home ?? `/ks-ql/sub/${r.project.id}/menu`}
      apiBase={`/ks-td/${params.code}/api`}
      ks
    />
  );
}
