"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, ChevronRight, FileText, Loader2, Phone, Wallet } from "lucide-react";

type Group = {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  total: number;
  count: number;
  projectCodes: string[];
};

type DetailItem = {
  debtId: string;
  proposalId: string;
  itemSeq: number;
  materialName: string;
  unit: string;
  supplierItemCode: string | null;
  unitPrice: number;
  qty: number;
  amount: number;
  note: string | null;
  recordedAt: string;
  project: { id: string; code: string; name: string };
};

type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
};

const vnd = (n: number) => n.toLocaleString("vi-VN") + "đ";

export function PayablesClient() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/payables", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setGroups(json.groups || []);
      setGrandTotal(json.grandTotal || 0);
    } else {
      toast.error(json.message || "Lỗi tải dữ liệu");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-orange-300">Công nợ phải trả NCC</h1>
            <p className="mt-1 text-xs text-[#8892b0]">
              Tổng công nợ chưa lập lệnh thanh toán hoặc lệnh đã bị huỷ/từ chối.
            </p>
          </div>
          <Link
            href="/payment-orders"
            className="shrink-0 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff] hover:border-orange-400"
          >
            Lệnh thanh toán
          </Link>
        </div>
        <div className="mt-3 rounded-xl bg-[#13151f] p-3">
          <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">Tổng phải trả</div>
          <div className="mt-0.5 text-xl font-bold text-orange-400">{vnd(grandTotal)}</div>
          <div className="text-[11px] text-[#8892b0]">{groups.length} NCC</div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Đang tải…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Chưa có công nợ NCC nào cần thanh toán.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <SupplierCard
              key={g.supplierId}
              group={g}
              isOpen={openSupplierId === g.supplierId}
              onToggle={() =>
                setOpenSupplierId((cur) => (cur === g.supplierId ? null : g.supplierId))
              }
              onPaymentOrderCreated={() => {
                setOpenSupplierId(null);
                reload();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierCard({
  group,
  isOpen,
  onToggle,
  onPaymentOrderCreated,
}: {
  group: Group;
  isOpen: boolean;
  onToggle: () => void;
  onPaymentOrderCreated: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition active:bg-[#13151f]"
      >
        <div className="mt-0.5 rounded-lg bg-orange-500/15 p-2">
          <Building2 className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">{group.supplierCode}</div>
          <div className="truncate text-base font-semibold text-[#f0f2ff]">{group.supplierName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#8892b0]">
            <span>{group.count} món</span>
            <span>·</span>
            <span>{group.projectCodes.join(", ")}</span>
          </div>
          {group.phone && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8892b0]">
              <Phone className="h-3 w-3" /> {group.phone}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-orange-400">{vnd(group.total)}</div>
          <ChevronRight
            className={`ml-auto mt-1 h-4 w-4 text-[#8892b0] transition ${isOpen ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {isOpen && (
        <SupplierDetailPanel
          supplierId={group.supplierId}
          onCreated={onPaymentOrderCreated}
        />
      )}
    </div>
  );
}

function SupplierDetailPanel({
  supplierId,
  onCreated,
}: {
  supplierId: string;
  onCreated: () => void;
}) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<DetailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("transfer");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/payables?supplierId=${supplierId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (cancel) return;
      setLoading(false);
      if (res.ok) {
        setSupplier(json.supplier);
        setItems(json.items || []);
        setSelected(new Set((json.items || []).map((x: DetailItem) => x.debtId)));
      } else {
        toast.error(json.message || "Lỗi tải chi tiết");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [supplierId]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return ns;
    });
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.debtId)));
  };
  const selectedTotal = items.filter((i) => selected.has(i.debtId)).reduce((s, i) => s + i.amount, 0);

  async function submitCreate() {
    if (selected.size === 0) return;
    setCreating(true);
    const res = await fetch("/api/payment-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        debtIds: Array.from(selected),
        paymentMethod,
        note: note.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      toast.error(json.message || "Lỗi tạo lệnh");
      return;
    }
    toast.success(`Đã tạo lệnh ${json.code} — chờ admin duyệt`);
    setShowCreate(false);
    setNote("");
    onCreated();
  }

  if (loading) {
    return (
      <div className="border-t border-[#252840] bg-[#13151f] p-4 text-center text-xs text-[#8892b0]">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" /> Đang tải…
      </div>
    );
  }

  return (
    <div className="border-t border-[#252840] bg-[#13151f] p-4 space-y-3">
      {supplier && (supplier.bankName || supplier.bankAccount) && (
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-2.5 text-[11px] text-[#8892b0]">
          {supplier.bankName && <div>NH: <span className="text-[#f0f2ff]">{supplier.bankName}</span></div>}
          {supplier.bankAccount && <div>STK: <span className="text-[#f0f2ff]">{supplier.bankAccount}</span></div>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-orange-400 hover:underline"
        >
          {selected.size === items.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </button>
        <div className="text-[11px] text-[#8892b0]">
          {selected.size}/{items.length} món
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it) => {
          const checked = selected.has(it.debtId);
          return (
            <label
              key={it.debtId}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${
                checked
                  ? "border-orange-400/60 bg-orange-500/5"
                  : "border-[#252840] bg-[#1a1d2e]"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(it.debtId)}
                className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-[#f0f2ff] break-words">
                    {it.materialName}
                  </div>
                  <div className="shrink-0 text-sm font-bold text-orange-400">
                    {vnd(it.amount)}
                  </div>
                </div>
                <div className="mt-0.5 text-[11px] text-[#8892b0]">
                  {it.qty.toLocaleString("vi-VN")} {it.unit} × {vnd(it.unitPrice)}
                  {it.supplierItemCode ? ` · Mã NCC: ${it.supplierItemCode}` : ""}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8892b0]">
                  <FileText className="h-3 w-3" />
                  <Link
                    href={`/proposals/${it.proposalId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-orange-400"
                  >
                    {it.project.code}
                  </Link>
                </div>
                {it.note && (
                  <div className="mt-1 rounded bg-[#0f1220] px-2 py-1 text-[11px] text-[#8892b0]">
                    {it.note}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="sticky bottom-2 z-10 mt-2 rounded-xl border border-orange-400/40 bg-[#1a1d2e] p-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">Đã chọn</div>
            <div className="text-base font-bold text-orange-400">{vnd(selectedTotal)}</div>
          </div>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition active:scale-95 disabled:cursor-not-allowed disabled:bg-[#2d3249] disabled:text-[#5a627a]"
          >
            <Wallet className="h-4 w-4" /> Tạo lệnh
          </button>
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-[#1a1d2e] p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold text-orange-300">
              Tạo lệnh thanh toán NCC
            </div>
            <div className="mt-1 text-xs text-[#8892b0]">
              {supplier?.name} · {selected.size} món · {vnd(selectedTotal)}
            </div>

            <div className="mt-3 text-xs uppercase tracking-wide text-[#8892b0]">
              Phương thức gợi ý
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["transfer", "cash"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    paymentMethod === m
                      ? "border-orange-400 bg-orange-500/10 text-orange-300"
                      : "border-[#2d3249] bg-[#0b0d16] text-[#8892b0]"
                  }`}
                >
                  {m === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="VD: Trả đợt 1, hẹn 5/7 chuyển KK…"
              className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="flex-1 rounded-xl border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0]"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={creating}
                className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                {creating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Gửi admin duyệt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
