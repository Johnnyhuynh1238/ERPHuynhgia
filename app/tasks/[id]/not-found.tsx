import Link from "next/link";

export default function TaskNotFound() {
  return (
    <div className="rounded-xl border bg-white p-6 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-red-700">Không tìm thấy task</h2>
      <p className="mb-3 text-slate-600">Task này không tồn tại hoặc đã bị xóa.</p>
      <Link href="/projects" className="text-orange-300 underline">
        Quay lại danh sách dự án
      </Link>
    </div>
  );
}
