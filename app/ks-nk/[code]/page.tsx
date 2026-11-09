import { getWorkDateVn } from "@/lib/attendance";
import { homeLinkOf, resolveDiaryCode } from "@/lib/ks-day-link";
import { DiaryClient } from "@/app/ks-ql/sub/[projectId]/diary/_components/diary-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhật ký thi công", robots: { index: false } };

// Nhật ký thi công mở từ link ngày "Việc của tôi" (Zalo) — KS không cần đăng nhập ERP.
// Cùng màn + cùng luật chốt với /ks-ql/sub/[projectId]/diary; mã hết hạn qua ngày.
export default async function KsNkPage({ params }: { params: { code: string } }) {
  const r = await resolveDiaryCode(params.code);
  if (!r) {
    return (
      <div className="min-h-screen bg-[#0f1015] px-6 pt-16 text-center text-lg text-[#f0f2ff]">
        Link đã hết hạn — link chỉ dùng trong ngày.
        <br />
        Anh mở link thư ký gửi sáng nay.
      </div>
    );
  }
  const home = await homeLinkOf(r.user.id);
  const todayYmd = getWorkDateVn().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#0f1015] text-[#f0f2ff]">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-10 pt-6">
        {home ? (
          <a
            href={home}
            className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#1a1d2e] px-4 py-2 text-base font-medium text-[#f0f2ff] hover:bg-[#252840]"
          >
            ‹ Việc của tôi
          </a>
        ) : null}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-orange-300">Nhật ký thi công</h1>
          <p className="mt-2 text-base text-[#8892b0]">
            {r.project.name} · KS {r.user.fullName}
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <DiaryClient projectId={r.project.id} todayYmd={todayYmd} apiBase={`/ks-nk/${params.code}/api`} />
        </div>
      </div>
    </div>
  );
}
