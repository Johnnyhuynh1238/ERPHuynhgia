import { NextResponse } from "next/server";
import { buildKetoanReminderText, getKetoanAutoTodos, getOpenAccountantTasks } from "@/lib/ketoan-todos";
import { sendZaloBridge } from "@/lib/zalo-notify";

export const runtime = "nodejs";

/**
 * Cron nhắc kế toán qua Zalo các việc còn tồn. Host crontab gọi 8h,10h,…,20h (mỗi 2 tiếng).
 * Không còn việc → không gửi. ?dry=1 → chỉ trả nội dung, không gửi.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const [auto, tasks] = await Promise.all([getKetoanAutoTodos(), getOpenAccountantTasks()]);
    const text = buildKetoanReminderText(auto, tasks);
    if (!text) return NextResponse.json({ sent: false, reason: "no_todos" });
    if (dry) return NextResponse.json({ sent: false, dry: true, text });
    const sent = await sendZaloBridge({ to: "ketoan", text });
    return NextResponse.json({ sent, tasks: tasks.length });
  } catch (err) {
    console.error("[cron ketoan-todo-reminder]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
