import { NextResponse } from "next/server";
import { sendDiaryReminders } from "@/lib/diary-reminders";

export const runtime = "nodejs";

/** Cron 17:00 + 20:00 hằng ngày (host crontab): nhắc KS chốt nhật ký dự án còn thiếu hôm nay. ?dry=1 chỉ xem, ko gửi. */
export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const dryRun = new URL(request.url).searchParams.get("dry") === "1";
    return NextResponse.json(await sendDiaryReminders({ dryRun }));
  } catch (err) {
    console.error("[cron ks-diary-reminder]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
