import { SubContractStatus, SubContractUnit } from "@prisma/client";

export function subContractStatusLabel(status: SubContractStatus) {
  if (status === SubContractStatus.draft) return "Nháp";
  if (status === SubContractStatus.active) return "Đang thực hiện";
  if (status === SubContractStatus.completed) return "Hoàn thành";
  return "Đã hủy";
}

export function subContractStatusClass(status: SubContractStatus) {
  if (status === SubContractStatus.draft) return "bg-zinc-500/15 text-zinc-300";
  if (status === SubContractStatus.active) return "bg-blue-500/15 text-blue-300";
  if (status === SubContractStatus.completed) return "bg-emerald-500/15 text-emerald-300";
  return "bg-red-500/15 text-red-300";
}

export function subContractUnitLabel(unit: SubContractUnit | null | undefined) {
  if (unit === SubContractUnit.per_m2) return "Theo m²";
  if (unit === SubContractUnit.per_day) return "Theo ngày";
  if (unit === SubContractUnit.per_unit) return "Theo đơn vị";
  return "Trọn gói";
}

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "***";
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
