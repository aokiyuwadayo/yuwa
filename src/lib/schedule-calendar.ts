export const scheduleCategories = [
  { id: "regular", label: "通常", className: "bg-brand-600 text-white" },
  { id: "focus", label: "重点", className: "bg-slate-900 text-white" },
  { id: "external", label: "外部", className: "bg-warm-500 text-slate-950" },
  { id: "prep", label: "準備", className: "bg-blue-600 text-white" },
  { id: "presentation", label: "発表", className: "bg-violet-600 text-white" },
  { id: "review", label: "振り返り", className: "bg-slate-500 text-white" },
] as const;

export type ScheduleCategory = (typeof scheduleCategories)[number]["id"];

export interface CalendarCell {
  date: string;
  day: number;
  weekday: number;
  isCurrentMonth: boolean;
}

export interface CalendarMonth {
  year: number;
  monthIndex: number;
  label: string;
  cells: CalendarCell[];
}

export function categoryLabel(category: string): string {
  return (
    scheduleCategories.find((item) => item.id === category)?.label ??
    scheduleCategories[0].label
  );
}

export function categoryClassName(category: string): string {
  return (
    scheduleCategories.find((item) => item.id === category)?.className ??
    scheduleCategories[0].className
  );
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildCalendarMonth(year: number, monthIndex: number): CalendarMonth {
  const cells: CalendarCell[] = [];
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  for (let i = 0; i < first.getDay(); i += 1) {
    const date = new Date(year, monthIndex, i - first.getDay() + 1);
    cells.push({
      date: toIsoDate(date),
      day: date.getDate(),
      weekday: date.getDay(),
      isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push({
      date: toIsoDate(date),
      day,
      weekday: date.getDay(),
      isCurrentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1];
    const date = new Date(`${lastCell.date}T00:00:00`);
    date.setDate(date.getDate() + 1);
    cells.push({
      date: toIsoDate(date),
      day: date.getDate(),
      weekday: date.getDay(),
      isCurrentMonth: false,
    });
  }

  return {
    year,
    monthIndex,
    label: `${year}年${monthIndex + 1}月`,
    cells,
  };
}

export function addMonths(year: number, monthIndex: number, amount: number) {
  const date = new Date(year, monthIndex + amount, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function nextDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return toIsoDate(date);
}

export function escapeIcs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}
