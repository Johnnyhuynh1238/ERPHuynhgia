"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

export function ProjectAiButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2d6cf6]/50 bg-[#2d6cf6]/15 px-3 py-1.5 text-sm font-semibold text-[#7aa2ff] hover:bg-[#2d6cf6]/25"
        title="AI quản lý dự án (chat)"
      >
        <Sparkles className="h-4 w-4" /> AI dự án
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3"
            style={{ height: "100dvh" }}
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col overflow-hidden rounded-2xl border border-[#2d3249] bg-[#0b0d16] shadow-2xl"
              style={{ width: "min(420px, 100%)", height: "min(640px, calc(100dvh - 24px))" }}
            >
              <div className="flex items-center gap-2 border-b border-[#252840] bg-[#12141f] px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7aa2ff]">
                  <Sparkles className="h-4 w-4" /> AI dự án · {code}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto rounded-md px-2 py-0.5 text-[#8b95b7] hover:bg-[#252840] hover:text-white"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=duan-${encodeURIComponent(code)}`}
                title="AI dự án"
                className="w-full flex-1 border-0"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
