import { ProtectedLayout } from "@/components/protected-layout";

type ProjectDetailProps = {
  params: {
    id: string;
  };
};

export default function ProjectDetailPlaceholder({ params }: ProjectDetailProps) {
  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-[#1F4E79]">Chi tiết dự án</h1>
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
          Trang chi tiết dự án ({params.id}) - sẽ build ở Bước 9.
        </div>
      </div>
    </ProtectedLayout>
  );
}
