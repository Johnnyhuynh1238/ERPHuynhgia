"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  Lock,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

type ReceiptInfo = {
  receivedQty: number;
  qcChecked: boolean;
  photoCount: number;
  note: string | null;
  receivedAt: string;
};
type DebtInfo = {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierItemCode: string | null;
  unitPrice: number;
  qty: number;
  totalAmount: number;
  note: string | null;
  recordedAt: string;
  paidAt: string | null;
};
type Item = {
  seq: number;
  name: string;
  unit: string;
  qty: number;
  task: string;
  receipt: ReceiptInfo | null;
  debt: DebtInfo | null;
};
type SupplierLite = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
};

function fmtVnd(n: number) {
  return n.toLocaleString("vi-VN");
}
function fmtQty(n: number) {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/\.?0+$/, "");
}

export function ProposalKtItems({
  proposalId,
  currentUserRole,
  onProposalUpdated,
}: {
  proposalId: string;
  currentUserRole: string;
  onProposalUpdated?: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/proposals/${proposalId}/items`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setItems(j.items);
      setClosedAt(j.closedAt);
      setOrderStatus(j.orderStatus);
    }
  }, [proposalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const summary = useMemo(() => {
    if (!items) return { recv: 0, debt: 0, total: 0, money: 0 };
    let recv = 0;
    let debt = 0;
    let money = 0;
    for (const it of items) {
      if (it.receipt && it.receipt.receivedQty + 1e-6 >= it.qty && it.qty > 0) recv += 1;
      if (it.debt) {
        debt += 1;
        money += it.debt.totalAmount;
      }
    }
    return { recv, debt, total: items.length, money };
  }, [items]);

  async function closePo() {
    if (!window.confirm("Đóng PO này? Sau khi đóng, KS không nhận thêm được. Cần admin để mở lại.")) return;
    setClosing(true);
    const res = await fetch(`/api/proposals/${proposalId}/close`, { method: "POST" });
    setClosing(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi đóng PO");
      return;
    }
    toast.success("Đã đóng PO");
    onProposalUpdated?.();
    reload();
  }

  async function reopenPo() {
    if (!window.confirm("Mở lại PO này?")) return;
    const res = await fetch(`/api/proposals/${proposalId}/close`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi mở lại");
      return;
    }
    toast.success("Đã mở lại PO");
    onProposalUpdated?.();
    reload();
  }

  if (loading || !items) {
    return (
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-center text-sm text-[#8892b0]">
        Đang tải danh sách vật tư…
      </div>
    );
  }

  const canClose = !closedAt && orderStatus !== "not_ordered";
  const canReopen = !!closedAt && currentUserRole === "admin";

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#f0f2ff]">
            <Receipt className="h-4 w-4 text-[#fb923c]" />
            Nhận hàng & Công nợ theo món
          </div>
          <div className="mt-0.5 text-[11px] text-[#8892b0]">
            Nhận: <b className="text-[#f0f2ff]">{summary.recv}</b>/{summary.total} · CN:{" "}
            <b className="text-[#f0f2ff]">{summary.debt}</b>/{summary.total} ·{" "}
            <span className="text-emerald-300">{fmtVnd(summary.money)} ₫</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canClose && (
            <button
              type="button"
              onClick={closePo}
              disabled={closing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              Hoàn tất PO
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={reopenPo}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2d3249] bg-[#0f1220] px-3 py-1.5 text-xs text-[#8892b0] hover:text-[#f0f2ff]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Mở lại
            </button>
          )}
        </div>
      </div>

      {closedAt && (
        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          PO đã đóng lúc {new Date(closedAt).toLocaleString("vi-VN")}. KS không nhận thêm được.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-[#8892b0]">
            <tr>
              <th className="px-2 py-1 text-left">Vật tư</th>
              <th className="px-2 py-1 text-right">Đặt</th>
              <th className="px-2 py-1 text-right">Nhận</th>
              <th className="px-2 py-1 text-left">NCC</th>
              <th className="px-2 py-1 text-right">Đơn giá</th>
              <th className="px-2 py-1 text-right">Thành tiền</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.seq} className="border-t border-[#252840] text-[#f0f2ff]">
                <td className="px-2 py-2">
                  <div className="font-semibold">{it.name}</div>
                  {it.task && <div className="text-[10px] text-[#5a627a]">{it.task}</div>}
                  {it.receipt && (
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#8892b0]">
                      {it.receipt.qcChecked && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> QC OK
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5">
                        <ImageIcon className="h-3 w-3" /> {it.receipt.photoCount}
                      </span>
                      {it.receipt.note && (
                        <span className="truncate italic">&ldquo;{it.receipt.note}&rdquo;</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-[11px]">
                  {fmtQty(it.qty)} {it.unit}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-[11px]">
                  {it.receipt ? (
                    <span
                      className={
                        it.receipt.receivedQty + 1e-6 >= it.qty ? "text-emerald-300" : "text-amber-300"
                      }
                    >
                      {fmtQty(it.receipt.receivedQty)} {it.unit}
                    </span>
                  ) : (
                    <span className="text-[#5a627a]">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {it.debt ? (
                    <div>
                      <div className="text-[11px] font-semibold text-[#f0f2ff]">{it.debt.supplierName}</div>
                      <div className="text-[10px] text-[#8892b0]">
                        {it.debt.supplierCode}
                        {it.debt.supplierItemCode && ` · ${it.debt.supplierItemCode}`}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[#5a627a]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-[11px]">
                  {it.debt ? fmtVnd(it.debt.unitPrice) : <span className="text-[#5a627a]">—</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold">
                  {it.debt ? (
                    <span className="text-emerald-300">{fmtVnd(it.debt.totalAmount)}</span>
                  ) : (
                    <span className="text-[#5a627a]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  {!closedAt &&
                    (it.receipt ? (
                      <button
                        type="button"
                        onClick={() => setOpenSeq(it.seq)}
                        className="rounded-lg bg-[#ff8a3d] px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-[#ffa05f]"
                      >
                        {it.debt ? "Sửa" : "Ghi CN"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-[#5a627a]">Chờ KS nhận</span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openSeq !== null && (
        <DebtModal
          proposalId={proposalId}
          item={items.find((i) => i.seq === openSeq)!}
          onClose={() => setOpenSeq(null)}
          onSaved={() => {
            setOpenSeq(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DebtModal({
  proposalId,
  item,
  onClose,
  onSaved,
}: {
  proposalId: string;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState<string>(item.debt?.supplierId ?? "");
  const [supplierLabel, setSupplierLabel] = useState<string>(
    item.debt ? `${item.debt.supplierCode} — ${item.debt.supplierName}` : "",
  );
  const [supplierItemCode, setSupplierItemCode] = useState<string>(
    item.debt?.supplierItemCode ?? "",
  );
  const [unitPrice, setUnitPrice] = useState<string>(item.debt ? String(item.debt.unitPrice) : "");
  const [qty, setQty] = useState<string>(
    item.debt ? String(item.debt.qty) : String(item.receipt?.receivedQty ?? item.qty),
  );
  const [note, setNote] = useState<string>(item.debt?.note ?? "");
  const [saveToCatalog, setSaveToCatalog] = useState<boolean>(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadSuppliers = useCallback(async (search: string) => {
    const url = new URL("/api/admin/suppliers", window.location.origin);
    if (search.trim()) url.searchParams.set("q", search.trim());
    const res = await fetch(url.toString(), { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setSuppliers(j.suppliers || []);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(() => loadSuppliers(q), 200);
    return () => clearTimeout(t);
  }, [pickerOpen, q, loadSuppliers]);

  // Khi chọn NCC mới → fetch suggested price từ catalog
  const lastFetchedSupplierRef = useRef<string>("");
  useEffect(() => {
    if (!supplierId || supplierId === lastFetchedSupplierRef.current) return;
    if (item.debt && item.debt.supplierId === supplierId) {
      // KT mở modal sửa cùng NCC → giữ giá đã ghi, không auto-fill đè.
      lastFetchedSupplierRef.current = supplierId;
      return;
    }
    lastFetchedSupplierRef.current = supplierId;
    (async () => {
      const res = await fetch(
        `/api/proposals/${proposalId}/items?supplierId=${supplierId}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const matched = (j.items as Item[] | undefined)?.find((it) => it.seq === item.seq) as
        | (Item & { suggestedPrice?: { unitPrice: number; supplierItemCode: string | null } | null })
        | undefined;
      if (matched?.suggestedPrice) {
        setUnitPrice(String(matched.suggestedPrice.unitPrice));
        if (matched.suggestedPrice.supplierItemCode) {
          setSupplierItemCode(matched.suggestedPrice.supplierItemCode);
        }
        toast.success("Đã auto-fill giá từ catalog NCC");
      }
    })();
  }, [supplierId, proposalId, item.seq, item.debt]);

  function pickSupplier(s: SupplierLite) {
    setSupplierId(s.id);
    setSupplierLabel(`${s.code} — ${s.name}`);
    setPickerOpen(false);
    setQ("");
  }

  async function createSupplier(form: { name: string; phone: string; address: string }) {
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || j.error || "Lỗi tạo NCC");
      return;
    }
    const j = await res.json();
    pickSupplier({
      id: j.supplier.id,
      code: j.supplier.code,
      name: j.supplier.name,
      phone: null,
    });
    setShowNewSupplier(false);
    toast.success("Đã tạo NCC mới");
  }

  async function save() {
    if (!supplierId) {
      toast.error("Chọn NCC");
      return;
    }
    const priceNum = Number(unitPrice.replace(/[^0-9.]/g, ""));
    const qtyNum = Number(qty.replace(",", "."));
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("Đơn giá phải > 0");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Số lượng phải > 0");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/proposals/${proposalId}/items/${item.seq}/debt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        supplierItemCode: supplierItemCode.trim() || null,
        unitPrice: priceNum,
        qty: qtyNum,
        note: note.trim() || null,
        saveToSupplierCatalog: saveToCatalog,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi ghi công nợ");
      return;
    }
    toast.success("Đã ghi công nợ");
    onSaved();
  }

  async function deleteDebt() {
    if (!item.debt) return;
    if (!window.confirm("Xoá công nợ của vật tư này?")) return;
    setDeleting(true);
    const res = await fetch(`/api/proposals/${proposalId}/items/${item.seq}/debt`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!res.ok) {
      toast.error("Lỗi xoá");
      return;
    }
    toast.success("Đã xoá công nợ");
    onSaved();
  }

  const total = (Number(unitPrice.replace(/[^0-9.]/g, "")) || 0) * (Number(qty.replace(",", ".")) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">
            Ghi công nợ
          </div>
          <div className="text-base font-bold text-[#f0f2ff]">{item.name}</div>
          <div className="text-[11px] text-[#8892b0]">
            Đặt: {fmtQty(item.qty)} {item.unit}
            {item.receipt && ` · Đã nhận: ${fmtQty(item.receipt.receivedQty)} ${item.unit}`}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">NCC *</div>
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-left text-sm text-[#f0f2ff]"
            >
              <span>{supplierLabel || <span className="text-[#5a627a]">— Chọn NCC —</span>}</span>
              <Search className="h-4 w-4 text-[#8892b0]" />
            </button>
            {pickerOpen && (
              <div className="mt-1 rounded-lg border border-[#2d3249] bg-[#0f1220] p-1">
                <div className="flex items-center gap-2 border-b border-[#252840] px-2 py-1">
                  <Search className="h-3.5 w-3.5 text-[#8892b0]" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm theo tên / mã / SĐT"
                    className="flex-1 bg-transparent text-sm text-[#f0f2ff] outline-none"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {suppliers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#8892b0]">Không có NCC nào.</div>
                  ) : (
                    suppliers.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => pickSupplier(s)}
                        className="block w-full px-3 py-1.5 text-left hover:bg-[#252840]"
                      >
                        <div className="text-xs font-semibold text-[#f0f2ff]">{s.name}</div>
                        <div className="text-[10px] text-[#8892b0]">
                          {s.code}
                          {s.phone && ` · ${s.phone}`}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSupplier(true);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 border-t border-[#252840] px-3 py-2 text-left text-xs font-semibold text-[#fb923c] hover:bg-[#252840]"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm NCC mới
                </button>
              </div>
            )}
          </label>

          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
              Mã hàng của NCC
            </div>
            <input
              value={supplierItemCode}
              onChange={(e) => setSupplierItemCode(e.target.value)}
              placeholder="VD: SAT-D10"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
                Đơn giá (₫) *
              </div>
              <input
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
              />
            </label>
            <label className="block">
              <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
                Số lượng ({item.unit}) *
              </div>
              <input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
              />
            </label>
          </div>

          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <Wallet className="mr-1 inline h-4 w-4" />
            Thành tiền: <b>{fmtVnd(total)} ₫</b>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-xs text-[#f0f2ff]">
            <input
              type="checkbox"
              checked={saveToCatalog}
              onChange={(e) => setSaveToCatalog(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#ff8a3d]"
            />
            <span>
              Cập nhật bảng giá NCC này ({item.name} — {item.unit}). Lần sau sẽ tự auto-fill giá.
            </span>
          </label>

          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="VD: nợ 7 ngày, hoá đơn GTGT, …"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {item.debt && (
            <button
              type="button"
              onClick={deleteDebt}
              disabled={deleting || busy}
              className="mr-auto inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xoá CN
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[#2d3249] px-3 py-1.5 text-sm text-[#8892b0]"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-[#ff8a3d] px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu CN"}
          </button>
        </div>

        {showNewSupplier && (
          <NewSupplierInline onClose={() => setShowNewSupplier(false)} onCreated={createSupplier} />
        )}
      </div>
    </div>
  );
}

function NewSupplierInline({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (form: { name: string; phone: string; address: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3">
      <div className="w-full max-w-sm rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-base font-bold text-[#f0f2ff]">Thêm NCC mới</div>
        <div className="space-y-2">
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Tên NCC *</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: NCC Sắt Thép Tâm Anh"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">SĐT</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Địa chỉ</div>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#2d3249] px-3 py-1.5 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => {
              if (name.trim().length < 2) {
                toast.error("Nhập tên NCC");
                return;
              }
              onCreated({ name, phone, address });
            }}
            className="rounded-xl bg-[#ff8a3d] px-4 py-1.5 text-sm font-semibold text-black"
          >
            Tạo NCC
          </button>
        </div>
      </div>
    </div>
  );
}
