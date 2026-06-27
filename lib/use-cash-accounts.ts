"use client";

import { useCallback, useEffect, useState } from "react";

export type CashAccountOption = {
  id: string;
  code: string;
  name: string;
  kind: "cash" | "bank";
  currentBalance: number;
};

export function useCashAccounts() {
  const [accounts, setAccounts] = useState<CashAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/treasury/accounts", { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được danh sách tài khoản quỹ");
      const data = await res.json();
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải tài khoản");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { accounts, loading, error, reload };
}

const KIND_LABEL: Record<"cash" | "bank", string> = {
  cash: "Tiền mặt",
  bank: "Ngân hàng",
};

export function formatCashAccountLabel(a: CashAccountOption) {
  const balance = new Intl.NumberFormat("vi-VN").format(a.currentBalance);
  return `${a.name} (${KIND_LABEL[a.kind]}) · ${balance}đ`;
}
