"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProposalCreateForm({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async () => {
    const text = description.trim();
    if (!text || submitting) return;
    if (text.length < 2) {
      setError("Mô tả phải có ít nhất 2 ký tự");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, description: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Gửi thất bại");
      setOk("Đã gửi cho KT. KT sẽ trao đổi trực tiếp ở mục bình luận của đề xuất.");
      setDescription("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi gửi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-[#8892b0]">
        Đề xuất vật tư / máy cho {projectName}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={`Ví dụ:
- 10 bao xi măng PCB40
- 2 m3 cát vàng
- Thuê 1 máy đầm cóc 2 ngày`}
        className="w-full resize-y rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] placeholder:text-[#5a627a] focus:outline-none focus:ring-1 focus:ring-[#a78bfa]"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-[11px] text-[#5a627a]">
          KT sẽ lên đơn hàng chuẩn dựa trên mô tả này, trao đổi ở comment dưới mỗi đề xuất.
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !description.trim()}
          className="shrink-0 rounded-lg bg-[#a78bfa] px-4 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
        >
          {submitting ? "Đang gửi…" : "Gửi đề xuất"}
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {ok && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {ok}
        </div>
      )}
    </div>
  );
}
