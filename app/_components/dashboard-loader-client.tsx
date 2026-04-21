"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardClient } from "./dashboard-client";

export function DashboardLoaderClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        toast.error(json.message || "Không tải được dashboard");
        return;
      }

      setData(json);
    }

    load();
  }, []);

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Đang tải dashboard...</div>;
  }

  if (!data) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Không tải được dashboard. Vui lòng thử lại.</div>;
  }

  return <DashboardClient data={data} />;
}
