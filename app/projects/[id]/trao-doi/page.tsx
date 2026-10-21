import { ProjectTopics } from "@/components/project-topics";

export const dynamic = "force-dynamic";

// Ô trao đổi nội bộ dự án cho thành viên không dùng màn KS (KT, TPTC, admin).
// Quyền vào dự án đã kiểm ở layout /projects/[id]; API kiểm lại theo thành viên.
export default function ProjectTraoDoiPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { t?: string };
}) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl bg-[#0f1015] px-3 pb-6 pt-1 text-[#f0f2ff]">
      <ProjectTopics projectId={params.id} initialTopicId={searchParams.t} />
    </div>
  );
}
