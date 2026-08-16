"use client";

import "./subcontractors.css";
import { plexSans, plexMono } from "@/lib/fonts";
import { confirmDialog } from "@/components/confirm-dialog";
import { VN_BANKS } from "@/lib/vn-banks";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";


type Specialty = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
};

type SubcontractorStatus = "active" | "inactive" | "blacklisted";
type SubcontractorType = "individual" | "company";

type SubcontractorItem = {
  id: string;
  code: string;
  name: string;
  type: SubcontractorType;
  taxCode: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  notes: string | null;
  status: SubcontractorStatus;
  isActive: boolean;
  avgRating: number | null;
  totalContracts: number;
  evaluationCount: number;
  hireAgainRate: number;
  outstanding: number;
  specialties: Specialty[];
  updatedAt: string;
};

type FormState = {
  name: string;
  type: SubcontractorType;
  phone: string;
  altPhone: string;
  email: string;
  taxCode: string;
  address: string;
  bankName: string;
  bankAccount: string;
  bankAccountName: string;
  status: SubcontractorStatus;
  notes: string;
  specialtyIds: string[];
};

const DEFAULT_FORM: FormState = {
  name: "",
  type: "individual",
  phone: "",
  altPhone: "",
  email: "",
  taxCode: "",
  address: "",
  bankName: "",
  bankAccount: "",
  bankAccountName: "",
  status: "active",
  notes: "",
  specialtyIds: [],
};

function statusClass(status: SubcontractorStatus) {
  if (status === "active") return "a";
  if (status === "inactive") return "i";
  return "b";
}

function statusLabel(status: SubcontractorStatus) {
  if (status === "active") return "Hoạt động";
  if (status === "inactive") return "Ngưng";
  return "Blacklist";
}

function fmtVnd(n: number) {
  return Math.round(n).toLocaleString("vi-VN");
}

function typeLabel(type: SubcontractorType) {
  return type === "company" ? "Công ty" : "Cá nhân";
}

function mapToForm(item: SubcontractorItem): FormState {
  return {
    name: item.name,
    type: item.type,
    phone: item.phone,
    altPhone: item.altPhone || "",
    email: item.email || "",
    taxCode: item.taxCode || "",
    address: item.address || "",
    bankName: item.bankName || "",
    bankAccount: item.bankAccount || "",
    bankAccountName: item.bankAccountName || "",
    status: item.status,
    notes: item.notes || "",
    specialtyIds: item.specialties.map((x) => x.id),
  };
}

