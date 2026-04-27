"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SubContractStatus } from "@prisma/client";
import { toast } from "sonner";
import { formatMoney, subContractStatusClass, subContractStatusLabel } from "@/lib/sub-contract-view";

type ContractItem = {
  id: string;
  code: string;
  title: string;
  scopeOfWork: string;
  status: SubContractStatus;
  contractValue: number | null;
  subcontractor: { id: string; code: string; name: string; phone: string };
  project: { id: string; code: string; name: string };
};

export function SubContractsClient({ canCreate: _canCreate }: { canCreate: boolean }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ContractItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SubContractStatus>("all");

  async function loadData() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status !== "all") qs.set("status", status);

    const res = await fetch(`/api/sub-contracts?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được danh sách hợp đồng");
      setRows([]);
      return;
    }

    setRows(json.contracts || []);
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const summaryText = useMemo(() => `Tổng ${rows.length} hợp đồng`, [rows.length]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[#f0f2ff]">Hợp đồng thầu phụ</h1>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8892b0]" />
            <input
              className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] py-2 pl-9 pr-3 text-sm text-[#f0f2ff]"
              placeholder="Tìm mã, dự án, tên thầu phụ, tiêu đề"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "all" | SubContractStatus)}>
            <option value="all">Tất cả trạng thái</option>
            <option value={SubContractStatus.draft}>Nháp</option>
            <option value={SubContractStatus.active}>Đang thực hiện</option>
            <option value={SubContractStatus.completed}>Hoàn thành</option>
            <option value={SubContractStatus.cancelled}>Đã hủy</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs text-[#8892b0]">{summaryText}</div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Đang tải dữ liệu...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">Chưa có hợp đồng.</div>
        ) : (
          rows.map((item) => (
            <Link key={item.id} href={`/sub-contracts/${item.id}`} className="block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[#8892b0]">{item.code} • {item.project.code}</div>
                  <div className="text-sm font-bold text-[#f0f2ff]">{item.subcontractor.name}</div>
                  <div className="mt-0.5 text-xs text-[#8892b0]">{item.project.name}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] ${subContractStatusClass(item.status)}`}>
                  {subContractStatusLabel(item.status)}
                </span>
              </div>

              <div className="mt-2 text-sm text-[#d9def3] line-clamp-2">{item.title}</div>
              <div className="mt-1 text-xs text-[#8892b0]">{item.scopeOfWork}</div>
              <div className="mt-2 text-xs text-[#8892b0]">Giá trị HĐ: {formatMoney(item.contractValue)}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
