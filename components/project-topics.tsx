"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Loader2, MessagesSquare, Plus, Send, X } from "lucide-react";
import "./project-topics.css";

// Ô trao đổi công việc nội bộ dự án: danh sách chủ đề + tạo chủ đề + popup bình luận.
// Dùng ở màn KS (/ks-ql/sub/[id]/menu), Tổng quan admin, màn kế toán và /projects/[id]/trao-doi.
// theme: "ks" tối cố định · "ov" ăn theo .ovdoc · "kph" ăn theo .kph (xem project-topics.css).

export type ProjectTopicsTheme = "ks" | "ov" | "kph";

type TopicRow = {
  id: string;
  title: string;
  body: string | null;
  authorName: string;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
};

type TopicDetail = {
  id: string;
  title: string;
  body: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  comments: { id: string; body: string; authorId: string; authorName: string; createdAt: string }[];
};

const PT_VARS = [
  "--pt-bg", "--pt-card", "--pt-row", "--pt-text", "--pt-mut", "--pt-line", "--pt-accent", "--pt-on-accent",
  "--pt-head", "--pt-name", "--pt-mine", "--pt-err", "--pt-fs", "--pt-fs-sm", "--pt-radius", "--pt-border",
];

// Popup portal ra body (khung app bọc transform làm fixed con lệch) → mất biến màu của màn cha.
// Lấy giá trị đã resolve từ ô gốc rồi gắn inline cho popup.
const SheetStyleCtx = createContext<() => CSSProperties>(() => ({}));

function fmtTime(s: string) {
  const d = new Date(s);
  const tz = { timeZone: "Asia/Ho_Chi_Minh" } as const;
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", ...tz });
  if (d.toLocaleDateString("vi-VN", tz) === new Date().toLocaleDateString("vi-VN", tz)) return hm;
  return `${hm} ${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", ...tz })}`;
}

