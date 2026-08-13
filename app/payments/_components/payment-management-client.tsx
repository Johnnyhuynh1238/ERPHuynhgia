"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  contractValue: number | null;
};

type Drawing = {
  id: string;
  name: string;
  description: string | null;
  fileSizeBytes: number;
  viewUrl: string;
  uploadedAt: string;
  uploader?: { fullName: string } | null;
};

export function PaymentManagementClient({ projects, isAdmin }: { projects: ProjectOption[]; isAdmin: boolean }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawingUploading, setDrawingUploading] = useState(false);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  async function loadProject(projectId: string) {
    if (!projectId) return;
    setLoading(true);
    try {
      const drawingsRes = await fetch(`/api/projects/${projectId}/drawings`, { cache: "no-store" });
      const drawingsJson = await drawingsRes.json().catch(() => ({}));
      setDrawings(drawingsRes.ok ? drawingsJson.drawings || [] : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProject(selectedProjectId);
  }, [selectedProjectId]);

  async function uploadDrawing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setDrawingUploading(true);
    const formData = new FormData(event.currentTarget);
    const res = await fetch(`/api/projects/${selectedProjectId}/drawings`, { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setDrawingUploading(false);
    if (!res.ok) {
      toast.error(json.message || "Không upload được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã upload bản vẽ");
    event.currentTarget.reset();
    await loadProject(selectedProjectId);
  }

  async function deleteDrawing(drawing: Drawing) {
    if (!await confirmDialog(`Xóa bản vẽ ${drawing.name}?`)) return;
    const res = await fetch(`/api/drawings/${drawing.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không xóa được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã xóa bản vẽ");
    await loadProject(selectedProjectId);
  }

  async function editDrawing(drawing: Drawing) {
    const name = window.prompt("Tên bản vẽ", drawing.name);
    if (name === null) return;
    const description = window.prompt("Mô tả", drawing.description || "");
    if (description === null) return;
    const displayOrder = window.prompt("Thứ tự", "0");
    if (displayOrder === null) return;

    const res = await fetch(`/api/drawings/${drawing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, displayOrder }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không cập nhật được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã cập nhật bản vẽ");
    await loadProject(selectedProjectId);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-sm font-semibold text-orange-200">Dự án</div>
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedProjectId(project.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedProjectId === project.id ? "border-orange-500 bg-orange-500/15 text-orange-100" : "border-[#2d3249] bg-[#13151f] text-[#d9def3]"}`}
            >
              <div className="font-semibold">{project.code}</div>
              <div className="text-xs text-[#8892b0]">{project.name}</div>
              <div className="text-xs text-[#8892b0]">{project.customerName}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="space-y-4">
        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#f8fafc]">{selectedProject?.name || "Chọn dự án"}</h2>
              <div className="text-sm text-[#8892b0]">{selectedProject?.customerName}</div>
            </div>
            {loading ? <span className="text-xs text-[#8892b0]">Đang tải...</span> : null}
          </div>
          <p className="mt-3 text-xs text-[#8892b0]">Lịch thanh toán quản lý trong từng dự án (Dự án → Thanh toán). Màn này chỉ quản lý bản vẽ PDF cho cổng chủ nhà.</p>
        </section>

        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-[#f8fafc]">Bản vẽ PDF</h3>
            <span className="text-xs text-[#8892b0]">{drawings.length} file</span>
          </div>
          {isAdmin ? (
            <form onSubmit={uploadDrawing} className="mt-3 grid gap-2 md:grid-cols-5">
              <input required name="name" placeholder="Tên bản vẽ" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <input name="description" placeholder="Mô tả" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-2" />
              <input name="displayOrder" placeholder="Thứ tự" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <input required name="file" type="file" accept="application/pdf" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <button disabled={drawingUploading} type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white md:col-span-5">{drawingUploading ? "Đang upload..." : "Upload bản vẽ"}</button>
            </form>
          ) : <div className="mt-2 text-sm text-[#8892b0]">KT chỉ xem danh sách bản vẽ; admin mới được upload/xóa.</div>}

          <div className="mt-3 space-y-2">
            {drawings.map((drawing) => (
              <div key={drawing.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                <div>
                  <div className="font-semibold text-[#f8fafc]">{drawing.name}</div>
                  <div className="text-xs text-[#8892b0]">{drawing.description || "PDF"} · {Math.round(drawing.fileSizeBytes / 1024).toLocaleString("vi-VN")} KB</div>
                </div>
                <div className="flex gap-2">
                  <a href={drawing.viewUrl} target="_blank" className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-orange-200">Xem</a>
                  {isAdmin ? <button type="button" onClick={() => void editDrawing(drawing)} className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-[#d9def3]">Sửa</button> : null}
                  {isAdmin ? <button type="button" onClick={() => void deleteDrawing(drawing)} className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200">Xóa</button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
