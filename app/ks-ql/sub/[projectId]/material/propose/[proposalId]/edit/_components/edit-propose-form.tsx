"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export type PrefillCard = {
  cid: string;
  name: string;
  qty: string;
  unit: string;
  task: string;
};

function makeBlankCard(): PrefillCard {
  return {
    cid: crypto.randomUUID(),
    name: "",
    qty: "",
    unit: "",
    task: "",
  };
}

const COMMON_UNITS = ["bao", "tấn", "kg", "viên", "cây", "m", "m2", "m3", "lít", "can", "thùng", "cuộn", "tấm", "hộp"];

export function EditProposeForm({
  projectId,
  projectName,
  proposalId,
  declineNote,
  prefill,
}: {
  projectId: string;
  projectName: string;
  proposalId: string;
  declineNote: string | null;
  prefill: PrefillCard[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState<PrefillCard[]>(prefill.length ? prefill : [makeBlankCard()]);
  const [submitting, setSubmitting] = useState(false);

  function update(cid: string, patch: Partial<PrefillCard>) {
    setCards((prev) => prev.map((c) => (c.cid === cid ? { ...c, ...patch } : c)));
  }
  function addCard() {
    setCards((prev) => [...prev, makeBlankCard()]);
  }
  function removeCard(cid: string) {
    setCards((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.cid !== cid)));
  }

  const allValid = cards.every(
    (c) => c.name.trim() && c.unit.trim() && Number(c.qty) > 0 && c.task.trim(),
  );

  async function submit() {
    if (!allValid) {
      toast.error("Có vật tư chưa nhập đủ thông tin");
      return;
    }
    setSubmitting(true);
    const items = cards.map((c) => ({
      name: c.name.trim(),
      qty: Number(c.qty),
      unit: c.unit.trim(),
      task: c.task.trim(),
    }));
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || j.error || "Không gửi lại được");
      return;
    }
    toast.success("Đã gửi lại đề xuất, chờ TPTC duyệt");
    router.replace(`/ks-ql/sub/${projectId}/material/propose/${proposalId}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0f1015] text-[#f0f2ff]">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-32 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#1a1d2e] px-4 py-2 text-base font-medium text-[#f0f2ff] hover:bg-[#252840]"
        >
          <ArrowLeft className="h-5 w-5" />
          Huỷ
        </button>

        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-orange-300">Sửa & gửi lại đề xuất</h1>
          <p className="mt-2 text-base text-[#8892b0]">{projectName}</p>
        </div>

        {declineNote ? (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-[#f87171]/40 bg-[#f87171]/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#f87171]" />
            <div className="text-sm text-[#f0f2ff]">
              <div className="mb-1 font-semibold text-[#f87171]">TPTC từ chối với lý do:</div>
              <div className="whitespace-pre-wrap">{declineNote}</div>
            </div>
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border-2 border-[#f87171]/40 bg-[#f87171]/10 px-4 py-3 text-sm text-[#f0f2ff]">
            TPTC đã từ chối đề xuất này. Sửa lại nội dung rồi gửi duyệt lần nữa.
          </div>
        )}

        <div className="flex flex-col gap-5">
          {cards.map((c, idx) => (
            <div
              key={c.cid}
              className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="text-base font-semibold text-orange-300">Vật tư #{idx + 1}</div>
                {cards.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeCard(c.cid)}
                    aria-label="Xoá vật tư"
                    className="rounded-full bg-[#2a1518] p-2 text-[#f87171] hover:bg-[#3a1a20]"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              <label className="mb-1 block text-sm text-[#8892b0]">Chủng loại</label>
              <input
                type="text"
                value={c.name}
                onChange={(e) => update(c.cid, { name: e.target.value })}
                placeholder="VD: Xi măng PC40"
                className="mb-4 w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1015] px-4 py-3 text-lg text-[#f0f2ff] placeholder:text-[#5b6481] focus:border-[#ff8a3d]/60 focus:outline-none"
              />

              <div className="mb-4 grid grid-cols-[1fr_140px] gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[#8892b0]">Số lượng</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={c.qty}
                    onChange={(e) => update(c.cid, { qty: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1015] px-4 py-3 text-xl text-[#f0f2ff] placeholder:text-[#5b6481] focus:border-[#ff8a3d]/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[#8892b0]">Đơn vị</label>
                  <input
                    type="text"
                    value={c.unit}
                    onChange={(e) => update(c.cid, { unit: e.target.value })}
                    placeholder="bao"
                    className="w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1015] px-3 py-3 text-center text-lg text-[#f0f2ff] placeholder:text-[#5b6481] focus:border-[#ff8a3d]/60 focus:outline-none"
                  />
                </div>
              </div>

              <div className="-mt-2 mb-4 flex gap-1.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                {COMMON_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => update(c.cid, { unit: u })}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      c.unit === u
                        ? "border-[#ff8a3d] bg-[#ff8a3d]/15 text-orange-300"
                        : "border-[#2d3249] bg-[#0f1015] text-[#8892b0] active:bg-[#252840]"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>

              <label className="mb-1 block text-sm text-[#8892b0]">Dùng cho công tác</label>
              <input
                type="text"
                value={c.task}
                onChange={(e) => update(c.cid, { task: e.target.value })}
                placeholder="VD: Đổ cột tầng trệt"
                className="w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1015] px-4 py-3 text-lg text-[#f0f2ff] placeholder:text-[#5b6481] focus:border-[#ff8a3d]/60 focus:outline-none"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addCard}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#ff8a3d]/40 bg-transparent px-5 py-5 text-lg font-semibold text-orange-300 hover:bg-[#ff8a3d]/10"
          >
            <Plus className="h-6 w-6" />
            THÊM VẬT TƯ
          </button>
        </div>

        <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0f1015] to-transparent px-4 pb-5 pt-8">
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={submit}
              disabled={!allValid || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff8a3d] px-6 py-5 text-xl font-bold text-black shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-6 w-6" />
              {submitting ? "Đang gửi..." : `GỬI LẠI (${cards.length} món)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
