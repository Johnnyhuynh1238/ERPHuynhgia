"use client";

import Link from "next/link";
import { confirmDialog } from "@/components/confirm-dialog";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { plexSans } from "@/lib/fonts";
import {
  LEVEL_LABEL,
  PRICE_VALID_DAYS,
  RANK_LABEL,
  isExpired,
  pctChange,
  type PriceLevel,
  type SupplierRank,
} from "@/lib/supplier-price";
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
  supplierRank: SupplierRank | null;
  approvedAt: string | null;
  approvedBy: string | null;
  validUntil: string | null;
  pendingPrice: number | null;
  pendingRank: SupplierRank | null;
  pendingLevel: PriceLevel | null;
  pendingAt: string | null;
};
type PriceLog = {
  id: string;
  action: "de_xuat" | "duyet" | "tu_choi";
  oldPrice: number | null;
  newPrice: number | null;
  pct: number | null;
  level: PriceLevel | null;
  rank: SupplierRank | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
};
type PricePeer = {
  id: string;
  supplierName: string;
  supplierActive: boolean;
  unitPrice: number;
  pendingPrice: number | null;
  supplierRank: SupplierRank | null;
  approvedAt: string | null;
  validUntil: string | null;
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
  paymentTerm: "no_ngay" | "tra_ngay" | "sau_nghiem_thu" | "ky_15_30";
  creditDays: number;
  createdAt: string;
  groups: Group[];
  prices: Price[];
};

