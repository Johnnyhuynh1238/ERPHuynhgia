"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  ImageIcon,
  Loader2,
  Lock,
  PackageCheck,
  Pencil,
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
  debtUnit: string | null;
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
type CatalogPrice = {
  id: string;
  materialName: string;
  unit: string;
  supplierItemCode: string | null;
  unitPrice: number;
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
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Đang tải danh sách vật tư…
      </div>
    );
  }

  const canClose = !closedAt && orderStatus !== "not_ordered";
  const canReopen = !!closedAt && currentUserRole === "admin";
  const allDebted = summary.debt === summary.total && summary.total > 0;
  const allReceived = summary.recv === summary.total && summary.total > 0;
  const readyToClose = canClose && allReceived && allDebted;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#13151f] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff8a3d]/15 text-[#fb923c]">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[#f0f2ff]">Nhận hàng & Công nợ theo món</div>
            <div className="mt-0.5 text-[11px] text-[#8892b0]">
              KT ghi NCC + giá cho từng món, xong hoàn tất PO
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile
            label="Đã nhận"
            value={`${summary.recv}/${summary.total}`}
            tone={allReceived ? "good" : summary.recv > 0 ? "warn" : "muted"}
            icon={<PackageCheck className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Đã ghi CN"
            value={`${summary.debt}/${summary.total}`}
            tone={allDebted ? "good" : summary.debt > 0 ? "warn" : "muted"}
            icon={<ClipboardList className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Tổng tiền"
            value={`${fmtVnd(summary.money)}₫`}
            tone={summary.money > 0 ? "good" : "muted"}
            icon={<Wallet className="h-3.5 w-3.5" />}
            small
          />
        </div>

      </div>

      <div className="space-y-2">
        {items.map((it) => (
          <ItemCard
            key={it.seq}
            item={it}
            locked={!!closedAt}
            onOpen={() => setOpenSeq(it.seq)}
          />
        ))}
      </div>

      {closedAt ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-emerald-200">PO đã hoàn tất</div>
              <div className="mt-0.5 text-[11px] text-emerald-300/80">
                Lúc {new Date(closedAt).toLocaleString("vi-VN")}. Công nợ đã chuyển sang{" "}
                <a href="/payables" className="underline">/payables</a> để tạo lệnh thanh toán.
              </div>
            </div>
          </div>
          {canReopen && (
            <button
              type="button"
              onClick={reopenPo}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-xs text-[#8892b0] hover:text-[#f0f2ff]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Mở lại PO (admin)
            </button>
          )}
        </div>
      ) : canClose ? (
        <div
          className={`rounded-2xl border p-4 ${
            readyToClose
              ? "border-emerald-400/40 bg-emerald-500/5"
              : "border-[#252840] bg-[#1a1d2e]"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                readyToClose
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-[#252840] text-[#8892b0]"
              }`}
            >
              <Lock className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#f0f2ff]">Hoàn tất PO</div>
              <div className="mt-0.5 text-[11px] text-[#8892b0]">Bước cuối — sau khi nhận đủ hàng & ghi xong CN tất cả món.</div>
            </div>
          </div>
          <ul className="mt-3 space-y-1 rounded-xl bg-[#0f1220] p-2.5 text-[11px] text-[#8892b0]">
            <li className="flex items-start gap-1.5">
              <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-400" />
              <span>KS không nhận thêm được hàng cho PO này.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-400" />
              <span>KT không sửa được công nợ nữa (khoá sổ).</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
              <span>
                Công nợ chuyển sang <a href="/payables" className="underline">Công nợ NCC</a> để tạo lệnh thanh toán.
              </span>
            </li>
          </ul>
          <button
            type="button"
            onClick={closePo}
            disabled={closing || !readyToClose}
            className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition disabled:cursor-not-allowed ${
              readyToClose
                ? "bg-emerald-500 text-[#0b0d16] hover:bg-emerald-400 shadow-[0_8px_24px_-12px_rgba(16,185,129,0.6)]"
                : "bg-[#252840] text-[#5a627a]"
            }`}
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {readyToClose
              ? "Hoàn tất PO"
              : !allReceived
                ? `Còn ${summary.total - summary.recv} món chưa nhận`
                : `Còn ${summary.total - summary.debt} món chưa ghi CN`}
          </button>
        </div>
      ) : null}

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

function StatTile({
  label,
  value,
  tone,
  icon,
  small,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "muted";
  icon: React.ReactNode;
  small?: boolean;
}) {
  const toneCls =
    tone === "good"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-[#2d3249] bg-[#0f1220] text-[#8892b0]";
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${toneCls}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-0.5 font-bold tabular-nums ${small ? "text-sm" : "text-base"}`}>{value}</div>
    </div>
  );
}

function ItemCard({
  item: it,
  locked,
  onOpen,
}: {
  item: Item;
  locked: boolean;
  onOpen: () => void;
}) {
  const fullyReceived = it.receipt && it.receipt.receivedQty + 1e-6 >= it.qty && it.qty > 0;
  const state: "waiting" | "received_no_debt" | "complete" = !it.receipt
    ? "waiting"
    : it.debt
      ? "complete"
      : "received_no_debt";
  const stateMeta = {
    waiting: {
      border: "border-[#2d3249]",
      stripe: "bg-[#3a3f5c]",
      chip: "bg-[#252840] text-[#8892b0]",
      chipLabel: "Chờ KS nhận",
      icon: <CircleDashed className="h-3 w-3" />,
    },
    received_no_debt: {
      border: "border-amber-400/40",
      stripe: "bg-amber-400",
      chip: "bg-amber-500/20 text-amber-200",
      chipLabel: "Chờ KT ghi CN",
      icon: <ClipboardList className="h-3 w-3" />,
    },
    complete: {
      border: "border-emerald-400/30",
      stripe: "bg-emerald-400",
      chip: "bg-emerald-500/15 text-emerald-200",
      chipLabel: "Đã ghi CN",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  }[state];

  const clickable = !locked && state !== "waiting";
  const handleClick = clickable ? onOpen : undefined;

  return (
    <div
      onClick={handleClick}
      className={`relative overflow-hidden rounded-2xl border ${stateMeta.border} bg-[#1a1d2e] p-3 transition ${
        clickable ? "cursor-pointer hover:border-[#ff8a3d]/60 active:bg-[#13151f]" : ""
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${stateMeta.stripe}`} />

      <div className="pl-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#252840] px-1.5 text-[10px] font-bold text-[#8892b0]">
                #{it.seq}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateMeta.chip}`}
              >
                {stateMeta.icon}
                {stateMeta.chipLabel}
              </span>
            </div>
            <div className="mt-1 text-sm font-bold text-[#f0f2ff]">{it.name}</div>
            {it.task && <div className="mt-0.5 text-[11px] text-[#5a627a]">{it.task}</div>}
          </div>
          {clickable && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#5a627a]" />}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-[#0f1220] p-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#5a627a]">Đặt</div>
            <div className="mt-0.5 text-sm font-semibold text-[#f0f2ff] tabular-nums">
              {fmtQty(it.qty)} <span className="text-[11px] font-normal text-[#8892b0]">{it.unit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#5a627a]">Đã nhận</div>
            <div
              className={`mt-0.5 text-sm font-semibold tabular-nums ${
                it.receipt
                  ? fullyReceived
                    ? "text-emerald-300"
                    : "text-amber-300"
                  : "text-[#5a627a]"
              }`}
            >
              {it.receipt ? (
                <>
                  {fmtQty(it.receipt.receivedQty)}{" "}
                  <span className="text-[11px] font-normal opacity-80">{it.unit}</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        {it.receipt && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#8892b0]">
            {it.receipt.qcChecked && (
              <span className="inline-flex items-center gap-0.5 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> QC OK
              </span>
            )}
            <span className="inline-flex items-center gap-0.5">
              <ImageIcon className="h-3 w-3" /> {it.receipt.photoCount} ảnh
            </span>
            {it.receipt.note && (
              <span className="truncate italic">&ldquo;{it.receipt.note}&rdquo;</span>
            )}
          </div>
        )}

        {it.debt ? (
          <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-emerald-300/70">NCC</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-[#f0f2ff]">
                  {it.debt.supplierName}
                </div>
                <div className="truncate text-[11px] text-[#8892b0]">
                  {it.debt.supplierCode}
                  {it.debt.supplierItemCode && ` · ${it.debt.supplierItemCode}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-wide text-emerald-300/70">Thành tiền</div>
                <div className="mt-0.5 text-base font-bold text-emerald-300 tabular-nums">
                  {fmtVnd(it.debt.totalAmount)}₫
                </div>
                <div className="text-[10px] text-[#8892b0] tabular-nums">
                  {fmtVnd(it.debt.unitPrice)}₫ × {fmtQty(it.debt.qty)}
                  {it.debt.debtUnit && it.debt.debtUnit !== it.unit && (
                    <span className="font-semibold text-amber-300"> {it.debt.debtUnit}</span>
                  )}
                </div>
              </div>
            </div>
            {!locked && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#2d3249] bg-[#0f1220] px-2.5 py-1 text-[11px] text-[#8892b0] hover:border-[#ff8a3d]/60 hover:text-[#f0f2ff]"
                >
                  <Pencil className="h-3 w-3" /> Sửa CN
                </button>
              </div>
            )}
          </div>
        ) : it.receipt ? (
          !locked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff8a3d] px-3 py-2 text-sm font-bold text-black hover:bg-[#ffa05f]"
            >
              <Plus className="h-4 w-4" /> Ghi công nợ
            </button>
          )
        ) : (
          <div className="mt-2 rounded-xl border border-dashed border-[#2d3249] px-3 py-2 text-center text-[11px] text-[#5a627a]">
            Chờ KS nhận hàng tại công trình
          </div>
        )}
      </div>
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
  const [debtUnit, setDebtUnit] = useState<string>(item.debt?.debtUnit ?? "");
  const [note, setNote] = useState<string>(item.debt?.note ?? "");
  const [saveToCatalog, setSaveToCatalog] = useState<boolean>(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalog, setCatalog] = useState<CatalogPrice[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");

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

  // Load bảng giá NCC khi đổi supplier để KT có dropdown chọn mã hàng.
  useEffect(() => {
    if (!supplierId) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    (async () => {
      const res = await fetch(`/api/admin/suppliers/${supplierId}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      setCatalogLoading(false);
      if (res.ok) {
        const prices = (j.supplier?.prices ?? []) as CatalogPrice[];
        setCatalog(prices);
      } else {
        setCatalog([]);
      }
    })();
  }, [supplierId]);

  function pickCatalogItem(p: CatalogPrice) {
    setSupplierItemCode(p.supplierItemCode?.trim() || p.materialName);
    setUnitPrice(String(p.unitPrice));
    setCatalogOpen(false);
    setCatalogQ("");
    toast.success(`Đã chọn: ${p.materialName}`);
  }

  const filteredCatalog = useMemo(() => {
    const q = catalogQ.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.materialName.toLowerCase().includes(q) ||
        (p.supplierItemCode ?? "").toLowerCase().includes(q) ||
        p.unit.toLowerCase().includes(q),
    );
  }, [catalog, catalogQ]);

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
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Đơn giá không hợp lệ");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error("Số lượng không hợp lệ");
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
        debtUnit: debtUnit.trim() || null,
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
  const debtUnitClean = debtUnit.trim();
  const effectiveUnit = debtUnitClean || item.unit;
  const unitMismatch = !!debtUnitClean && debtUnitClean !== item.unit;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#1a1d2e] p-4 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">
              Ghi công nợ
            </div>
            <div className="text-base font-bold text-[#f0f2ff]">{item.name}</div>
            <div className="text-[11px] text-[#8892b0]">
              Đặt: {fmtQty(item.qty)} {item.unit}
              {item.receipt && ` · Đã nhận: ${fmtQty(item.receipt.receivedQty)} ${item.unit}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <div className="block">
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
          </div>

          <div className="block">
            <div className="mb-0.5 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">
                Mã hàng của NCC
              </div>
              {supplierId && (
                <button
                  type="button"
                  onClick={() => setCatalogOpen((v) => !v)}
                  disabled={catalogLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-[#2d3249] bg-[#0f1220] px-2 py-0.5 text-[10px] font-semibold text-[#fb923c] hover:border-[#ff8a3d]/60 disabled:opacity-50"
                >
                  {catalogLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  Chọn từ bảng giá ({catalog.length})
                </button>
              )}
            </div>
            <input
              value={supplierItemCode}
              onChange={(e) => setSupplierItemCode(e.target.value)}
              placeholder={supplierId ? "Chọn từ bảng giá hoặc tự nhập" : "Chọn NCC trước"}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
            {catalogOpen && supplierId && (
              <div className="mt-1 rounded-lg border border-[#2d3249] bg-[#0f1220] p-1">
                <div className="flex items-center gap-2 border-b border-[#252840] px-2 py-1">
                  <Search className="h-3.5 w-3.5 text-[#8892b0]" />
                  <input
                    autoFocus
                    value={catalogQ}
                    onChange={(e) => setCatalogQ(e.target.value)}
                    placeholder="Tìm theo tên / mã / đơn vị"
                    className="flex-1 bg-transparent text-sm text-[#f0f2ff] outline-none"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {catalog.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#8892b0]">
                      NCC này chưa có bảng giá. Nhập tay hoặc tick &ldquo;Cập nhật bảng giá&rdquo; bên dưới để tạo.
                    </div>
                  ) : filteredCatalog.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#8892b0]">Không tìm thấy.</div>
                  ) : (
                    filteredCatalog.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => pickCatalogItem(p)}
                        className="block w-full px-3 py-1.5 text-left hover:bg-[#252840]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-[#f0f2ff]">
                            {p.materialName}
                          </div>
                          <div className="shrink-0 text-[11px] font-bold text-emerald-300 tabular-nums">
                            {fmtVnd(p.unitPrice)}₫
                          </div>
                        </div>
                        <div className="text-[10px] text-[#8892b0]">
                          {p.supplierItemCode ? `${p.supplierItemCode} · ` : ""}
                          {p.unit}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
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
                Số lượng ({effectiveUnit}) *
              </div>
              <input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
              />
            </label>
            <label className="block">
              <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
                Đvt NCC
              </div>
              <input
                value={debtUnit}
                onChange={(e) => setDebtUnit(e.target.value)}
                placeholder={item.unit}
                className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-2 py-2 text-sm font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
              />
            </label>
          </div>

          {unitMismatch && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <div className="font-semibold">Đơn vị NCC khác đơn vị đề xuất</div>
              <div className="mt-0.5 text-amber-100/90">
                KS đặt <b>{fmtQty(item.qty)} {item.unit}</b>
                {item.receipt && ` · KS nhận ${fmtQty(item.receipt.receivedQty)} ${item.unit}`}
                {" · "}KT ghi CN <b>{qty || 0} {effectiveUnit}</b>
              </div>
            </div>
          )}

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
              Cập nhật bảng giá NCC này ({item.name} — {effectiveUnit}). Lần sau sẽ tự auto-fill giá.
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
    </div>,
    document.body,
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#1a1d2e] p-4 sm:rounded-2xl"
      >
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
    </div>,
    document.body,
  );
}
