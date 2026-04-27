"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function RouteToast({ denied, deletedName }: { denied?: string; deletedName?: string }) {
  useEffect(() => {
    if (deletedName) {
      toast.success(`Đã xóa dự án ${deletedName}`);
      return;
    }

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
  }, [deletedName, denied]);

  return null;
}
