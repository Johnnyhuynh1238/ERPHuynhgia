"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STAGE_OPTIONS: { value: Stage; label: string; desc: string }[] = [
  { value: 1, label: "[1] Lead mới", desc: "Khách vừa quan tâm, chưa contact" },
  { value: 2, label: "[2] Đã liên hệ", desc: "Đã gọi/Zalo, đang khảo sát-báo giá" },
  { value: 3, label: "[3] HĐ Thiết kế", desc: "Tạo luôn HĐ Thiết kế + 4 sub-step" },
  { value: 4, label: "[4] Chuẩn bị thi công", desc: "Cần qua /projects/new để tạo dự án" },
  { value: 5, label: "[5] Đang thi công", desc: "Cần qua /projects/new để tạo dự án" },
  { value: 6, label: "[6] Bàn giao", desc: "Cần qua /projects/new để tạo dự án" },
  { value: 7, label: "[7] Bảo hành", desc: "Cần qua /projects/new để tạo dự án" },
];

export function CreateCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Cần nhập tên + SĐT");
      return;
    }
    setSaving(true);
    try {
      if (stage >= 4) {
        // Stage 4+ phải tạo Project
        const params = new URLSearchParams({
          customerName: name.trim(),
          customerPhone: phone.trim(),
        });
        router.push(`/projects/new?${params}`);
        return;
      }
      const res = await fetch(`/api/admin/customer-pipeline/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          stage,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Đã tạo khách");
      onCreated();
    } catch (e) {
      toast.error("Lỗi: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-[#252840] bg-[#0f1117] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tạo khách hàng mới</h2>
            <p className="text-xs text-[#8892b0]">Chọn giai đoạn muốn bắt đầu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-0.5 text-[#8892b0] hover:bg-[#252840] hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-[#8892b0]">Tên khách</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              placeholder="Anh A / Chị B"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-[#8892b0]">SĐT</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              placeholder="09xxxxxxxx"
              required
            />
          </label>
          <fieldset>
            <legend className="text-xs text-[#8892b0]">Giai đoạn bắt đầu</legend>
            <div className="mt-1 grid gap-1.5">
              {STAGE_OPTIONS.map((s) => {
                const active = stage === s.value;
                return (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      active
                        ? "border-amber-400 bg-amber-500/10"
                        : "border-[#2d3249] bg-[#13151f] hover:border-[#3a4060]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="stage"
                      value={s.value}
                      checked={active}
                      onChange={() => setStage(s.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-xs text-[#8892b0]">{s.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {stage <= 3 && (
            <label className="block">
              <span className="text-xs text-[#8892b0]">Ghi chú (tuỳ chọn)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                placeholder="VD: nhà 3 tầng, 90m2, khu Tân Phú..."
              />
            </label>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={saving} className="h-9 bg-amber-500 text-black hover:bg-amber-400">
            {saving ? "Đang lưu…" : stage >= 4 ? "Tiếp → Tạo dự án" : "Tạo khách"}
          </Button>
        </div>
      </form>
    </div>
  );
}
