"use client";

import Link from "next/link";
import { confirmDialog } from "@/components/confirm-dialog";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { plexSans } from "@/lib/fonts";
import "./supplier-detail.css";

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

const fmtVnd = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${`0${d.getDate()}`.slice(-2)}/${`0${d.getMonth() + 1}`.slice(-2)}/${d.getFullYear()}`;
};

// Dùng ở 2 nơi: trang /admin/suppliers/[id] (onClose không có → nút "← Danh sách")
// và bottom-sheet trong màn Quản lý NCC dự án (onClose có → nút ✕).
export function SupplierDetailClient({
  supplierId,
  onClose,
}: {
  supplierId: string;
  onClose?: () => void;
}) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [newPriceGroup, setNewPriceGroup] = useState<string | "" | null>(null); // groupId ("" = chưa nhóm), null = đóng
  const [editPrice, setEditPrice] = useState<Price | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/suppliers/${supplierId}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setSupplier(j.supplier);
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  // Gom VT theo nhóm (giữ thứ tự nhóm), VT chưa gán nhóm dồn cuối.
  const sections = useMemo(() => {
    if (!supplier) return [] as { id: string | null; name: string; prices: Price[] }[];
    const byGroup = new Map<string | null, Price[]>();
    for (const p of supplier.prices) {
      const k = p.groupId ?? null;
      (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(p);
    }
    const out = supplier.groups
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((g) => ({ id: g.id, name: g.name, prices: byGroup.get(g.id) ?? [] }));
    const none = byGroup.get(null);
    if (none && none.length) out.push({ id: null, name: "Chưa phân nhóm", prices: none });
    return out;
  }, [supplier]);

  const lastUpdate = useMemo(() => {
    if (!supplier?.prices.length) return null;
    return supplier.prices.reduce<string | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null);
  }, [supplier]);

  async function deleteGroup(g: Group) {
    if (g._count.prices > 0) return toast.error("Xoá hết vật tư trong nhóm trước");
    if (!(await confirmDialog(`Xoá nhóm "${g.name}"?`))) return;
    const res = await fetch(`/api/admin/suppliers/${supplierId}/groups/${g.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Lỗi xoá");
    toast.success("Đã xoá");
    load();
  }
  async function deletePrice(p: Price) {
    if (!(await confirmDialog(`Xoá vật tư "${p.materialName}"?`))) return;
    const res = await fetch(`/api/admin/suppliers/${supplierId}/prices/${p.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Lỗi xoá");
    toast.success("Đã xoá");
    load();
  }

  const wrapCls = `sndoc ${plexSans.variable}${onClose ? " sheet" : ""}`;

  if (loading) {
    return (
      <div className={wrapCls}>
        <div className="empty">Đang tải…</div>
      </div>
    );
  }
  if (!supplier) {
    return (
      <div className={wrapCls}>
        <div className="empty">Không tìm thấy NCC.</div>
      </div>
    );
  }

  const closeBtn = onClose ? (
    <button type="button" className="sn-close" onClick={onClose} aria-label="Đóng">
      ✕
    </button>
  ) : (
    <Link href="/admin/suppliers" className="sn-back">
      ← Danh sách NCC
    </Link>
  );

  return (
    <div className={wrapCls}>
      {/* topbar */}
      <div className="sn-top">
        <div className="sn-brand">
          <div className="sn-mk">H6</div>
          <div>
            <b>HUỲNH GIA</b>
            <span>Nhà cung cấp</span>
          </div>
        </div>
        {closeBtn}
      </div>

      {/* header NCC */}
      <div className="sn-hd">
        <div className="sn-eyebrow">Nhà cung cấp vật tư</div>
        <div className="sn-h1">
          {supplier.name}
          <span className="sn-code">{supplier.code}</span>
          {!supplier.isActive && <span className="sn-off">Tạm ngưng</span>}
        </div>
        <div className="sn-info">
          {supplier.phone && (
            <span>
              <span className="ic">📞</span>
              <b>{supplier.phone}</b>
            </span>
          )}
          {supplier.address && (
            <span>
              <span className="ic">📍</span>
              {supplier.address}
            </span>
          )}
          {supplier.bankName && (
            <span>
              <span className="ic">🏦</span>
              {supplier.bankName}
              {supplier.bankAccount ? ` · ` : ""}
              {supplier.bankAccount && <b>{supplier.bankAccount}</b>}
              {supplier.bankAccountName ? ` · ${supplier.bankAccountName}` : ""}
            </span>
          )}
          {supplier.taxCode && (
            <span>
              <span className="ic">🧾</span>MST {supplier.taxCode}
            </span>
          )}
        </div>
        {supplier.notes && <div className="sn-notes">{supplier.notes}</div>}
        <div className="sn-acts">
          <button type="button" className="sn-btn pri" onClick={() => setEditing(true)}>
            ✏️ Sửa thông tin
          </button>
          <button type="button" className="sn-btn" onClick={() => setShowNewGroup(true)}>
            ＋ Thêm nhóm hàng
          </button>
        </div>
      </div>

      {/* strip */}
      <div className="sn-strip">
        <div className="sn-st">
          <div className="k">Nhóm hàng</div>
          <div className="v num">{supplier.groups.length}</div>
        </div>
        <div className="sn-st">
          <div className="k">Vật tư báo giá</div>
          <div className="v num">{supplier.prices.length}</div>
        </div>
        <div className="sn-st">
          <div className="k">Cập nhật giá</div>
          <div className="v">{fmtDate(lastUpdate)}</div>
        </div>
        <div className="sn-st">
          <div className="k">Trạng thái</div>
          <div className="v" style={{ color: supplier.isActive ? "var(--sn-ok)" : "var(--sn-red)" }}>
            {supplier.isActive ? "Đang dùng" : "Ngưng"}
          </div>
        </div>
      </div>

      {/* groups */}
      {sections.length === 0 ? (
        <div className="sn-empty2">
          Chưa có nhóm/bảng giá. Bấm “Thêm nhóm hàng” rồi thêm vật tư.
        </div>
      ) : (
        sections.map((sec) => (
          <div className="sn-grp" key={sec.id ?? "__none"}>
            <div className="sn-ghd">
              <span className="sn-gdot" />
              <span className="sn-gnm">{sec.name}</span>
              <span className="sn-gcount">{sec.prices.length} vật tư</span>
              {sec.id && (
                <span className="sn-gtools">
                  <button
                    type="button"
                    className="sn-gedit"
                    onClick={() => setEditGroupId(sec.id)}
                    title="Sửa nhóm"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="sn-gdel"
                    onClick={() => {
                      const g = supplier.groups.find((x) => x.id === sec.id);
                      if (g) deleteGroup(g);
                    }}
                    title="Xoá nhóm"
                  >
                    🗑
                  </button>
                </span>
              )}
              <button type="button" className="sn-gadd" onClick={() => setNewPriceGroup(sec.id ?? "")}>
                ＋ Thêm vật tư
              </button>
            </div>
            {sec.prices.length > 0 && (
              <div className="sn-tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Vật tư</th>
                      <th>ĐVT</th>
                      <th className="r">Đơn giá</th>
                      <th>Ghi chú</th>
                      <th className="r" />
                    </tr>
                  </thead>
                  <tbody>
                    {sec.prices.map((p) => (
                      <tr key={p.id}>
                        <td className="mname">
                          {p.materialName}
                          {p.supplierItemCode && <span className="mcode"> · {p.supplierItemCode}</span>}
                        </td>
                        <td className="unit">{p.unit}</td>
                        <td className="r price num">{fmtVnd(p.unitPrice)}</td>
                        <td className="note">{p.note || "—"}</td>
                        <td className="r rowact">
                          <button type="button" onClick={() => setEditPrice(p)} title="Sửa">
                            ✏️
                          </button>
                          <button type="button" onClick={() => deletePrice(p)} title="Xoá">
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      <div className="sn-foot">Danh mục báo giá NCC · dùng chung mọi dự án · Đúng — Đẹp — Bền</div>

      {editing && <EditSupplierModal supplier={supplier} onClose={() => setEditing(false)} onSaved={load} />}
      {showNewGroup && (
        <GroupModal supplierId={supplierId} onClose={() => setShowNewGroup(false)} onSaved={load} />
      )}
      {editGroupId && (
        <GroupModal
          supplierId={supplierId}
          group={supplier.groups.find((g) => g.id === editGroupId)}
          onClose={() => setEditGroupId(null)}
          onSaved={load}
        />
      )}
      {newPriceGroup !== null && (
        <PriceModal
          supplierId={supplierId}
          groups={supplier.groups}
          defaultGroupId={newPriceGroup}
          onClose={() => setNewPriceGroup(null)}
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

// ───────────────────────── MODALS ─────────────────────────
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
    if (name.trim().length < 2) return toast.error("Nhập tên NCC");
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
    if (!res.ok) return toast.error("Lỗi lưu");
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <ModalShell title="Sửa thông tin NCC" onClose={onClose} busy={busy} onSave={save}>
      <MiniField label="Tên NCC *" value={name} onChange={setName} />
      <MiniField label="SĐT chính" value={phone} onChange={setPhone} />
      <MiniField label="SĐT phụ" value={altPhone} onChange={setAltPhone} />
      <MiniField label="Email" value={email} onChange={setEmail} />
      <MiniField label="Địa chỉ" value={address} onChange={setAddress} />
      <MiniField label="MST" value={taxCode} onChange={setTaxCode} />
      <MiniField label="Ngân hàng" value={bankName} onChange={setBankName} />
      <MiniField label="Số TK" value={bankAccount} onChange={setBankAccount} />
      <MiniField label="Tên chủ TK" value={bankAccountName} onChange={setBankAccountName} />
      <label className="sn-flabel">
        <div className="sn-fl">Ghi chú</div>
        <textarea className="sn-fin" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="sn-check">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Đang hoạt động
      </label>
    </ModalShell>
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
    if (name.trim().length < 1) return toast.error("Nhập tên nhóm");
    setBusy(true);
    const res = await fetch(
      group ? `/api/admin/suppliers/${supplierId}/groups/${group.id}` : `/api/admin/suppliers/${supplierId}/groups`,
      {
        method: group ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sortOrder }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.message || j.error || "Lỗi lưu");
    }
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <ModalShell title={group ? "Sửa nhóm hàng" : "Thêm nhóm hàng"} onClose={onClose} busy={busy} onSave={save}>
      <MiniField label="Tên nhóm *" value={name} onChange={setName} />
      <label className="sn-flabel">
        <div className="sn-fl">Thứ tự</div>
        <input
          className="sn-fin"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
        />
      </label>
    </ModalShell>
  );
}

function PriceModal({
  supplierId,
  groups,
  price,
  defaultGroupId,
  onClose,
  onSaved,
}: {
  supplierId: string;
  groups: Group[];
  price?: Price;
  defaultGroupId?: string | "";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [materialName, setMaterialName] = useState(price?.materialName || "");
  const [unit, setUnit] = useState(price?.unit || "");
  const [supplierItemCode, setSupplierItemCode] = useState(price?.supplierItemCode || "");
  const [unitPrice, setUnitPrice] = useState(String(price?.unitPrice ?? ""));
  const [groupId, setGroupId] = useState<string>(price?.groupId ?? defaultGroupId ?? "");
  const [note, setNote] = useState(price?.note || "");
  const [busy, setBusy] = useState(false);
  const isEdit = !!price;

  async function save() {
    if (!materialName.trim() || !unit.trim()) return toast.error("Nhập tên vật tư + ĐVT");
    const num = Number(unitPrice.replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) return toast.error("Đơn giá phải > 0");
    setBusy(true);
    // POST /prices = upsert theo (tên VT + ĐVT). Khi sửa, tên+ĐVT khoá → cùng key → update đúng dòng.
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
    if (!res.ok) return toast.error("Lỗi lưu");
    toast.success("Đã lưu");
    onClose();
    onSaved();
  }

  return (
    <ModalShell title={isEdit ? "Sửa vật tư" : "Thêm vật tư"} onClose={onClose} busy={busy} onSave={save}>
      <MiniField label="Tên vật tư *" value={materialName} onChange={setMaterialName} disabled={isEdit} />
      <MiniField label="ĐVT *" value={unit} onChange={setUnit} placeholder="VD: kg, m, cây" disabled={isEdit} />
      <MiniField label="Mã hàng NCC" value={supplierItemCode} onChange={setSupplierItemCode} placeholder="VD: SAT-D10" />
      <label className="sn-flabel">
        <div className="sn-fl">Đơn giá (VNĐ) *</div>
        <input className="sn-fin" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
      </label>
      <label className="sn-flabel">
        <div className="sn-fl">Nhóm hàng</div>
        <select className="sn-fin" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">— Chưa gán —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <MiniField label="Ghi chú" value={note} onChange={setNote} />
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  onSave,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <div className="sn-mscrim" onClick={onClose}>
      <div className={`sn-modal ${plexSans.variable}`} onClick={(e) => e.stopPropagation()}>
        <div className="sn-mtitle">{title}</div>
        <div className="sn-mbody">{children}</div>
        <div className="sn-macts">
          <button type="button" className="sn-btn" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="sn-btn pri" onClick={onSave} disabled={busy}>
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
    <label className="sn-flabel">
      <div className="sn-fl">{label}</div>
      <input
        className="sn-fin"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}
