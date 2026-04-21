import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="rounded-xl border bg-white p-6 text-sm">
      <h2 className="mb-2 text-lg font-semibold text-red-700">Không tìm thấy dự án</h2>
      <p className="mb-4 text-slate-600">Dự án này không tồn tại hoặc đã bị xóa.</p>
      <Link href="/projects" className="text-[#1F4E79] underline">
        Quay về danh sách dự án
      </Link>
    </div>
  );
}
