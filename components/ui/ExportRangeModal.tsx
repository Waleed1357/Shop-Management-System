"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, CalendarRange, FileDown } from "lucide-react";
import { cn, todayISO } from "@/lib/utils";
import Modal from "./Modal";
import Button from "./Button";
import { Field, Input } from "./Field";

/** Dates are YYYY-MM-DD. Empty start/end = no limit on that side. */
export interface ExportRange {
  start: string;
  end: string;
  /** Shown on the PDF, e.g. "This month (2026-10-01 to 2026-10-31)". */
  label: string;
}

type Choice = "week" | "month" | "year" | "all" | "custom";

const CHOICES: { id: Choice; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Start and end of this week (Monday to Sunday), month or year. */
export function presetRange(choice: Exclude<Choice, "custom" | "all">) {
  const now = new Date(`${todayISO()}T00:00:00`);
  if (choice === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: iso(start), end: iso(end) };
  }
  if (choice === "month") {
    return {
      start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}

/** True when the date (YYYY-MM-DD) is inside the range. */
export function inExportRange(date: string | null | undefined, range: ExportRange) {
  const day = (date ?? "").slice(0, 10);
  if (!day) return !range.start && !range.end;
  return (!range.start || day >= range.start) && (!range.end || day <= range.end);
}

/** Asks which period to export before the PDF is made. */
export default function ExportRangeModal({
  open,
  onClose,
  onExport,
  title = "Export PDF",
}: {
  open: boolean;
  onClose: () => void;
  onExport: (range: ExportRange) => void;
  title?: string;
}) {
  const [choice, setChoice] = useState<Choice>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    let range: ExportRange;
    if (choice === "custom") {
      if (!from || !to) return setError("Choose both a start and an end date.");
      if (from > to) return setError("The start date must be before the end date.");
      range = { start: from, end: to, label: `${from} to ${to}` };
    } else if (choice === "all") {
      range = { start: "", end: "", label: "All time" };
    } else {
      const { start, end } = presetRange(choice);
      const name = CHOICES.find((c) => c.id === choice)!.label;
      range = { start, end, label: `${name} (${start} to ${end})` };
    }
    setError("");
    onExport(range);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Which dates do you want in the PDF?" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setChoice(c.id);
                setError("");
                if (c.id === "custom" && !from) {
                  const month = presetRange("month");
                  setFrom(month.start);
                  setTo(todayISO());
                }
              }}
              aria-pressed={choice === c.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                c.id === "custom" && "col-span-2",
                choice === c.id
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {c.id === "custom" ? <CalendarRange className="size-4" /> : <CalendarDays className="size-4" />}
              {c.label}
            </button>
          ))}
        </div>

        {choice === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <FileDown className="size-4" /> Export
          </Button>
        </div>
      </form>
    </Modal>
  );
}
