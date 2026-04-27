"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CustomerPortalLoginForm({ token, customerName }: { token: string; customerName: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);

  function updateDigit(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = v;
      return next;
    });

    if (v && index < 3) {
      const next = document.getElementById(`cn-digit-${index + 1}`) as HTMLInputElement | null;
      next?.focus();
    }
  }

  async function submit() {
    const password = digits.join("");
    if (password.length !== 4) {
      toast.error("Vui lòng nhập đủ 4 số");
      return;
    }

    setLoading(true);
    const res = await fetch(`/cn/${token}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Đăng nhập thất bại");
      return;
    }

    toast.success("Đăng nhập thành công");
    router.push(`/cn/${token}/dashboard`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-orange-300">Xin chào chủ nhà {customerName}</h1>
        <p className="mb-6 text-sm text-[#8892b0]">Nhập 4 số cuối CCCD/SĐT để xem dự án của gia đình.</p>

        <div className="mb-6 flex justify-center gap-2">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`cn-digit-${idx}`}
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => updateDigit(idx, e.target.value)}
              className="h-12 w-12 rounded-lg border border-[#2d3249] bg-[#13151f] text-center text-lg"
            />
          ))}
        </div>

        <Button className="w-full bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submit} disabled={loading}>
          {loading ? "Đang xác nhận..." : "Xác nhận"}
        </Button>
      </div>
    </div>
  );
}
