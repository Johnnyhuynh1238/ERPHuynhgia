"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Specialty = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
};

type Subcontractor = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "company";
  taxCode: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  status: "active" | "inactive" | "blacklisted";
  notes: string | null;
  avgRating: number | null;
  totalContracts: number;
  isActive: boolean;
  specialties: Specialty[];
  createdAt: string;
  updatedAt: string;
};

function statusChipClass(status: Subcontractor["status"]) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300";
  if (status === "inactive") return "bg-zinc-500/15 text-zinc-300";
  return "bg-red-500/15 text-red-300";
}

function statusLabel(status: Subcontractor["status"]) {
  if (status === "active") return "Hoạt động";
  if (status === "inactive") return "Ngưng";
  return "Blacklist";
}

function typeLabel(type: Subcontractor["type"]) {
  return type === "company" ? "Công ty" : "Cá nhân";
}

function fmtDate(value: string) {
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function SubcontractorDetailClient({ subcontractor }: { subcontractor: Subcontractor }) {
  const [tab, setTab] = useState<"info" | "contracts" | "reviews">("info");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">{subcontractor.code}</div>
            <h1 className="text-xl font-bold text-[#f0f2ff]">{subcontractor.name}</h1>
            <div className="mt-1 text-xs text-[#8892b0]">{typeLabel(subcontractor.type)} {subcontractor.taxCode ? `• MST ${subcontractor.taxCode}` : ""}</div>
          </div>
          <span className={`rounded-full px-2 py-1 text-[11px] ${statusChipClass(subcontractor.status)}`}>{statusLabel(subcontractor.status)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={`tel:${subcontractor.phone}`} className="inline-flex items-center gap-1 rounded-full bg-[#f97316]/15 px-3 py-1.5 text-sm text-[#fb923c]">
            <Phone className="h-4 w-4" /> {subcontractor.phone}
          </a>
          {subcontractor.altPhone ? <a href={`tel:${subcontractor.altPhone}`} className="rounded-full bg-[#252840] px-3 py-1.5 text-sm text-[#a4acc8]">{subcontractor.altPhone}</a> : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-[#252840] bg-[#13151f] p-2">
            <div className="text-[#8892b0]">ĐTB đánh giá</div>
            <div className="mt-1 text-base font-semibold text-[#f0f2ff]">{subcontractor.avgRating ?? "-"}</div>
          </div>
          <div className="rounded-xl border border-[#252840] bg-[#13151f] p-2">
            <div className="text-[#8892b0]">Tổng HĐ</div>
            <div className="mt-1 text-base font-semibold text-[#f0f2ff]">{subcontractor.totalContracts}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {subcontractor.specialties.length > 0 ? (
            subcontractor.specialties.map((sp) => (
              <span key={sp.id} className="rounded-full bg-[#252840] px-2 py-1 text-[11px] text-[#a4acc8]">
                {sp.icon || "🛠️"} {sp.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-[#8892b0]">Chưa gán chuyên môn</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="mb-3 flex gap-2">
          <Button variant={tab === "info" ? "default" : "outline"} size="sm" onClick={() => setTab("info")}>Thông tin</Button>
          <Button variant={tab === "contracts" ? "default" : "outline"} size="sm" onClick={() => setTab("contracts")}>Lịch sử HĐ</Button>
          <Button variant={tab === "reviews" ? "default" : "outline"} size="sm" onClick={() => setTab("reviews")}>Đánh giá</Button>
        </div>

        {tab === "info" ? (
          <div className="space-y-2 text-sm text-[#a4acc8]">
            <div><span className="text-[#8892b0]">Email:</span> {subcontractor.email || "-"}</div>
            <div><span className="text-[#8892b0]">Địa chỉ:</span> {subcontractor.address || "-"}</div>
            <div><span className="text-[#8892b0]">Ngân hàng:</span> {subcontractor.bankName || "-"}</div>
            <div><span className="text-[#8892b0]">Số TK:</span> {subcontractor.bankAccount || "-"}</div>
            <div><span className="text-[#8892b0]">Tên TK:</span> {subcontractor.bankAccountName || "-"}</div>
            <div><span className="text-[#8892b0]">Ghi chú:</span> {subcontractor.notes || "-"}</div>
            <div><span className="text-[#8892b0]">Cập nhật:</span> {fmtDate(subcontractor.updatedAt)}</div>
          </div>
        ) : null}

        {tab === "contracts" ? (
          <div className="rounded-xl border border-dashed border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">
            Placeholder Phase C: lịch sử hợp đồng thầu phụ sẽ hiển thị tại đây.
          </div>
        ) : null}

        {tab === "reviews" ? (
          <div className="rounded-xl border border-dashed border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">
            Placeholder Phase E: danh sách đánh giá thầu phụ sẽ hiển thị tại đây.
          </div>
        ) : null}
      </div>
    </div>
  );
}
