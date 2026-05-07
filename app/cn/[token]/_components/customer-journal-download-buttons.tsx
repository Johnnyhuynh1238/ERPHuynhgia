"use client";

import { useState } from "react";

type DownloadType = "pdf" | "zip";
type DownloadState = {
  status: "idle" | "working" | "ready" | "failed";
  message?: string;
  downloadUrl?: string;
};

const labels: Record<DownloadType, string> = {
  pdf: "Tạo PDF tóm tắt",
  zip: "Tạo ZIP đầy đủ",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readMessage(response: Response) {
  const data = await response.json().catch(() => null);
  return data?.message || "Không tạo được file tải";
}

async function waitForJob(pollUrl: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await fetch(pollUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(await readMessage(response));
    const data = await response.json();
    if (data.job?.status === "ready" && data.downloadUrl) return data.downloadUrl as string;
    if (data.job?.status === "failed") throw new Error(data.job.error || "Không tạo được file tải");
    await sleep(2000);
  }
  throw new Error("File đang được xử lý lâu hơn dự kiến, vui lòng thử lại sau.");
}

function CustomerJournalDownloadButton({ token, type }: { token: string; type: DownloadType }) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  async function createDownload() {
    setState({ status: "working", message: "Đang tạo file, vui lòng chờ..." });
    try {
      const response = await fetch(`/api/customer/${token}/journal/download/${type}`, { method: "POST" });
      if (!response.ok) throw new Error(await readMessage(response));
      const data = await response.json();
      const downloadUrl = await waitForJob(data.pollUrl);
      setState({ status: "ready", message: "File đã sẵn sàng.", downloadUrl });
      window.location.href = downloadUrl;
    } catch (error) {
      setState({ status: "failed", message: error instanceof Error ? error.message : "Không tạo được file tải" });
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={createDownload} disabled={state.status === "working"} className={type === "zip" ? "owner-button w-full disabled:opacity-60" : "owner-card w-full text-sm font-semibold text-white disabled:opacity-60"}>
        {state.status === "working" ? "Đang tạo..." : labels[type]}
      </button>
      {state.message ? <div className={`text-xs ${state.status === "failed" ? "text-red-300" : "owner-muted"}`}>{state.message}</div> : null}
      {state.downloadUrl ? <a href={state.downloadUrl} className="block text-xs font-semibold text-[#ff8a3d] underline">Tải lại file</a> : null}
    </div>
  );
}

export function CustomerJournalDownloadButtons({ token }: { token: string }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <CustomerJournalDownloadButton token={token} type="pdf" />
      <CustomerJournalDownloadButton token={token} type="zip" />
    </div>
  );
}
