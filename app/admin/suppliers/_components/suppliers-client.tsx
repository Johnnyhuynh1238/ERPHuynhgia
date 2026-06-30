"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Building2 } from "lucide-react";
import { toast } from "sonner";

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  _count: { groups: number; prices: number };
};

export function SuppliersClient() {
  const [items, setItems] = useState<SupplierRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL("/api/admin/suppliers", window.location.origin);
    if (q.trim()) url.searchParams.set("q", q.trim());
    url.searchParams.set("includeInactive", "1");
    const res = await fetch(url.toString(), { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setItems(j.suppliers || []);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#f0f2ff]">Nhà cung cấp vật tư</h1>
          <p className="text-xs text-[#8892b0]">Quản lý NCC, nhóm hàng và bảng giá</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#ff8a3d] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffa05f]"
        >
          <Plus className="h-4 w-4" />
          Thêm NCC
        </button>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-[#8892b0]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên / mã / SĐT"
            className="flex-1 bg-transparent text-sm text-[#f0f2ff] outline-none placeholder:text-[#5a627a]"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Đang tải…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e] p-8 text-center text-sm text-[#8892b0]">
          Chưa có NCC nào. Bấm &ldquo;Thêm NCC&rdquo; để bắt đầu.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/admin/suppliers/${s.id}`}
              className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 transition hover:border-[#ff8a3d]/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#ff8a3d]/10 p-2 text-[#ff8a3d]">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-[#8892b0]">{s.code}</div>
                    <div className="text-sm font-semibold text-[#f0f2ff]">{s.name}</div>
                    <div className="mt-0.5 text-[11px] text-[#8892b0]">{s.phone || "—"}</div>
                  </div>
                </div>
                {!s.isActive && (
                  <span className="rounded-full bg-[#D26B6B]/20 px-2 py-0.5 text-[10px] font-semibold text-[#D26B6B]">
                    Tạm ngưng
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-3 text-[11px] text-[#8892b0]">
                <span>{s._count.groups} nhóm</span>
                <span>·</span>
                <span>{s._count.prices} VT</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && <NewSupplierModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}

function NewSupplierModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 2) {
      toast.error("Nhập tên NCC");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankName: bankName.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || j.error || "Lỗi tạo NCC");
      return;
    }
    toast.success("Đã tạo NCC");
    onClose();
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-base font-bold text-[#f0f2ff]">Thêm NCC mới</div>
        <div className="space-y-2">
          <Field label="Tên NCC *" value={name} onChange={setName} placeholder="VD: NCC Sắt Thép Tâm Anh" />
          <Field label="Số điện thoại" value={phone} onChange={setPhone} placeholder="VD: 0901234567" />
          <Field label="Địa chỉ" value={address} onChange={setAddress} />
          <Field label="Số tài khoản" value={bankAccount} onChange={setBankAccount} />
          <Field label="Tên chủ TK" value={bankAccountName} onChange={setBankAccountName} />
          <Field label="Ngân hàng" value={bankName} onChange={setBankName} placeholder="VD: Vietcombank" />
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
            {busy ? "Đang tạo…" : "Tạo NCC"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
      />
    </label>
  );
}
