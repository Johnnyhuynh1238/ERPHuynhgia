"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { MaterialPicker, type PickedMaterial } from "./material-picker";
import { TaskPicker, type PickedTask } from "./task-picker";

type CardState = {
  cid: string;
  name: string;
  unit: string;
  qty: string;
  budgetQty: number | null;
  tasks: PickedTask[];
};

function makeBlankCard(): CardState {
  return {
    cid: crypto.randomUUID(),
    name: "",
    unit: "",
    qty: "",
    budgetQty: null,
    tasks: [],
  };
}

export function ProposeForm({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [cards, setCards] = useState<CardState[]>([makeBlankCard()]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ cid: string; kind: "material" | "tasks" } | null>(null);

  function update(cid: string, patch: Partial<CardState>) {
    setCards((prev) => prev.map((c) => (c.cid === cid ? { ...c, ...patch } : c)));
  }
  function addCard() {
    setCards((prev) => [...prev, makeBlankCard()]);
  }
  function removeCard(cid: string) {
    setCards((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.cid !== cid)));
  }

  function pickedMaterial(cid: string, m: PickedMaterial) {
    update(cid, { name: m.name, unit: m.unit, budgetQty: m.budgetQty });
    setPickerFor(null);
  }
  function pickedTasks(cid: string, tasks: PickedTask[]) {
    update(cid, { tasks });
    setPickerFor(null);
  }

  const allValid = cards.every((c) => c.name.trim() && c.unit.trim() && Number(c.qty) > 0);

  async function submit() {
    if (!allValid) {
      toast.error("Có vật tư chưa nhập đủ thông tin");
      return;
    }
    setSubmitting(true);
    const items = cards.map((c) => ({
      name: c.name.trim(),
      unit: c.unit.trim(),
      qty: Number(c.qty),
      taskIds: c.tasks.map((t) => t.id),
    }));
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, items }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Không gửi được");
      return;
    }
    toast.success("Đã gửi đề xuất");
    router.replace(`/ks-ql/sub/${projectId}/material/propose`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0f1320] text-[#f5ede4]">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-32 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#1a1d2e] px-4 py-2 text-base font-medium text-[#f5ede4] hover:bg-[#252840]"
        >
          <ArrowLeft className="h-5 w-5" />
          Huỷ
        </button>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-orange-300">Đề xuất vật tư mới</h1>
          <p className="mt-2 text-base text-[#8892b0]">{projectName}</p>
        </div>

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
                    className="rounded-full bg-[#2a1518] p-2 text-[#D26B6B] hover:bg-[#3a1a20]"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              <label className="mb-1 block text-sm text-[#8892b0]">Loại vật tư</label>
              <button
                type="button"
                onClick={() => setPickerFor({ cid: c.cid, kind: "material" })}
                className="mb-4 w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1320] px-4 py-3 text-left text-lg text-[#f5ede4] hover:border-[#ff8a3d]/40"
              >
                {c.name ? (
                  <span>{c.name}</span>
                ) : (
                  <span className="text-[#5b6481]">Chọn loại vật tư…</span>
                )}
              </button>

              <div className="mb-4 grid grid-cols-[1fr_100px] gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[#8892b0]">Số lượng</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={c.qty}
                    onChange={(e) => update(c.cid, { qty: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1320] px-4 py-3 text-xl text-[#f5ede4]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[#8892b0]">Đơn vị</label>
                  <div className="rounded-xl border-2 border-[#252840] bg-[#0f1320] px-3 py-3 text-center text-lg text-[#8892b0]">
                    {c.unit || "—"}
                  </div>
                </div>
              </div>

              {c.budgetQty !== null && Number(c.qty) > 0 ? (
                <BudgetCompare qty={Number(c.qty)} budgetQty={c.budgetQty} />
              ) : null}

              <label className="mb-1 mt-1 block text-sm text-[#8892b0]">Dùng cho công tác</label>
              <button
                type="button"
                onClick={() => setPickerFor({ cid: c.cid, kind: "tasks" })}
                className="w-full rounded-xl border-2 border-[#2d3249] bg-[#0f1320] px-4 py-3 text-left text-base text-[#f5ede4] hover:border-[#ff8a3d]/40"
              >
                {c.tasks.length === 0 ? (
                  <span className="text-[#5b6481]">Chọn công tác…</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {c.tasks.slice(0, 4).map((t) => (
                      <span
                        key={t.id}
                        className="inline-block rounded-full bg-[#ff8a3d]/20 px-2.5 py-1 text-xs text-[#ff8a3d]"
                      >
                        {t.name}
                      </span>
                    ))}
                    {c.tasks.length > 4 ? (
                      <span className="inline-block rounded-full bg-[#252840] px-2.5 py-1 text-xs text-[#8892b0]">
                        +{c.tasks.length - 4}
                      </span>
                    ) : null}
                  </div>
                )}
              </button>
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

        <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0f1320] to-transparent px-4 pb-5 pt-8">
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={submit}
              disabled={!allValid || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff8a3d] px-6 py-5 text-xl font-bold text-black shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-6 w-6" />
              {submitting ? "Đang gửi..." : `GỬI ĐỀ XUẤT (${cards.length} món)`}
            </button>
          </div>
        </div>
      </div>

      {pickerFor?.kind === "material" ? (
        <MaterialPicker
          projectId={projectId}
          onPick={(m) => pickedMaterial(pickerFor.cid, m)}
          onClose={() => setPickerFor(null)}
        />
      ) : null}

      {pickerFor?.kind === "tasks" ? (
        <TaskPicker
          projectId={projectId}
          initial={cards.find((c) => c.cid === pickerFor.cid)?.tasks ?? []}
          onConfirm={(tasks) => pickedTasks(pickerFor.cid, tasks)}
          onClose={() => setPickerFor(null)}
        />
      ) : null}
    </div>
  );
}

function BudgetCompare({ qty, budgetQty }: { qty: number; budgetQty: number }) {
  if (budgetQty <= 0) return null;
  const pct = Math.round((qty / budgetQty) * 100);
  let tone: "ok" | "warn" | "danger" = "ok";
  let text = `Dự toán: ${budgetQty.toLocaleString("vi-VN")} · Đề xuất ${pct}% dự toán`;
  if (pct > 110) {
    tone = "danger";
    text = `⚠ Vượt dự toán: ${pct}% (dự toán ${budgetQty.toLocaleString("vi-VN")})`;
  } else if (pct > 90) {
    tone = "warn";
    text = `Sát ngưỡng dự toán: ${pct}% (dự toán ${budgetQty.toLocaleString("vi-VN")})`;
  }
  const color =
    tone === "danger"
      ? "bg-[#D26B6B]/15 text-[#D26B6B] border-[#D26B6B]/40"
      : tone === "warn"
        ? "bg-[#E0B855]/15 text-[#E0B855] border-[#E0B855]/40"
        : "bg-[#6FA677]/15 text-[#6FA677] border-[#6FA677]/40";
  return (
    <div className={`mb-4 rounded-xl border-2 px-3 py-2 text-sm ${color}`}>{text}</div>
  );
}
