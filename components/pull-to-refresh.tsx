"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const THRESHOLD = 80;
const MAX_PULL = 130;

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        pulling.current = false;
        return;
      }
      if (window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        return;
      }
      pulling.current = true;
      const damped = Math.min(MAX_PULL, dy * 0.5);
      setPull(damped);
    }

    function onTouchEnd() {
      if (!pulling.current) {
        startY.current = null;
        return;
      }
      const reached = pull >= THRESHOLD;
      startY.current = null;
      pulling.current = false;
      if (reached) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.location.reload();
      } else {
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull]);

  if (pull <= 0 && !refreshing) return null;

  const ratio = Math.min(1, pull / THRESHOLD);
  const reached = pull >= THRESHOLD;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{ transform: `translateY(${Math.max(0, pull - 24)}px)` }}
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-xl ${
          reached
            ? "border-[#f97316]/60 bg-[#f97316]/20 text-[#fb923c]"
            : "border-[#252840] bg-[#13151f]/95 text-[#aab2cf]"
        }`}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${ratio * 360}deg)` }}
        />
        <span>{refreshing ? "Đang tải lại..." : reached ? "Thả tay để tải lại" : "Kéo để tải lại"}</span>
      </div>
    </div>
  );
}
