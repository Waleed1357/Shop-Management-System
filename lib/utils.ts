/** Change this to "$", "PKR", etc. to switch the currency everywhere. */
export const CURRENCY = "Rs";

export function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `${CURRENCY} ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

/** e.g. INV-20261022-4821 */
export function generateInvoiceNo() {
  const date = todayISO().replaceAll("-", "");
  return `INV-${date}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Months", "1 Year", "15 Days" — or null when there's no warranty. */
export function formatWarranty(value?: number | null, unit?: string | null) {
  if (!value || !unit) return null;
  const word = unit.charAt(0).toUpperCase() + unit.slice(1, value === 1 ? -1 : undefined);
  return `${value} ${word}`;
}

/** Last day the warranty covers (YYYY-MM-DD), counted from the purchase date. */
export function warrantyEndDate(start: string, value?: number | null, unit?: string | null) {
  if (!value || !unit || !start) return null;
  const date = new Date(`${start}T00:00:00`);
  if (unit === "days") date.setDate(date.getDate() + value);
  else if (unit === "months") date.setMonth(date.getMonth() + value);
  else if (unit === "years") date.setFullYear(date.getFullYear() + value);
  else return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function errorMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err) return String(err.message);
  return "Something went wrong";
}
