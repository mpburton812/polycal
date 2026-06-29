/** Converts reminder UI value + unit to minutes before event start (PC-65). */
export function reminderOffsetToMinutes(
  value: number,
  unit: "days" | "hours" | "minutes",
): number {
  if (value <= 0) return 0;
  if (unit === "days") return value * 24 * 60;
  if (unit === "hours") return value * 60;
  return value;
}

/** Splits stored minute offset into a display value and unit (PC-65). */
export function minutesToReminderDisplay(minutes: number | null | undefined): {
  enabled: boolean;
  value: number;
  unit: "days" | "hours" | "minutes";
} {
  if (!minutes || minutes <= 0) {
    return { enabled: false, value: 1, unit: "hours" };
  }
  if (minutes % (24 * 60) === 0) {
    return { enabled: true, value: minutes / (24 * 60), unit: "days" };
  }
  if (minutes % 60 === 0) {
    return { enabled: true, value: minutes / 60, unit: "hours" };
  }
  return { enabled: true, value: minutes, unit: "minutes" };
}
