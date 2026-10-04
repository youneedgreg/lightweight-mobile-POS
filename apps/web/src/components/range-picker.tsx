import Link from "next/link";

import { RANGE_LABEL, RANGE_PRESETS, type DateRange } from "@/lib/dates";

/** Date range filter: preset links plus a custom from/to form. Lives in one row above the content. */
export function RangePicker({ range, basePath }: { range: DateRange; basePath: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_PRESETS.map((preset) => {
        const selected = range.preset === preset;
        return (
          <Link
            key={preset}
            href={`${basePath}?range=${preset}`}
            aria-current={selected ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${selected ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"}`}
          >
            {RANGE_LABEL[preset]}
          </Link>
        );
      })}
      <form action={basePath} className="flex items-center gap-1 text-sm">
        <input
          type="date"
          name="from"
          defaultValue={range.fromDay}
          aria-label="From"
          className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <span className="text-neutral-500">–</span>
        <input
          type="date"
          name="to"
          defaultValue={range.toDay}
          aria-label="To"
          className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 dark:border-neutral-700">
          Go
        </button>
      </form>
    </div>
  );
}