const fmtVnd = (n: number) => n.toLocaleString("vi-VN");
const TERM_LABEL = {
  no_ngay: "Công nợ",
  tra_ngay: "Trả ngay",
  sau_nghiem_thu: "Trả sau khi xong",
  ky_15_30: "Trả ngày 15 & 30",
} as const;
const termText = (s: Pick<Supplier, "paymentTerm" | "creditDays">) =>
  s.paymentTerm === "no_ngay" ? `Công nợ ${s.creditDays} ngày` : TERM_LABEL[s.paymentTerm] ?? "Công nợ";
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
  const [historyPrice, setHistoryPrice] = useState<Price | null>(null);
  const [canApprove, setCanApprove] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/suppliers/${supplierId}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setSupplier(j.supplier);
      setCanApprove(!!j.canApprove);
    }
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
      .map((g) => ({ id: g.id as string | null, name: g.name, prices: byGroup.get(g.id) ?? [] }));
    const none = byGroup.get(null);
    if (none && none.length) out.push({ id: null, name: "Chưa phân nhóm", prices: none });
    return out;
  }, [supplier]);

  const lastUpdate = useMemo(() => {
    if (!supplier?.prices.length) return null;
    return supplier.prices.reduce<string | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null);
  }, [supplier]);

  const pendingCount = supplier?.prices.filter((p) => p.pendingLevel).length ?? 0;
  const expiredCount = supplier?.prices.filter((p) => p.approvedAt && isExpired(p.validUntil)).length ?? 0;

  async function decidePrice(p: Price, action: "duyet" | "tu_choi") {
    const msg =
      action === "duyet"
        ? `Duyệt giá "${p.materialName}" ${fmtVnd(p.pendingPrice ?? 0)}đ/${p.unit}? Giá có hiệu lực ${PRICE_VALID_DAYS} ngày.`
        : `Từ chối giá đề xuất "${p.materialName}" ${fmtVnd(p.pendingPrice ?? 0)}đ? Giá đang dùng giữ nguyên.`;
    if (!(await confirmDialog(msg))) return;
    const res = await fetch(`/api/admin/suppliers/${supplierId}/prices/${p.id}/duyet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.message || "Lỗi duyệt");
    }
    toast.success(action === "duyet" ? "Đã duyệt giá" : "Đã từ chối");
    load();
  }

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
          <div className="k">Giá chờ duyệt</div>
          <div className="v num" style={pendingCount ? { color: "var(--sn-orange)" } : undefined}>
            {pendingCount}
          </div>
        </div>
        <div className="sn-st">
          <div className="k">Giá hết hạn</div>
          <div className="v num" style={expiredCount ? { color: "var(--sn-red)" } : undefined}>
            {expiredCount}
          </div>
        </div>
        <div className="sn-st">
          <div className="k">Thanh toán</div>
          <div className="v">{termText(supplier)}</div>
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
                      <th className="r">Đơn giá dùng</th>
                      <th>Hiệu lực</th>
                      <th>Chờ duyệt</th>
                      <th>Ghi chú</th>
                      <th className="r" />
                    </tr>
                  </thead>
                  <tbody>
                    {sec.prices.map((p) => {
                      const expired = isExpired(p.validUntil);
                      const pct = p.pendingPrice === null ? null : pctChange(p.approvedAt ? p.unitPrice : null, p.pendingPrice);
                      return (
                      <tr key={p.id}>
                        <td className="mname">
                          {p.materialName}
                          {p.supplierItemCode && <span className="mcode"> · {p.supplierItemCode}</span>}
                          {p.supplierRank && (
                            <span className={`sn-rank ${p.supplierRank}`}>{RANK_LABEL[p.supplierRank]}</span>
                          )}
                        </td>
                        <td className="unit">{p.unit}</td>
                        <td className="r price num">{fmtVnd(p.unitPrice)}</td>
                        <td className="valid">
                          {!p.approvedAt ? (
                            <span className="sn-tag red">Chưa duyệt</span>
                          ) : expired ? (
                            <span className="sn-tag red">Hết hạn {fmtDate(p.validUntil)}</span>
                          ) : (
                            <span className="sn-tag ok">Đến {fmtDate(p.validUntil)}</span>
                          )}
                        </td>
                        <td className="pend">
                          {p.pendingLevel && p.pendingPrice !== null ? (
                            <>
                              <span className="num">{fmtVnd(p.pendingPrice)}</span>
                              {pct !== null && (
                                <span className="mcode">
                                  {" "}
                                  ({pct > 0 ? "+" : ""}
                                  {pct}%)
                                </span>
                              )}
                              {p.pendingRank !== p.supplierRank && p.pendingRank && (
                                <span className="mcode"> · {RANK_LABEL[p.pendingRank]}</span>
                              )}
                              <span className="sn-tag wait">{LEVEL_LABEL[p.pendingLevel]}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="note">{p.note || "—"}</td>
                        <td className="r rowact">
                          {canApprove && p.pendingLevel && (
                            <>
                              <button type="button" onClick={() => decidePrice(p, "duyet")} title="Duyệt giá">
                                ✅
                              </button>
                              <button type="button" onClick={() => decidePrice(p, "tu_choi")} title="Từ chối giá">
                                ✖️
                              </button>
                            </>
                          )}
                          <button type="button" onClick={() => setHistoryPrice(p)} title="Lịch sử + so giá NCC khác">
                            📜
                          </button>
                          <button type="button" onClick={() => setEditPrice(p)} title="Sửa">
                            ✏️
                          </button>
                          <button type="button" onClick={() => deletePrice(p)} title="Xoá">
                            🗑
                          </button>
                        </td>
                      </tr>
                      );
                    })}
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
      {historyPrice && (
        <PriceHistoryModal supplierId={supplierId} price={historyPrice} onClose={() => setHistoryPrice(null)} />
      )}
    </div>
  );
}

const ACTION_LABEL: Record<PriceLog["action"], string> = {
  de_xuat: "Đề xuất",
  duyet: "Duyệt",
  tu_choi: "Từ chối",
};

function PriceHistoryModal({
  supplierId,
  price,
  onClose,
}: {
  supplierId: string;
  price: Price;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ logs: PriceLog[]; peers: PricePeer[] } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/suppliers/${supplierId}/prices/${price.id}/lich-su`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData({ logs: j.logs ?? [], peers: j.peers ?? [] }))
      .catch(() => setData({ logs: [], peers: [] }));
  }, [supplierId, price.id]);

  return (
    <div className="sn-mscrim" onClick={onClose}>
      <div className={`sn-modal wide ${plexSans.variable}`} onClick={(e) => e.stopPropagation()}>
        <div className="sn-mtitle">
          {price.materialName} · {price.unit}
        </div>
        <div className="sn-mbody">
          {!data ? (
            <div className="sn-fl">Đang tải…</div>
          ) : (
            <>
              <div className="sn-fl">So giá NCC khác (cùng tên vật tư + ĐVT)</div>
              {data.peers.length === 0 ? (
                <div className="sn-mnote">Chưa có NCC khác báo giá vật tư này.</div>
              ) : (
                <div className="sn-tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>NCC</th>
                        <th className="r">Đơn giá dùng</th>
                        <th>Hiệu lực</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="me">
                        <td className="mname">NCC này</td>
                        <td className="r price num">{fmtVnd(price.unitPrice)}</td>
                        <td className="unit">{price.approvedAt ? `Đến ${fmtDate(price.validUntil)}` : "Chưa duyệt"}</td>
                      </tr>
                      {data.peers.map((p) => (
                        <tr key={p.id}>
                          <td className="mname">
                            {p.supplierName}
                            {!p.supplierActive && <span className="mcode"> · ngưng</span>}
                            {p.supplierRank && <span className={`sn-rank ${p.supplierRank}`}>{RANK_LABEL[p.supplierRank]}</span>}
                          </td>
                          <td className="r price num">{fmtVnd(p.unitPrice)}</td>
                          <td className="unit">
                            {!p.approvedAt ? "Chưa duyệt" : isExpired(p.validUntil) ? "Hết hạn" : `Đến ${fmtDate(p.validUntil)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="sn-fl" style={{ marginTop: 14 }}>
                Lịch sử giá NCC này
              </div>
              {data.logs.length === 0 ? (
                <div className="sn-mnote">Chưa có lịch sử (giá nhập trước 06/11/2026).</div>
              ) : (
                <div className="sn-tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Việc</th>
                        <th className="r">Giá</th>
                        <th>Người</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.logs.map((l) => (
                        <tr key={l.id}>
                          <td className="unit">{fmtDate(l.createdAt)}</td>
                          <td>
                            {ACTION_LABEL[l.action]}
                            {l.action === "de_xuat" && l.level && <span className="mcode"> · {LEVEL_LABEL[l.level]}</span>}
                            {l.note && <div className="mcode">{l.note}</div>}
                          </td>
                          <td className="r price num">
                            {l.newPrice === null ? "—" : fmtVnd(l.newPrice)}
                            {l.pct !== null && (
                              <span className="mcode">
                                {" "}
                                ({l.pct > 0 ? "+" : ""}
                                {l.pct}%)
                              </span>
                            )}
                          </td>
                          <td className="unit">{l.actor || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <div className="sn-macts">
          <button type="button" className="sn-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
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
  const [paymentTerm, setPaymentTerm] = useState<Supplier["paymentTerm"]>(supplier.paymentTerm ?? "no_ngay");
  const [creditDays, setCreditDays] = useState(String(supplier.creditDays ?? 14));
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
        paymentTerm,
        creditDays: Math.max(0, Number(creditDays) || 0),
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
        <div className="sn-fl">Điều khoản thanh toán (kế hoạch dòng tiền)</div>
        <select
          className="sn-fin"
          value={paymentTerm}
          onChange={(e) => setPaymentTerm(e.target.value as Supplier["paymentTerm"])}
        >
          <option value="no_ngay">Công nợ — trả sau khi giao N ngày (vật tư thường)</option>
          <option value="tra_ngay">Trả ngay khi giao — không nợ (tôn, sắt kèo…)</option>
          <option value="sau_nghiem_thu">Trả sau khi làm xong (thạch cao, cửa nhôm, lan can…)</option>
          <option value="ky_15_30">Trả ngày 15 &amp; 30 hằng tháng (vật liệu thô VLXD)</option>
        </select>
      </label>
      {paymentTerm === "no_ngay" ? (
        <MiniField label="Số ngày công nợ" value={creditDays} onChange={setCreditDays} />
      ) : null}
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
  const [unitPrice, setUnitPrice] = useState(String(price?.pendingPrice ?? price?.unitPrice ?? ""));
  const [groupId, setGroupId] = useState<string>(price?.groupId ?? defaultGroupId ?? "");
  const [note, setNote] = useState(price?.note || "");
  const [rank, setRank] = useState<SupplierRank | "">(price?.pendingRank ?? price?.supplierRank ?? "");
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
          supplierRank: rank || null,
        }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Lỗi lưu");
    const j = await res.json().catch(() => ({}));
    const lv = j.pendingLevel as PriceLevel | null | undefined;
    toast.success(lv ? `Đã lưu · ${LEVEL_LABEL[lv]} — PO dùng giá cũ tới khi duyệt` : "Đã lưu");
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
      <div className="sn-mnote">
        Giá mới chờ duyệt (SOP-26): đổi ≤ 3% → TP Mua hàng · 3–10% → CEO · trên 10%, giá lần đầu hoặc đổi NCC chính →
        sếp. Chưa duyệt thì đơn mua vẫn dùng giá cũ. Giá duyệt có hiệu lực {PRICE_VALID_DAYS} ngày.
      </div>
      <label className="sn-flabel">
        <div className="sn-fl">Vai trò NCC cho vật tư này</div>
        <select className="sn-fin" value={rank} onChange={(e) => setRank(e.target.value as SupplierRank | "")}>
          <option value="">— Không xếp —</option>
          <option value="chinh">{RANK_LABEL.chinh}</option>
          <option value="du_phong">{RANK_LABEL.du_phong}</option>
        </select>
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
