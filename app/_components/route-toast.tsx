"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function RouteToast({ denied }: { denied?: string }) {
  useEffect(() => {
    if (denied === "1") {
      toast.error("Không có quyền");
    }
  }, [denied]);

  return null;
}
