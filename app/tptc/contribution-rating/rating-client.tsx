"use client";

import { useEffect, useState } from "react";

type PendingRow = {
  id: string;
  userId: string;
  userName: string;
  email: string;
  status: "draft" | "pending" | "finalized";
  scoreContribution: number;
  contributionNote: string | null;
  contributionBy: string | null;
  contributionAt: string | null;
};

type PendingResponse = {
  year: number;
  month: number;
  rows: PendingRow[];
};

export function ContributionRatingClient({ canFinalize }: { canFinalize: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<PendingResponse | null>(null);
  const [scoreInput, setScoreInput] = useState<Record<string, string>>({});
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tptc/contribution-pending", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được danh sách chờ chấm");
      }
      setData(json as PendingResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách chờ chấm");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitScore(id: string) {
    const score = Number(scoreInput[id] || "0");
    const note = (noteInput[id] || "").trim();

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/kpi-monthly/${id}/contribution-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, note: note || null }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không chấm được điểm Đóng góp");
      }

      setMessage("Đã lưu điểm Đóng góp");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không chấm được điểm Đóng góp");
    }
  }

  async function finalize(id: string) {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/kpi-monthly/${id}/finalize`, { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không chốt được kỳ KPI");
      }
      setMessage("Đã chốt KPI tháng");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không chốt được kỳ KPI");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-sm font-semibold text-[#d9def3]">Chấm KPI Đóng góp (TPTC)</div>
        <div className="mt-1 text-xs text-[#98a0c2]">Chỉ hiển thị dữ liệu cần để chấm đóng góp, không hiển thị lương.</div>
      </div>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải dữ liệu...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div> : null}

      <div className="space-y-2">
        {(data?.rows || []).map((row) => (
          <div key={row.id} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">{row.userName}</div>
            <div className="text-xs text-[#98a0c2]">{row.email}</div>
            <div className="mt-1 text-xs text-[#98a0c2]">Trạng thái: {row.status}</div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="Điểm đóng góp (0-100)"
                value={scoreInput[row.id] ?? String(row.scoreContribution || "")}
                onChange={(event) =>
                  setScoreInput((prev) => ({
                    ...prev,
                    [row.id]: event.target.value,
                  }))
                }
                className="rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
              />
              <input
                placeholder="Ghi chú"
                value={noteInput[row.id] ?? row.contributionNote ?? ""}
                onChange={(event) =>
                  setNoteInput((prev) => ({
                    ...prev,
                    [row.id]: event.target.value,
                  }))
                }
                className="rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => submitScore(row.id)}
                className="rounded-xl bg-[#f97316] px-3 py-2 text-xs font-semibold text-black"
              >
                Lưu điểm
              </button>
              {canFinalize ? (
                <button
                  type="button"
                  onClick={() => finalize(row.id)}
                  className="rounded-xl bg-[#2f7e4d] px-3 py-2 text-xs font-semibold text-white"
                >
                  Chốt tháng
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
