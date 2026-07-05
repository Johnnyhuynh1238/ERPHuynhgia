"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Pencil, Trash2, Plus } from "lucide-react";

type Milestone = {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  status: "pending" | "signed";
  signerName: string | null;
  signedAt: string | null;
  customerNote: string | null;
  createdAt: string;
  creator: { fullName: string } | null;
};

const emptyForm = { seq: "", title: "", description: "" };

export function AcceptanceManageClient({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/acceptance`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Lỗi tải dữ liệu");
      setRows(j.milestones);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    const nextSeq = rows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    setEditing(null);
    setForm({ ...emptyForm, seq: String(nextSeq) });
    setShowForm(true);
  }

  function openEdit(m: Milestone) {
    setEditing(m);
    setForm({ seq: String(m.seq), title: m.title, description: m.description ?? "" });
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        seq: Number(form.seq),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
      };
      const url = editing
        ? `/api/projects/${projectId}/acceptance/${editing.id}`
        : `/api/projects/${projectId}/acceptance`;
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Lỗi lưu");
      toast.success(j.message);
      setShowForm(false);
      setForm(emptyForm);
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Milestone) {
    if (!window.confirm(`Xoá mốc #${m.seq} — ${m.title}?`)) return;
    const r = await fetch(`/api/projects/${projectId}/acceptance/${m.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) {
      toast.error(j.message || "Không xoá được");
      return;
    }
    toast.success(j.message);
    void load();
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16]"
          >
            <Plus className="h-4 w-4" /> Mốc nghiệm thu
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
          <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Số TT *</span>
              <input
                type="number"
                min={1}
                value={form.seq}
                onChange={(e) => setForm({ ...form, seq: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Tên mốc nghiệm thu *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="VD: Nghiệm thu sắt thép, coppha móng"
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-[#8b95b7]">Mô tả / nội dung nghiệm thu (hiện trong biên bản)</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="VD: Kiểm tra chủng loại, đường kính, khoảng cách thép; coppha kín khít, đúng kích thước…"
              className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : editing ? "Cập nhật" : "Tạo mốc"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setForm(emptyForm);
              }}
              className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">Đang tải…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
          Chưa có mốc nghiệm thu nào.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#8892b0]">#{m.seq}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      m.status === "signed" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"
                    }`}
                  >
                    {m.status === "signed" ? "CN đã ký" : "Chờ CN ký"}
                  </span>
                </div>
                <div className="mt-1 font-medium text-[#f0f2ff]">{m.title}</div>
                {m.description ? <div className="mt-0.5 text-xs text-[#8892b0]">{m.description}</div> : null}
                {m.status === "signed" && (
                  <div className="mt-1 text-xs text-emerald-300">
                    Ký bởi {m.signerName || "chủ nhà"} lúc{" "}
                    {m.signedAt ? new Date(m.signedAt).toLocaleString("vi-VN") : "—"}
                    {m.customerNote ? ` · Ghi chú: ${m.customerNote}` : ""}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/projects/${projectId}/acceptance/${m.id}/bien-ban`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#2d3249] px-2.5 py-1.5 text-xs text-[#cfd4e8] hover:bg-[#22263a]"
                  title="Xem / tải biên bản"
                >
                  <FileText className="h-3.5 w-3.5" /> BB
                </Link>
                {canManage && m.status === "pending" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="rounded-lg border border-[#2d3249] p-1.5 text-[#cfd4e8] hover:bg-[#22263a]"
                      title="Sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="rounded-lg border border-red-900/60 p-1.5 text-red-400 hover:bg-red-950/40"
                      title="Xoá"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
