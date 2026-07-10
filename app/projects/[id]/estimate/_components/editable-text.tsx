"use client";

import { useEffect, useRef, useState } from "react";

// Ô sửa tại chỗ kiểu excel: click → textarea, blur/Enter lưu, Esc huỷ.
// Style theo design system Dự toán (.est-ed) — nền trong suốt, focus viền cam.
export function EditableText({
  value,
  onSave,
  multiline = false,
  placeholder = "—",
  className = "",
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(draft.length, draft.length);
      autoGrow(ref.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    if (draft.trim() !== value.trim()) await onSave(draft.trim());
  };

  if (!editing) {
    return (
      <div
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`est-ed ${value ? "" : "empty"} ${className}`}
      >
        {value || placeholder}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      onChange={(e) => {
        setDraft(e.target.value);
        autoGrow(e.target);
      }}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void commit();
        }
      }}
      className={`est-ed-input ${className}`}
    />
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
