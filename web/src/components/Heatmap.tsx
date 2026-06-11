import { useMemo } from "react";

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  value: number;
  label: string;
}

const CELL = 11;
const GAP = 3;
const WEEKS = 53;
const DAY_MS = 86_400_000;

const LEVELS = ["#27272a", "#14532d", "#15803d", "#22c55e", "#86efac"];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** GitHub-style contribution calendar for the last 12 months. */
export function Heatmap(props: { days: HeatmapDay[] }) {
  const { columns, monthLabels, max } = useMemo(() => {
    const byDate = new Map(props.days.map((day) => [day.date, day]));
    const today = new Date();
    const end = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );
    // start on the Sunday 52 weeks back
    const start = new Date(end.getTime() - (WEEKS * 7 - 1) * DAY_MS);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());

    const columns: Array<Array<HeatmapDay | null>> = [];
    const monthLabels: Array<{ week: number; label: string }> = [];
    let lastMonth = -1;
    let max = 0;
    for (let week = 0; week < WEEKS; week++) {
      const column: Array<HeatmapDay | null> = [];
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const date = new Date(
          start.getTime() + (week * 7 + dayOfWeek) * DAY_MS,
        );
        if (date > end) {
          column.push(null);
          continue;
        }
        const key = isoDate(date);
        const day = byDate.get(key) ?? { date: key, value: 0, label: key };
        if (day.value > max) max = day.value;
        column.push(day);
        if (dayOfWeek === 0 && date.getUTCMonth() !== lastMonth) {
          lastMonth = date.getUTCMonth();
          monthLabels.push({
            week,
            label: date.toLocaleDateString(undefined, {
              month: "short",
              timeZone: "UTC",
            }),
          });
        }
      }
      columns.push(column);
    }
    return { columns, monthLabels, max };
  }, [props.days]);

  const width = WEEKS * (CELL + GAP);
  const height = 7 * (CELL + GAP) + 16;

  function color(value: number): string {
    if (value <= 0 || max === 0) return LEVELS[0] as string;
    const bucket = Math.min(4, 1 + Math.floor((value / max) * 3.999));
    return LEVELS[bucket] as string;
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Activity heatmap"
      className="max-w-full"
    >
      {monthLabels.map((month) => (
        <text
          key={`${month.week}-${month.label}`}
          x={month.week * (CELL + GAP)}
          y={10}
          className="fill-zinc-500"
          fontSize={9}
        >
          {month.label}
        </text>
      ))}
      {columns.map((column, week) =>
        column.map((day, dayOfWeek) =>
          day ? (
            <rect
              key={day.date}
              x={week * (CELL + GAP)}
              y={16 + dayOfWeek * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={color(day.value)}
            >
              <title>{day.label}</title>
            </rect>
          ) : null,
        ),
      )}
    </svg>
  );
}
