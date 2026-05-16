"use client";

import { useEffect, useState } from "react";

type TeamMember = {
  id: string | null | undefined;
  role: string;
  fullName: string;
  phone: string | null | undefined;
  avatarUrl: string | null | undefined;
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[parts.length - 2][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return (first + last).toUpperCase();
}

export function TeamSection({ members }: { members: TeamMember[] }) {
  const visible = members.filter((m) => m.id);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!previewSrc) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewSrc]);

  if (visible.length === 0) return null;

  return (
    <section className="owner-section">
      <div className="owner-section-title">ĐỘI NGŨ</div>
      <div className="grid gap-2">
        {visible.map((member) => (
          <div key={`${member.role}-${member.id}`} className="owner-card flex items-center gap-3">
            <button
              type="button"
              onClick={() => member.avatarUrl && setPreviewSrc(member.avatarUrl)}
              disabled={!member.avatarUrl}
              aria-label={member.avatarUrl ? `Xem ảnh ${member.fullName}` : member.fullName}
              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#ff8a3d] text-sm font-bold text-black ring-1 ring-[#ff8a3d]/40 disabled:cursor-default"
            >
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">{initialsOf(member.fullName)}</span>
              )}
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate font-semibold text-white">{member.fullName}</div>
              <span className="owner-chip orange shrink-0">{member.role}</span>
              {member.phone ? (
                <a
                  href={`tel:${member.phone}`}
                  aria-label={`Gọi ${member.fullName}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ff8a3d] text-black transition active:scale-95"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.58 1 1 0 0 1-.24 1.02l-2.2 2.2Z" />
                  </svg>
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {previewSrc ? (
        <div
          onClick={() => setPreviewSrc(null)}
          role="dialog"
          aria-label="Ảnh đại diện"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-6"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPreviewSrc(null); }}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
          >
            Đóng
          </button>
          <img src={previewSrc} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </section>
  );
}
