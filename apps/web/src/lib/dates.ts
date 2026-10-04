/**
 * Report date ranges in shop time. Kenya is UTC+3 all year (no daylight
 * saving), so day boundaries are fixed offsets.
 */
export const SHOP_TIME_ZONE = "Africa/Nairobi";
const OFFSET = "+03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export const RANGE_PRESETS = ["today", "yesterday", "7d", "30d", "month"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

export interface DateRange {
  /** Inclusive start (shop midnight). */
  from: Date;
  /** Exclusive end (the next shop midnight). */
  to: Date;
  /** First and last shop day, YYYY-MM-DD. */
  fromDay: string;
  toDay: string;
  label: string;
  preset: RangePreset | null;
}

/** YYYY-MM-DD of an instant in shop time. */
export function shopDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE }).format(date);
}

const startOf = (day: string) => new Date(`${day}T00:00:00${OFFSET}`);
const addDays = (day: string, days: number) => shopDay(new Date(startOf(day).getTime() + days * DAY_MS + 12 * 60 * 60 * 1000));
const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(startOf(value).getTime());

const dayFormat = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: SHOP_TIME_ZONE });

function build(fromDay: string, toDay: string, preset: RangePreset | null): DateRange {
  const label = preset
    ? RANGE_LABEL[preset]
    : fromDay === toDay
      ? dayFormat.format(startOf(fromDay))
      : `${dayFormat.format(startOf(fromDay))} – ${dayFormat.format(startOf(toDay))}`;
  return { from: startOf(fromDay), to: startOf(addDays(toDay, 1)), fromDay, toDay, label, preset };
}

/** Resolves ?range=<preset> or ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: today). */
export function resolveRange(params: Record<string, string | string[] | undefined>, now = new Date()): DateRange {
  const today = shopDay(now);
  const { range, from, to } = params;
  if (isDay(from)) {
    const end = isDay(to) && to >= from ? to : from;
    return build(from, end, null);
  }
  switch (range) {
    case "yesterday":
      return build(addDays(today, -1), addDays(today, -1), "yesterday");
    case "7d":
      return build(addDays(today, -6), today, "7d");
    case "30d":
      return build(addDays(today, -29), today, "30d");
    case "month":
      return build(`${today.slice(0, 8)}01`, today, "month");
    default:
      return build(today, today, "today");
  }
}

/** Every shop day in the range, for filling gaps in daily series. */
export function daysIn(range: DateRange): string[] {
  const days: string[] = [];
  for (let day = range.fromDay; day <= range.toDay; day = addDays(day, 1)) days.push(day);
  return days;
}

export const dateTimeFormat = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: SHOP_TIME_ZONE,
});