export function SubcontractorsClient({ canWrite, canEditPayment = false }: { canWrite: boolean; canEditPayment?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SubcontractorItem[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SubcontractorStatus>("all");
  const [specialtyId, setSpecialtyId] = useState("");

  const [detail, setDetail] = useState<SubcontractorItem | null>(null);
  const [openSheet, setOpenSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<SubcontractorItem | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  // Sheet gọn "Sửa TK thanh toán" — kế toán/admin/TPTC đều dùng.
  const [payItem, setPayItem] = useState<SubcontractorItem | null>(null);
  const [payForm, setPayForm] = useState({ bankName: "", bankAccount: "", bankAccountName: "" });
  const [paySubmitting, setPaySubmitting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("subcontractors-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("subcontractors-theme", next);
      return next;
    });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadSpecialties() {
    const res = await fetch("/api/specialties", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setSpecialties(json.specialties || []);
    }
  }

  async function loadData() {
    setLoading(true);
    const qs = new URLSearchParams({ search, status, specialty: specialtyId });
    const res = await fetch(`/api/subcontractors?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được danh bạ thầu phụ");
      setRows([]);
      return;
    }

    setRows(json.subcontractors || []);
  }

  useEffect(() => {
    loadSpecialties();
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, specialtyId]);

  const sheetTitle = editing ? `Sửa ${editing.code}` : "Tạo thầu phụ mới";

  function openCreate() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setOpenSheet(true);
  }

  function openEdit(item: SubcontractorItem) {
    setDetail(null);
    setEditing(item);
    setForm(mapToForm(item));
    setOpenSheet(true);
  }

  function openPayment(item: SubcontractorItem) {
    setDetail(null);
    setPayItem(item);
    setPayForm({
      bankName: item.bankName || "",
      bankAccount: item.bankAccount || "",
      bankAccountName: item.bankAccountName || "",
    });
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payItem || (!canWrite && !canEditPayment)) return;

    setPaySubmitting(true);
    const res = await fetch(`/api/subcontractors/${payItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName: payForm.bankName.trim() || null,
        bankAccount: payForm.bankAccount.trim() || null,
        bankAccountName: payForm.bankAccountName.trim() || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPaySubmitting(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu tài khoản thất bại");
      return;
    }

    toast.success("Đã lưu tài khoản thanh toán");
    setPayItem(null);
    await loadData();
  }

  function toggleSpecialty(id: string) {
    setForm((prev) => ({
      ...prev,
      specialtyIds: prev.specialtyIds.includes(id)
        ? prev.specialtyIds.filter((x) => x !== id)
        : [...prev.specialtyIds, id],
    }));
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      phone: form.phone.trim(),
      altPhone: form.altPhone.trim() || null,
      email: form.email.trim() || null,
      taxCode: form.taxCode.trim() || null,
      address: form.address.trim() || null,
      bankName: form.bankName.trim() || null,
      bankAccount: form.bankAccount.trim() || null,
      bankAccountName: form.bankAccountName.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      specialtyIds: form.specialtyIds,
    };

    const res = await fetch(editing ? `/api/subcontractors/${editing.id}` : "/api/subcontractors", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu thầu phụ thất bại");
      return;
    }

    toast.success(json.message || "Đã lưu thầu phụ");
    setOpenSheet(false);
    await loadData();
  }

  async function handleDelete(item: SubcontractorItem) {
    if (!canWrite) return;
    if (!(await confirmDialog(`Ngưng hoạt động thầu phụ ${item.name}?`))) return;

    const res = await fetch(`/api/subcontractors/${item.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Thao tác thất bại");
      return;
    }

    toast.success(json.message || "Đã cập nhật");
    setDetail(null);
    await loadData();
  }

  async function handleBlacklist(item: SubcontractorItem) {
    if (!canWrite) return;
    if (!(await confirmDialog(`Đưa thầu phụ ${item.name} vào blacklist?`))) return;

    const res = await fetch(`/api/subcontractors/${item.id}/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Blacklist thất bại");
      return;
    }

    toast.success(json.message || "Đã blacklist");
    setDetail(null);
    await loadData();
  }

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const black = rows.filter((r) => r.status === "blacklisted").length;
    const rated = rows.filter((r) => typeof r.avgRating === "number");
    const avg = rated.length ? rated.reduce((s, r) => s + (r.avgRating || 0), 0) / rated.length : null;
    return { total, active, black, avg };
  }, [rows]);

  const bankText = (item: SubcontractorItem) =>
    [item.bankAccount, item.bankName].filter(Boolean).join(" · ") || null;

  return (
    <div className={`subdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>Thầu phụ</b>
              <span>Huỳnh Gia · Danh bạ</span>
            </div>
          </div>
          <div className="grow" />
          <button className="iconbtn" onClick={toggleTheme} title="Đổi giao diện">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {canWrite ? (
            <button className="iconbtn pri" onClick={openCreate} title="Tạo mới">
              ＋
            </button>
          ) : null}
        </div>

        <div className="eyebrow">Danh bạ nhà thầu phụ</div>
        <h1>Danh sách thầu phụ</h1>

        <div className="sum">
          <div className="cell"><div className="k">Tổng thầu phụ</div><div className="v">{summary.total}</div></div>
          <div className="cell"><div className="k">Đang hoạt động</div><div className="v g">{summary.active}</div></div>
          <div className="cell"><div className="k">Blacklist</div><div className="v r">{summary.black}</div></div>
          <div className="cell"><div className="k">ĐTB toàn bộ</div><div className="v t">{summary.avg != null ? summary.avg.toFixed(2) : "-"}</div></div>
        </div>

        <div className="search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input placeholder="Tìm mã, tên, SĐT, email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="frow">
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | SubcontractorStatus)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Ngưng</option>
            <option value="blacklisted">Blacklist</option>
          </select>
          <select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
            <option value="">Tất cả chuyên môn</option>
            {specialties.map((item) => (
              <option key={item.id} value={item.id}>{item.icon || "🛠️"} {item.name}</option>
            ))}
          </select>
        </div>

        <div className="count">{loading ? "Đang tải…" : `${rows.length} thầu phụ`}</div>

        <div className="tbwrap">
          {loading ? (
            <div className="placeholder">Đang tải dữ liệu…</div>
          ) : rows.length === 0 ? (
            <div className="placeholder">Chưa có thầu phụ phù hợp bộ lọc.</div>
          ) : (
            <table>
              <colgroup><col className="c1" /><col className="c2" /><col className="c3" /></colgroup>
              <thead>
                <tr><th>Thầu phụ</th><th className="r">ĐTB</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} onClick={() => setDetail(item)}>
                    <td>
                      <div className="name">{item.name}</div>
                      <div className="metaline">
                        <span className="code">{item.code}</span>
                        {item.specialties.slice(0, 2).map((sp) => (
                          <span key={sp.id} className="tag">{sp.icon || "🛠️"} {sp.name}</span>
                        ))}
                        {item.specialties.length > 2 ? <span className="tag">+{item.specialties.length - 2}</span> : null}
                      </div>
                      {item.outstanding > 0 ? (
                        <div className="owe">Còn phải trả: {fmtVnd(item.outstanding)} đ</div>
                      ) : item.outstanding < 0 ? (
                        <div className="owe over">Trả dư: {fmtVnd(-item.outstanding)} đ</div>
                      ) : null}
                    </td>
                    <td className="r">
                      <span className="rate">{item.avgRating ? item.avgRating.toFixed(2) : "-"}<span className="star"> ★</span></span>
                      <div className="rsub">{item.evaluationCount} ĐG · {item.hireAgainRate}%</div>
                    </td>
                    <td className="r"><span className={`dot ${statusClass(item.status)}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- detail sheet ---- */}
      {detail ? (
        <>
          <div className="backdrop" onClick={() => setDetail(null)} />
          <div className="sheet detail">
            <div className="handle" />
            <div className="shead">
              <div className="grow">
                <div className="n">{detail.name}</div>
                <div className="c">{detail.code} · {typeLabel(detail.type)}</div>
              </div>
              <span className={`st ${statusClass(detail.status)}`}>{statusLabel(detail.status)}</span>
            </div>
            <div className="sbody">
              <div className="kv"><span className="k">SĐT</span><span className="val mono">{detail.phone}{detail.altPhone ? ` · ${detail.altPhone}` : ""}</span></div>
              <div className="kv">
                <span className="k">Chuyên môn</span>
                <span className="chips">
                  {detail.specialties.length ? detail.specialties.map((sp) => (
                    <span key={sp.id} className="chip">{sp.icon || "🛠️"} {sp.name}</span>
                  )) : <span className="val">—</span>}
                </span>
              </div>
              <div className="kv"><span className="k">ĐTB / Lượt ĐG</span><span className="val mono">{detail.avgRating ? detail.avgRating.toFixed(2) : "-"} ★ · {detail.evaluationCount}</span></div>
              <div className="kv"><span className="k">Tỉ lệ hire lại</span><span className="val mono">{detail.hireAgainRate}%</span></div>
              <div className="kv"><span className="k">Số HĐ đã ký</span><span className="val mono">{detail.totalContracts}</span></div>
              <div className="kv">
                <span className="k">Còn phải trả</span>
                <span className={`val mono ${detail.outstanding > 0 ? "owe" : detail.outstanding < 0 ? "over" : ""}`}>
                  {detail.outstanding > 0
                    ? `${fmtVnd(detail.outstanding)} đ`
                    : detail.outstanding < 0
                    ? `Trả dư ${fmtVnd(-detail.outstanding)} đ`
                    : "Đã thanh toán đủ"}
                </span>
              </div>
              {detail.taxCode ? <div className="kv"><span className="k">MST</span><span className="val mono">{detail.taxCode}</span></div> : null}
              {detail.email ? <div className="kv"><span className="k">Email</span><span className="val">{detail.email}</span></div> : null}
              {detail.address ? <div className="kv"><span className="k">Địa chỉ</span><span className="val">{detail.address}</span></div> : null}
              <div className="kv">
                <span className="k">🏦 Tài khoản</span>
                <span className="val">
                  {bankText(detail) || <span className="mono">Chưa có TK</span>}
                  {detail.bankAccountName ? <div className="mono" style={{ fontWeight: 400, opacity: 0.7 }}>{detail.bankAccountName}</div> : null}
                </span>
              </div>
              {detail.notes ? <div className="kv"><span className="k">Ghi chú</span><span className="val">{detail.notes}</span></div> : null}
            </div>
            <div className="sacts">
              <a className="btn call" href={`tel:${detail.phone}`}>📞 Gọi</a>
              {canWrite || canEditPayment ? <button className="btn" onClick={() => openPayment(detail)}>✏️ Sửa TK</button> : null}
            </div>
            {canWrite ? (
              <div className="sacts" style={{ paddingTop: 8 }}>
                <button className="btn" onClick={() => openEdit(detail)}>Sửa</button>
                <button className="btn" onClick={() => handleDelete(detail)}>Ngưng HĐ</button>
                {detail.status !== "blacklisted" ? (
                  <button className="btn danger" onClick={() => handleBlacklist(detail)}>Blacklist</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ---- create / edit form ---- */}
      {openSheet ? (
        <>
          <div className="backdrop" onClick={() => setOpenSheet(false)} />
          <div className="sheet form">
            <div className="handle" />
            <div className="form-title">{sheetTitle}</div>
            <form className="fscroll" onSubmit={submitForm}>
              <div className="field">
                <label>Tên thầu phụ</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>

              <div className="grid2">
                <div className="field">
                  <label>Loại</label>
                  <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as SubcontractorType }))}>
                    <option value="individual">Cá nhân</option>
                    <option value="company">Công ty</option>
                  </select>
                </div>
                <div className="field">
                  <label>Trạng thái</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SubcontractorStatus }))}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngưng</option>
                    <option value="blacklisted">Blacklist</option>
                  </select>
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>SĐT</label>
                  <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} required />
                </div>
                <div className="field">
                  <label>SĐT phụ</label>
                  <input value={form.altPhone} onChange={(e) => setForm((p) => ({ ...p, altPhone: e.target.value }))} />
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>Email</label>
                  <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="field">
                  <label>MST</label>
                  <input value={form.taxCode} onChange={(e) => setForm((p) => ({ ...p, taxCode: e.target.value }))} />
                </div>
              </div>

              <div className="field">
                <label>Địa chỉ</label>
                <textarea rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              </div>

              <div className="grid3">
                <div className="field">
                  <label>Ngân hàng</label>
                  <select value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}>
                    <option value="">— Chọn ngân hàng —</option>
                    {/* Giữ giá trị cũ nếu là text tự do không khớp danh sách Napas */}
                    {form.bankName && !VN_BANKS.some((b) => b.shortName === form.bankName) && (
                      <option value={form.bankName}>{form.bankName} (chưa chuẩn)</option>
                    )}
                    {VN_BANKS.map((b) => (
                      <option key={b.bin} value={b.shortName}>
                        {b.shortName} ({b.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>STK</label>
                  <input value={form.bankAccount} onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Tên TK</label>
                  <input value={form.bankAccountName} onChange={(e) => setForm((p) => ({ ...p, bankAccountName: e.target.value }))} />
                </div>
              </div>

              <div className="field">
                <label>Chuyên môn</label>
                <div className="spgrid">
                  {specialties.map((sp) => {
                    const active = form.specialtyIds.includes(sp.id);
                    return (
                      <button type="button" key={sp.id} onClick={() => toggleSpecialty(sp.id)} className={`spbtn ${active ? "on" : ""}`}>
                        {sp.icon || "🛠️"} {sp.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label>Ghi chú</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              <div className="fbtns">
                <button type="button" className="btn" onClick={() => setOpenSheet(false)}>Hủy</button>
                <button type="submit" className="btn call" disabled={submitting}>{submitting ? "Đang lưu…" : "Lưu"}</button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      {/* ---- payment account sheet ---- */}
      {payItem ? (
        <>
          <div className="backdrop" onClick={() => setPayItem(null)} />
          <div className="sheet form">
            <div className="handle" />
            <div className="form-title">Tài khoản thanh toán</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 4 }}>{payItem.code} · {payItem.name}</div>
            <form className="fscroll" onSubmit={submitPayment}>
              <div className="field">
                <label>Ngân hàng</label>
                <input value={payForm.bankName} onChange={(e) => setPayForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="VD: Vietcombank" />
              </div>
              <div className="field">
                <label>Số tài khoản</label>
                <input value={payForm.bankAccount} onChange={(e) => setPayForm((p) => ({ ...p, bankAccount: e.target.value }))} />
              </div>
              <div className="field">
                <label>Chủ tài khoản</label>
                <input value={payForm.bankAccountName} onChange={(e) => setPayForm((p) => ({ ...p, bankAccountName: e.target.value }))} />
              </div>
              <div className="fbtns">
                <button type="button" className="btn" onClick={() => setPayItem(null)}>Hủy</button>
                <button type="submit" className="btn call" disabled={paySubmitting}>{paySubmitting ? "Đang lưu…" : "Lưu TK"}</button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
