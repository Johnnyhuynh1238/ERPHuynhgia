import { NextResponse } from "next/server";
import { isKsTaskKind, stepAsk, stepClose, stepRemind } from "@/lib/ks-daily-report";

export const runtime = "nodejs";

/**
 * Cron nhiệm vụ KS qua link Zalo. Host crontab gọi theo giờ:
 *   ?kind=headcount: 07:00 step=ask · 07:10→07:50 step=remind · 08:00 step=close
 *   ?kind=eod:       16:00 step=ask · 16:10→16:50 step=remind · 17:00 step=close
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const step = params.get("step");
  if (!isKsTaskKind(kind)) return NextResponse.json({ message: "kind phải là headcount|eod" }, { status: 400 });
  try {
    if (step === "ask") return NextResponse.json({ kind, step, ...(await stepAsk(kind)) });
    if (step === "remind") return NextResponse.json({ kind, step, ...(await stepRemind(kind)) });
    if (step === "close") return NextResponse.json({ kind, step, ...(await stepClose(kind)) });
    return NextResponse.json({ message: "step phải là ask|remind|close" }, { status: 400 });
  } catch (err) {
    console.error("[cron ks-daily-report]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
