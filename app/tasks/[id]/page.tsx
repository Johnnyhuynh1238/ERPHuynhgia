import Link from "next/link";
import { ProtectedLayout } from "@/components/protected-layout";

export default function TaskDetailPlaceholder({ params }: { params: { id: string } }) {
  return (
    <ProtectedLayout>
      <div className="space-y-3 rounded-xl border bg-white p-4">
        <h1 className="text-xl font-semibold text-[#1F4E79]">Chi tiết task</h1>
        <p className="text-sm text-slate-600">Task ID: {params.id}</p>
        <p className="text-sm text-slate-600">Chi tiết task - sẽ build ở Bước 9.3.</p>
        <Link href="/projects" className="text-sm text-[#1F4E79] underline">
          Quay lại danh sách dự án
        </Link>
      </div>
    </ProtectedLayout>
  );
}
