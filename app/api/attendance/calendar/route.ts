import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function parseMonth(input: string | null) {
  if (!input || !/^\d{4}-\d{2}$/.test(input)) return null;
  const [y, m] = input.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "engineer") {
    return NextResponse.json({ message: "Chỉ kỹ sư được xem trang này" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = parseMonth(url.searchParams.get("month"));
  if (!parsed) {
    return NextResponse.json({ message: "Tháng không hợp lệ (YYYY-MM)" }, { status: 400 });
  }

  const start = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(parsed.year, parsed.month, 1, 0, 0, 0));

  const rows = await prisma.ksAttendance.findMany({
    where: {
      userId: user.id,
      workDate: { gte: start, lt: end },
    },
    orderBy: [{ workDate: "asc" }, { checkInAt: "asc" }],
    select: {
      id: true,
      workDate: true,
      checkInAt: true,
      checkOutAt: true,
      durationMinutes: true,
    },
  });

  // Gộp theo ngày
  const dayMap = new Map<
    string,
    {
      date: string;
      sessions: number;
      totalMinutes: number;
      hasOpen: boolean;
      firstIn: string | null;
      lastOut: string | null;
    }
  >();
  for (const row of rows) {
    const key = ymd(row.workDate);
    const cur = dayMap.get(key) || {
      date: key,
      sessions: 0,
      totalMinutes: 0,
      hasOpen: false,
      firstIn: null,
      lastOut: null,
    };
    cur.sessions += 1;
    cur.totalMinutes += row.durationMinutes || 0;
    if (!row.checkOutAt) cur.hasOpen = true;
    if (!cur.firstIn || row.checkInAt.toISOString() < cur.firstIn) {
      cur.firstIn = row.checkInAt.toISOString();
    }
    if (row.checkOutAt) {
      const iso = row.checkOutAt.toISOString();
      if (!cur.lastOut || iso > cur.lastOut) cur.lastOut = iso;
    }
    dayMap.set(key, cur);
  }

  return NextResponse.json({
    month: `${String(parsed.year)}-${String(parsed.month).padStart(2, "0")}`,
    days: Array.from(dayMap.values()),
  });
}