export function ProjectTopics({
  projectId,
  initialTopicId,
  limit,
  theme = "ks",
}: {
  projectId: string;
  initialTopicId?: string | null;
  /** Chỉ hiện vài chủ đề gần nhất, bấm "Xem thêm" để mở rộng. */
  limit?: number;
  theme?: ProjectTopicsTheme;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(!limit);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialTopicId || null);

  const sheetStyle = useCallback((): CSSProperties => {
    const el = rootRef.current;
    if (!el) return {};
    const cs = getComputedStyle(el);
    const style: Record<string, string> = { fontFamily: cs.fontFamily };
    for (const v of PT_VARS) style[v] = cs.getPropertyValue(v).trim();
    return style as CSSProperties;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/topics?limit=200`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được trao đổi");
      setTopics(data.topics);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Giữ ?t= trên URL khớp popup đang mở (link thông báo mở thẳng chủ đề).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("t", openId);
    else url.searchParams.delete("t");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [openId]);

  const visible = topics ? (showAll || !limit ? topics : topics.slice(0, limit)) : [];

  return (
    <SheetStyleCtx.Provider value={sheetStyle}>
      <div ref={rootRef} className={`ptx pt-${theme} ptx-wrap`}>
        <div className="ptx-hd">
          <div className="ptx-ttl">
            <MessagesSquare className="h-5 w-5" />
            Trao đổi công việc
          </div>
          <button type="button" onClick={() => setCreating(true)} className="ptx-new ksql-tap">
            <Plus />
            Chủ đề mới
          </button>
        </div>

        <div className="ptx-box">
          {error ? (
            <div className="ptx-empty ptx-err">{error}</div>
          ) : topics === null ? (
            <div className="ptx-spin">
              <Loader2 className="ptx-rot" />
            </div>
          ) : topics.length === 0 ? (
            <div className="ptx-empty">Chưa có chủ đề nào. Bấm “Chủ đề mới” để trao đổi với cả nhóm dự án.</div>
          ) : (
            <div className="ptx-list">
              {visible.map((t) => (
                <button key={t.id} type="button" onClick={() => setOpenId(t.id)} className="ptx-row ksql-tap">
                  <div className="b">
                    <div className="t">{t.title}</div>
                    <div className="m">
                      <span>{t.authorName}</span>
                      <span>{fmtTime(t.lastActivityAt)}</span>
                      <span className={t.commentCount ? "cc" : ""}>💬 {t.commentCount}</span>
                    </div>
                  </div>
                  <ChevronRight />
                </button>
              ))}
              {limit && !showAll && total > limit ? (
                <button type="button" onClick={() => setShowAll(true)} className="ptx-more">
                  Xem thêm {total - limit} chủ đề
                </button>
              ) : null}
            </div>
          )}
        </div>

        {creating ? (
          <CreateTopicSheet
            projectId={projectId}
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              load();
              setOpenId(id);
            }}
          />
        ) : null}
        {openId ? (
          <TopicSheet projectId={projectId} topicId={openId} onClose={() => setOpenId(null)} onChanged={load} />
        ) : null}
      </div>
    </SheetStyleCtx.Provider>
  );
}

function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const getStyle = useContext(SheetStyleCtx);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useEffect(() => {
    setStyle(getStyle());
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = orig;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, getStyle]);
  if (!style) return null;
  return createPortal(
    <div className="ptx ptx-ov" style={style} onClick={onClose}>
      <div className="ptx-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ptx-sh">
          <div className="t">{title}</div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ptx-x">
            <X />
          </button>
        </div>
        <div className="ptx-sb">{children}</div>
        {footer ? <div className="ptx-sf">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

function CreateTopicSheet({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/topics`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tạo được chủ đề");
      onCreated(data.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Chủ đề mới"
      onClose={onClose}
      footer={
        <button type="button" onClick={submit} disabled={!title.trim() || saving} className="ptx-btn ksql-tap">
          {saving ? <Loader2 className="ptx-rot" /> : <Send />}
          Tạo chủ đề + báo cả nhóm
        </button>
      }
    >
      <div className="ptx-col">
        <input
          className="ptx-in"
          placeholder="Tiêu đề (vd: Đổ bê tông sàn tầng 2 ngày nào?)"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="ptx-in"
          style={{ minHeight: 140 }}
          placeholder="Nội dung chi tiết (không bắt buộc)"
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="ptx-hint">Mọi thành viên dự án sẽ nhận thông báo app + Zalo.</div>
        {err ? <div className="ptx-err">{err}</div> : null}
      </div>
    </Sheet>
  );
}

function TopicSheet({
  projectId,
  topicId,
  onClose,
  onChanged,
}: {
  projectId: string;
  topicId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/topics/${topicId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được chủ đề");
      setTopic(data.topic);
      setMeId(data.meId);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải");
    }
  }, [projectId, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [topic?.comments.length]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/topics/${topicId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không gửi được");
      setText("");
      await load();
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Lỗi gửi bình luận");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      title={topic?.title ?? "Chủ đề"}
      onClose={onClose}
      footer={
        topic ? (
          <div className="ptx-cmt">
            <textarea
              className="ptx-in"
              rows={2}
              placeholder="Viết bình luận…"
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="button" onClick={send} disabled={!text.trim() || sending} aria-label="Gửi" className="ptx-send ksql-tap">
              {sending ? <Loader2 className="ptx-rot" /> : <Send />}
            </button>
          </div>
        ) : null
      }
    >
      {err ? (
        <div className="ptx-empty ptx-err">{err}</div>
      ) : !topic ? (
        <div className="ptx-spin">
          <Loader2 className="ptx-rot" />
        </div>
      ) : (
        <div className="ptx-col">
          <div className="ptx-topic">
            <div className="ptx-who">
              <b>{topic.authorName}</b> · {fmtTime(topic.createdAt)}
            </div>
            {topic.body ? <div className="ptx-text">{topic.body}</div> : null}
          </div>
          {topic.comments.length === 0 ? (
            <div className="ptx-empty">Chưa có bình luận.</div>
          ) : (
            topic.comments.map((c) => {
              const mine = c.authorId === meId;
              return (
                <div key={c.id} className={`ptx-msg${mine ? " me" : ""}`}>
                  <div className="ptx-bub">
                    <div className="ptx-who">
                      {mine ? "Tôi" : <b>{c.authorName}</b>} · {fmtTime(c.createdAt)}
                    </div>
                    <div className="ptx-text">{c.body}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      )}
    </Sheet>
  );
}
