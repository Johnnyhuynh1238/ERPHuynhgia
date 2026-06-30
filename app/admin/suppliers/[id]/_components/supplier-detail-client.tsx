"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, FolderPlus, Tag } from "lucide-react";
import { toast } from "sonner";

type Group = { id: string; name: string; sortOrder: number; _count: { prices: number } };
type Price = {
  id: string;
  groupId: string | null;
  materialName: string;
  unit: string;
  supplierItemCode: string | null;
  unitPrice: number;
  note: string | null;
  updatedAt: string;
};
type Supplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  groups: Group[];
  prices: Price[];
};

function fmtVnd(n: number) {
  return n.toLocaleString("vi-VN");
}

export function SupplierDetailClient({ supplierId }: { supplierId: string }) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [showNewPrice, setShowNewPrice] = useState(false);
  const [editPrice, setEditPrice] = useState<Price | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/suppliers/${supplierId}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setSupplier(j.supplier);
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    supplier?.groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [supplier?.groups]);

  const visiblePrices = useMemo(() => {
    if (!supplier) return [];
    if (filterGroup === "all") return supplier.prices;
    if (filterGroup === "_none") return supplier.prices.filter((p) => !p.groupId);
    return supplier.prices.filter((p) => p.groupId === filterGroup);
  }, [supplier, filterGroup]);

  async function deleteGroup(g: Group) {
    if (g._count.prices > 0) {
      toast.error("Xoá toàn bộ vật tư trong nhóm trước");
      return;
    }
    if (!window.confirm(`Xoá nhóm "${g.name}"?`)) return;
    const res = await fetch(`/api/admin/suppliers/${supplierId}/groups/${g.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || j.error || "Lỗi xoá");
      return;
    }
    toast.success("Đã xoá");
    load();
  }

  async function deletePrice(p: Price) {
    if (!window.confirm(`Xoá vật tư "${p.materialName}"?`)) return;
    const res = await fetch(`/api/admin/suppliers/${supplierId}/prices/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Lỗi xoá");
      return;
    }
    toast.success("Đã xoá");
    load();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Đang tải…
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Không tìm thấy NCC.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/suppliers"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#252840] bg-[#1a1d2e] text-[#8892b0] hover:text-[#f0f2ff]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-[#8892b0]">{supplier.code}</div>
          <h1 className="text-lg font-bold text-[#f0f2ff]">{supplier.name}</h1>
        </div>
        {!supplier.isActive && (
          <span className="rounded-full bg-[#D26B6B]/20 px-2 py-0.5 text-[10px] font-semibold text-[#D26B6B]">
            Tạm ngưng
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-1.5 text-sm text-[#f0f2ff] hover:border-[#ff8a3d]/40"
        >
          <Pencil className="h-4 w-4" /> Sửa
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8892b0]">Liên hệ</div>
          <InfoRow label="SĐT" value={supplier.phone} />
          <InfoRow label="SĐT phụ" value={supplier.altPhone} />
          <InfoRow label="Email" value={supplier.email} />
          <InfoRow label="Địa chỉ" value={supplier.address} />
          <InfoRow label="MST" value={supplier.taxCode} />
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8892b0]">Thanh toán</div>
          <InfoRow label="Ngân hàng" value={supplier.bankName} />
          <InfoRow label="Số TK" value={supplier.bankAccount} />
          <InfoRow label="Chủ TK" value={supplier.bankAccountName} />
          <InfoRow label="Ghi chú" value={supplier.notes} multiline />
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#f0f2ff]">Nhóm hàng ({supplier.groups.length})</div>
          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#ff8a3d] px-3 py-1 text-xs font-semibold text-black hover:bg-[#ffa05f]"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Thêm nhóm
          </button>
        </div>
        {supplier.groups.length === 0 ? (
          <div className="text-xs text-[#8892b0]">Chưa có nhóm hàng.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {supplier.groups.map((g) => (
              <div
                key={g.id}
                className="inline-flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#0f1220] px-2.5 py-1 text-xs"
              >
                <span className="font-semibold text-[#f0f2ff]">{g.name}</span>
                <span className="text-[10px] text-[#8892b0]">{g._count.prices} VT</span>
                <button
                  type="button"
                  onClick={() => setEditGroupId(g.id)}
                  className="text-[#8892b0] hover:text-[#ff8a3d]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(g)}
                  className="text-[#8892b0] hover:text-[#D26B6B]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#f0f2ff]">
            Bảng giá vật tư ({supplier.prices.length})
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="rounded-lg border border-[#2d3249] bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] outline-none"
            >
              <option value="all">Tất cả nhóm</option>
              <option value="_none">Chưa gán nhóm</option>
              {supplier.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewPrice(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#ff8a3d] px-3 py-1 text-xs font-semibold text-black hover:bg-[#ffa05f]"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm vật tư
            </button>
          </div>
        </div>
        {visiblePrices.length === 0 ? (
          <div className="text-xs text-[#8892b0]">Chưa có vật tư trong bảng giá.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[#8892b0]">
                <tr>
                  <th className="px-2 py-1 text-left">Mã NCC</th>
                  <th className="px-2 py-1 text-left">Tên vật tư</th>
                  <th className="px-2 py-1 text-left">ĐVT</th>
                  <th className="px-2 py-1 text-left">Nhóm</th>
                  <th className="px-2 py-1 text-right">Đơn giá</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {visiblePrices.map((p) => (
                  <tr key={p.id} className="border-t border-[#252840] text-[#f0f2ff]">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-[#8892b0]">
                      {p.supplierItemCode || "—"}
                    </td>
                    <td className="px-2 py-1.5">{p.materialName}</td>
                    <td className="px-2 py-1.5 text-[#8892b0]">{p.unit}</td>
                    <td className="px-2 py-1.5 text-[#8892b0]">
                      {p.groupId ? (
                        <span className="inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {groupNameById.get(p.groupId) || "—"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmtVnd(p.unitPrice)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditPrice(p)}
                        className="text-[#8892b0] hover:text-[#ff8a3d]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePrice(p)}
                        className="ml-2 text-[#8892b0] hover:text-[#D26B6B]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EditSupplierModal supplier={supplier} onClose={() => setEditing(false)} onSaved={load} />}
      {showNewGroup && (
        <GroupModal
          supplierId={supplierId}
          onClose={() => setShowNewGroup(false)}
          onSaved={load}
        />
      )}
      {editGroupId && (
        <GroupModal
          supplierId={supplierId}
          group={supplier.groups.find((g) => g.id === editGroupId)}
          onClose={() => setEditGroupId(null)}
          onSaved={load}
        />
      )}
      {showNewPrice && (
        <PriceModal
          supplierId={supplierId}
          groups={supplier.groups}
          onClose={() => setShowNewPrice(false)}
          onSaved={load}
        />
      )}
      {editPrice && (
        <PriceModal
          supplierId={supplierId}
          groups={supplier.groups}
          price={editPrice}
          onClose={() => setEditPrice(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div className="flex gap-2 border-b border-[#252840] py-1 last:border-b-0">
      <div className="w-20 shrink-0 text-[11px] text-[#8892b0]">{label}</div>
      <div className={`flex-1 text-xs text-[#f0f2ff] ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function EditSupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone || "");
  const [altPhone, setAltPhone] = useState(supplier.altPhone || "");
  const [email, setEmail] = useState(supplier.email || "");
  const [address, setAddress] = useState(supplier.address || "");
  const [taxCode, setTaxCode] = useState(supplier.taxCode || "");
  const [bankName, setBankName] = useState(supplier.bankName || "");
  const [bankAccount, setBankAccount] = useState(supplier.bankAccount || "");
  const [bankAccountName, setBankAccountName] = useState(supplier.bankAccountName || "");
  const [notes, setNotes] = useState(supplier.notes || "");
  const [isActive, setIsActive] = useState(supplier.isActive);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 2) {
      toast.error("Nhập tên NCC");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || null,
        altPhone: altPhone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        taxCode: taxCode.trim() || null,
        bankName: bankName.trim() || null,
        bankAccount: bankAccount.trim() || null,
        bankAccountName: bankAccountName.trim() || null,
        notes: notes.trim() || null,
        isActive,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Lỗi lưu");
      return;
    }
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-base font-bold text-[#f0f2ff]">Sửa NCC</div>
        <div className="space-y-2">
          <MiniField label="Tên NCC *" value={name} onChange={setName} />
          <MiniField label="SĐT chính" value={phone} onChange={setPhone} />
          <MiniField label="SĐT phụ" value={altPhone} onChange={setAltPhone} />
          <MiniField label="Email" value={email} onChange={setEmail} />
          <MiniField label="Địa chỉ" value={address} onChange={setAddress} />
          <MiniField label="MST" value={taxCode} onChange={setTaxCode} />
          <MiniField label="Ngân hàng" value={bankName} onChange={setBankName} />
          <MiniField label="Số TK" value={bankAccount} onChange={setBankAccount} />
          <MiniField label="Tên chủ TK" value={bankAccountName} onChange={setBankAccountName} />
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#f0f2ff]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#ff8a3d]"
            />
            Đang hoạt động
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[#2d3249] px-3 py-1.5 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-[#ff8a3d] px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupModal({
  supplierId,
  group,
  onClose,
  onSaved,
}: {
  supplierId: string;
  group?: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name || "");
  const [sortOrder, setSortOrder] = useState(group?.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 1) {
      toast.error("Nhập tên nhóm");
      return;
    }
    setBusy(true);
    const res = await fetch(
      group
        ? `/api/admin/suppliers/${supplierId}/groups/${group.id}`
        : `/api/admin/suppliers/${supplierId}/groups`,
      {
        method: group ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sortOrder }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || j.error || "Lỗi lưu");
      return;
    }
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-base font-bold text-[#f0f2ff]">
          {group ? "Sửa nhóm" : "Thêm nhóm"}
        </div>
        <div className="space-y-2">
          <MiniField label="Tên nhóm *" value={name} onChange={setName} />
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Thứ tự</div>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[#2d3249] px-3 py-1.5 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-[#ff8a3d] px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceModal({
  supplierId,
  groups,
  price,
  onClose,
  onSaved,
}: {
  supplierId: string;
  groups: Group[];
  price?: Price;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [materialName, setMaterialName] = useState(price?.materialName || "");
  const [unit, setUnit] = useState(price?.unit || "");
  const [supplierItemCode, setSupplierItemCode] = useState(price?.supplierItemCode || "");
  const [unitPrice, setUnitPrice] = useState(String(price?.unitPrice ?? ""));
  const [groupId, setGroupId] = useState<string>(price?.groupId || "");
  const [note, setNote] = useState(price?.note || "");
  const [busy, setBusy] = useState(false);

  const isEdit = !!price;

  async function save() {
    if (!materialName.trim() || !unit.trim()) {
      toast.error("Nhập tên vật tư + ĐVT");
      return;
    }
    const num = Number(unitPrice.replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) {
      toast.error("Đơn giá phải > 0");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/suppliers/${supplierId}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialName: materialName.trim(),
        unit: unit.trim(),
        supplierItemCode: supplierItemCode.trim() || undefined,
        unitPrice: num,
        groupId: groupId || null,
        note: note.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Lỗi lưu");
      return;
    }
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-base font-bold text-[#f0f2ff]">
          {isEdit ? "Sửa vật tư" : "Thêm vật tư vào bảng giá"}
        </div>
        <div className="space-y-2">
          <MiniField label="Tên vật tư *" value={materialName} onChange={setMaterialName} disabled={isEdit} />
          <MiniField label="ĐVT *" value={unit} onChange={setUnit} disabled={isEdit} placeholder="VD: kg, m, cây" />
          <MiniField
            label="Mã hàng của NCC"
            value={supplierItemCode}
            onChange={setSupplierItemCode}
            placeholder="VD: SAT-D10"
          />
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Đơn giá (VNĐ) *</div>
            <input
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Nhóm hàng</div>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            >
              <option value="">— Chưa gán —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[#2d3249] px-3 py-1.5 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-[#ff8a3d] px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60 disabled:opacity-60"
      />
    </label>
  );
}
