import { HttpError } from "../../common/http-error.js";
import type { ReportQuery } from "./report.schema.js";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

export function zonedDateToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += wanted - represented;
  }
  return new Date(guess);
}

export function addLocalDays(timeZone: string, date: Date, days: number) {
  const parts = zonedParts(date, timeZone);
  const temp = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return zonedDateToUtc(
    timeZone,
    temp.getUTCFullYear(),
    temp.getUTCMonth() + 1,
    temp.getUTCDate(),
  );
}

export function localDayOfWeek(timeZone: string, date: Date) {
  const parts = zonedParts(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function endOfLocalDay(timeZone: string, date: Date) {
  return new Date(addLocalDays(timeZone, date, 1).getTime() - 1);
}

export function resolveReportPeriod(
  query: ReportQuery,
  timeZone: string,
  weekStartsOn: number,
  reference = new Date(),
) {
  if (query.preset === "ALL")
    return { from: null, to: null, label: "Seluruh periode" };

  const ref = query.date ?? reference;
  const refParts = zonedParts(ref, timeZone);
  const startToday = zonedDateToUtc(
    timeZone,
    refParts.year,
    refParts.month,
    refParts.day,
  );
  let from: Date;
  let to: Date;
  let label: string = query.preset;

  switch (query.preset) {
    case "TODAY":
    case "DAY":
      from = startToday;
      to = endOfLocalDay(timeZone, startToday);
      label = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone,
      }).format(from);
      break;
    case "THIS_WEEK":
    case "WEEK": {
      const currentDow = localDayOfWeek(timeZone, startToday);
      const delta = (currentDow - weekStartsOn + 7) % 7;
      from = addLocalDays(timeZone, startToday, -delta);
      to = new Date(addLocalDays(timeZone, from, 7).getTime() - 1);
      label = `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(from)} – ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(to)}`;
      break;
    }
    case "THIS_MONTH":
      from = zonedDateToUtc(timeZone, refParts.year, refParts.month, 1);
      to = new Date(
        zonedDateToUtc(
          timeZone,
          refParts.year,
          refParts.month + 1,
          1,
        ).getTime() - 1,
      );
      label = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone,
      }).format(from);
      break;
    case "PREVIOUS_MONTH": {
      const temp = new Date(Date.UTC(refParts.year, refParts.month - 2, 1));
      from = zonedDateToUtc(
        timeZone,
        temp.getUTCFullYear(),
        temp.getUTCMonth() + 1,
        1,
      );
      to = new Date(
        zonedDateToUtc(timeZone, refParts.year, refParts.month, 1).getTime() -
          1,
      );
      label = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone,
      }).format(from);
      break;
    }
    case "MONTH": {
      if (!query.month)
        throw new HttpError(400, "month wajib diisi dengan format YYYY-MM");
      const [year, month] = query.month.split("-").map(Number);
      from = zonedDateToUtc(timeZone, year!, month!, 1);
      to = new Date(
        zonedDateToUtc(timeZone, year!, month! + 1, 1).getTime() - 1,
      );
      label = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone,
      }).format(from);
      break;
    }
    case "THIS_YEAR":
      from = zonedDateToUtc(timeZone, refParts.year, 1, 1);
      to = new Date(
        zonedDateToUtc(timeZone, refParts.year + 1, 1, 1).getTime() - 1,
      );
      label = String(refParts.year);
      break;
    case "YEAR": {
      const year = query.year ?? refParts.year;
      from = zonedDateToUtc(timeZone, year, 1, 1);
      to = new Date(zonedDateToUtc(timeZone, year + 1, 1, 1).getTime() - 1);
      label = String(year);
      break;
    }
    case "CUSTOM":
      if (!query.from || !query.to)
        throw new HttpError(
          400,
          "from dan to wajib diisi untuk rentang khusus",
        );
      from = query.from;
      to = query.to;
      if (from > to)
        throw new HttpError(
          400,
          "Tanggal awal tidak boleh setelah tanggal akhir",
        );
      label = `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(from)} – ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone }).format(to)}`;
      break;
    default:
      throw new HttpError(400, "Preset laporan tidak didukung");
  }
  return { from, to, label };
}

export function groupKey(
  date: Date,
  grouping: ReportQuery["grouping"],
  timeZone: string,
  weekStartsOn: number,
) {
  if (grouping === "NONE") return "TOTAL";
  const parts = zonedParts(date, timeZone);
  if (grouping === "DAY") {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
  if (grouping === "MONTH")
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  if (grouping === "YEAR") return String(parts.year);
  const start = zonedDateToUtc(timeZone, parts.year, parts.month, parts.day);
  const delta = (localDayOfWeek(timeZone, start) - weekStartsOn + 7) % 7;
  const weekStart = addLocalDays(timeZone, start, -delta);
  const weekParts = zonedParts(weekStart, timeZone);
  return `${weekParts.year}-${String(weekParts.month).padStart(2, "0")}-${String(weekParts.day).padStart(2, "0")}`;
}
