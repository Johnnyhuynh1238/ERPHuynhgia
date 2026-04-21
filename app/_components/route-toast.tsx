"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function RouteToast({ denied }: { denied?: string }) {
  useEffect(() => {
    if (denied === "1") {
      toast.error("Không có quyền");
      return;
    }

    if (denied === "task") {
      toast.error("Bạn không có quyền xem task này");
      return;
    }

    if (denied === "payments") {
      toast.error("Không có quyền xem lịch thanh toán");
    }
  }, [denied]);

  return null;
}
