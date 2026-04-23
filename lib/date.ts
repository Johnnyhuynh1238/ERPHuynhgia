export function parseYmdToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export function toUtcStartOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

export function toUtcEndOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatUtcYmd(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isSameUtcDate(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export function nowUtcDateOnly() {
  return toUtcStartOfDay(new Date());
}

export function localDeadlineForDate(date: Date, hour: number) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0, 0, 0);
}

type MonthRangeOptions = {
  rejectInvalid?: boolean;
};

type ParsedMonthInput = {
  month: string;
  start: Date;
  end: Date;
  isValid: boolean;
};

export function parseMonthInput(month: string | null | undefined): ParsedMonthInput;
export function parseMonthInput(month: string | null | undefined, options: { rejectInvalid: true }): ParsedMonthInput | null;
export function parseMonthInput(month: string | null | undefined, options?: MonthRangeOptions): ParsedMonthInput;
export function parseMonthInput(month: string | null | undefined, options?: MonthRangeOptions): ParsedMonthInput | null {
  const now = new Date();
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  if (!month) {
    const [y, m] = fallback.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { month: fallback, start, end, isValid: true };
  }

  const normalizedMonth = month.trim();
  const isPatternValid = /^\d{4}-\d{2}$/.test(normalizedMonth);
  if (!isPatternValid) {
    if (options?.rejectInvalid) {
      return null;
    }
    const [y, m] = fallback.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { month: fallback, start, end, isValid: false };
  }

  const [year, m] = normalizedMonth.split("-").map(Number);
  if (m < 1 || m > 12) {
    if (options?.rejectInvalid) {
      return null;
    }
    const [y, fallbackMonth] = fallback.split("-").map(Number);
    const start = new Date(Date.UTC(y, fallbackMonth - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, fallbackMonth, 0, 23, 59, 59, 999));
    return { month: fallback, start, end, isValid: false };
  }

  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
  return { month: normalizedMonth, start, end, isValid: true };
}
