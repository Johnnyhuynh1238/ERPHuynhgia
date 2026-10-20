import { NextResponse } from "next/server";
import { sendAcceptanceReminders } from "@/lib/acceptance-reminders";

export const runtime = "nodejs";

/** Cron 16:30 hằng ngày (host crontab): nhắc KS ký BB nghiệm thu còn sót / sắp tới qua Zalo + push. */
export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendAcceptanceReminders());
  } catch (err) {
    console.error("[cron ks-acceptance-reminder]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
