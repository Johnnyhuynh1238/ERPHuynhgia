"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Phone, Plus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

function statusChipClass(status: SubcontractorStatus) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300";
  if (status === "inactive") return "bg-zinc-500/15 text-zinc-300";
  return "bg-red-500/15 text-red-300";
}

function statusLabel(status: SubcontractorStatus) {
  if (status === "active") return "Hoạt động";
  if (status === "inactive") return "Ngưng";
  return "Blacklist";
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

export function SubcontractorsClient({ canWrite }: { canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SubcontractorItem[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SubcontractorStatus>("all");
  const [specialtyId, setSpecialtyId] = useState("");

  const [openSheet, setOpenSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<SubcontractorItem | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

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
    setEditing(item);
    setForm(mapToForm(item));
    setOpenSheet(true);
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
    if (!await confirmDialog(`Ngưng hoạt động thầu phụ ${item.name}?`)) return;

    const res = await fetch(`/api/subcontractors/${item.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Thao tác thất bại");
      return;
    }

    toast.success(json.message || "Đã cập nhật");
    await loadData();
  }

  async function handleBlacklist(item: SubcontractorItem) {
    if (!canWrite) return;
    if (!await confirmDialog(`Đưa thầu phụ ${item.name} vào blacklist?`)) return;

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
    await loadData();
  }

  const totalText = useMemo(() => `Tổng ${rows.length} thầu phụ`, [rows.length]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[#f0f2ff]">Danh bạ thầu phụ</h1>
          {canWrite ? (
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Tạo mới
            </Button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8892b0]" />
            <input
              className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] py-2 pl-9 pr-3 text-sm text-[#f0f2ff]"
              placeholder="Tìm mã, tên, SĐT, email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "all" | SubcontractorStatus)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Hoạt động</option>
              <option value="inactive">Ngưng</option>
              <option value="blacklisted">Blacklist</option>
            </select>

            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
              <option value="">Tất cả chuyên môn</option>
              {specialties.map((item) => (
                <option key={item.id} value={item.id}>{item.icon || "🛠️"} {item.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs text-[#8892b0]">{totalText}</div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Đang tải dữ liệu...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">Chưa có thầu phụ phù hợp bộ lọc.</div>
        ) : (
          rows.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/subcontractors/${item.id}`} className="text-sm font-bold text-[#f0f2ff] hover:underline">
                    {item.code} • {item.name}
                  </Link>
                  <div className="mt-1 text-xs text-[#8892b0]">{typeLabel(item.type)} {item.taxCode ? `• MST ${item.taxCode}` : ""}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] ${statusChipClass(item.status)}`}>{statusLabel(item.status)}</span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 rounded-full bg-[#f97316]/15 px-2 py-1 text-[#fb923c]">
                  <Phone className="h-3.5 w-3.5" /> {item.phone}
                </a>
                {item.altPhone ? <a href={`tel:${item.altPhone}`} className="text-xs text-[#a4acc8]">{item.altPhone}</a> : null}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-[#252840] bg-[#13151f] p-2">
                  <div className="text-[#8892b0]">ĐTB</div>
                  <div className="font-semibold text-[#f0f2ff]">{item.avgRating ? item.avgRating.toFixed(2) : "-"}</div>
                </div>
                <div className="rounded-lg border border-[#252840] bg-[#13151f] p-2">
                  <div className="text-[#8892b0]">Lượt đánh giá</div>
                  <div className="font-semibold text-[#f0f2ff]">{item.evaluationCount}</div>
                </div>
                <div className="rounded-lg border border-[#252840] bg-[#13151f] p-2">
                  <div className="text-[#8892b0]">Hire lại</div>
                  <div className="font-semibold text-[#f0f2ff]">{item.hireAgainRate}%</div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {item.specialties.length > 0 ? (
                  item.specialties.map((sp) => (
                    <span key={sp.id} className="rounded-full bg-[#252840] px-2 py-1 text-[11px] text-[#a4acc8]">
                      {sp.icon || "🛠️"} {sp.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#8892b0]">Chưa gán chuyên môn</span>
                )}
              </div>

              {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>Sửa</Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(item)}>Ngưng HĐ</Button>
                  {item.status !== "blacklisted" ? (
                    <Button variant="destructive" size="sm" onClick={() => handleBlacklist(item)}>
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Blacklist
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {openSheet ? (
        <div className="fixed inset-0 z-50 bg-black/60">
          <button type="button" className="h-full w-full" aria-label="Đóng" onClick={() => setOpenSheet(false)} />
          <div className="absolute bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 rounded-t-2xl border border-[#252840] bg-[#13151f] p-4 slide-up">
            <div className="mb-3 text-lg font-semibold text-[#f0f2ff]">{sheetTitle}</div>

            <form className="max-h-[75vh] space-y-3 overflow-y-auto pb-1" onSubmit={submitForm}>
              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Tên thầu phụ</label>
                <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Loại</label>
                  <select className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as SubcontractorType }))}>
                    <option value="individual">Cá nhân</option>
                    <option value="company">Công ty</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Trạng thái</label>
                  <select className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SubcontractorStatus }))}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngưng</option>
                    <option value="blacklisted">Blacklist</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">SĐT</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">SĐT phụ</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.altPhone} onChange={(e) => setForm((p) => ({ ...p, altPhone: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Email</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">MST</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.taxCode} onChange={(e) => setForm((p) => ({ ...p, taxCode: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Địa chỉ</label>
                <textarea rows={2} className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Ngân hàng</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">STK</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.bankAccount} onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Tên TK</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.bankAccountName} onChange={(e) => setForm((p) => ({ ...p, bankAccountName: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Chuyên môn</label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] p-2">
                  {specialties.map((sp) => {
                    const active = form.specialtyIds.includes(sp.id);
                    return (
                      <button
                        type="button"
                        key={sp.id}
                        onClick={() => toggleSpecialty(sp.id)}
                        className={`rounded-lg border px-2 py-1 text-left text-xs ${
                          active ? "border-[#f97316] bg-[#f97316]/20 text-[#fb923c]" : "border-[#2d3249] bg-[#13151f] text-[#a4acc8]"
                        }`}
                      >
                        {sp.icon || "🛠️"} {sp.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Ghi chú</label>
                <textarea rows={2} className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpenSheet(false)}>Hủy</Button>
                <Button type="submit" className="bg-[#f97316] text-black hover:bg-[#fb923c]" disabled={submitting}>
                  {submitting ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
