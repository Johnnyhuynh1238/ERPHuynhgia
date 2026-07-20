"use client";

import { useEffect, useState } from "react";

// Đếm ngược 30 phút kể từ lúc tạo lệnh chi. Hết giờ -> nhắc liên hệ kế toán.
export function PayCountdown({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, deadlineMs - now);
  const over = left <= 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={`pay-count${over ? " over" : ""}`}>
      {over ? (
        <span>Đã quá 30 phút — vui lòng liên hệ kế toán</span>
      ) : (
        <>
          <span className="lbl">Dự kiến chi trong</span>
          <span className="clk">{pad(mm)}:{pad(ss)}</span>
        </>
      )}
    </div>
  );
}
