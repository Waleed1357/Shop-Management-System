"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Eye, FileDown, Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Expense } from "@/lib/types";
import { cn, errorMessage, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import Button from "@/components/ui/Button";
import MetricCard from "@/components/ui/MetricCard";
import Modal from "@/components/ui/Modal";
import DetailsModal from "@/components/ui/DetailsModal";
import ExportRangeModal, { inExportRange, presetRange, type ExportRange } from "@/components/ui/ExportRangeModal";
import { downloadTablePdf } from "@/lib/pdf";
import { useSettings } from "@/components/providers/SettingsProvider";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/providers/ToastProvider";

/** Ready-made expense types. Anything else is typed in with "Custom". */
export const EXPENSE_TYPES = ["Electricity Bill", "Food", "Salary", "Water", "Fuel"];
const CUSTOM = "__custom__";

type Period = "week" | "month" | "year" | "all" | "custom";
const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

type ExpenseForm = { type: string; customType: string; amount: string; date: string; notes: string };

export default function ExpensesList() {
  const toast = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { settings } = useSettings();
  const [form, setForm] = useState<ExpenseForm>({ type: "", customType: "", amount: "", date: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      const message = errorMessage(error);
      setLoadError(message);
      toast(message, "error");
    } else {
      setExpenses((data as Expense[]) ?? []);
      setLoadError("");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  /** Expenses matching the search box (any date). */
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return expenses;
    return expenses.filter((expense) =>
      [expense.expense_type, expense.notes, expense.expense_date].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [expenses, search]);

  // The chosen period (week / month / year / all / custom) as a date range.
  const range = useMemo<ExportRange>(() => {
    if (period === "all") return { start: "", end: "", label: "All time" };
    if (period === "custom") return { start: customFrom, end: customTo, label: `${customFrom || "…"} to ${customTo || "…"}` };
    const { start, end } = presetRange(period);
    return { start, end, label: `${PERIODS.find((p) => p.id === period)!.label} (${start} to ${end})` };
  }, [period, customFrom, customTo]);

  /** What the table shows: the search and the period together. */
  const filtered = useMemo(() => searched.filter((expense) => inExportRange(expense.expense_date, range)), [searched, range]);

  const totals = useMemo(() => {
    const sum = (list: Expense[]) => list.reduce((total, expense) => total + Number(expense.amount), 0);
    // Total per expense type in the period, biggest first
    const byType = new Map<string, number>();
    filtered.forEach((expense) => byType.set(expense.expense_type, (byType.get(expense.expense_type) ?? 0) + Number(expense.amount)));
    return {
      all: sum(expenses),
      period: sum(filtered),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [expenses, filtered]);

  function openForm(expense?: Expense) {
    const known = expense ? EXPENSE_TYPES.includes(expense.expense_type) : true;
    setEditing(expense ?? null);
    setForm({
      type: expense ? (known ? expense.expense_type : CUSTOM) : "",
      customType: expense && !known ? expense.expense_type : "",
      amount: expense ? String(expense.amount) : "",
      date: expense?.expense_date ?? todayISO(),
      notes: expense?.notes ?? "",
    });
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const expenseType = form.type === CUSTOM ? form.customType.trim() : form.type;
    if (!expenseType) {
      toast(form.type === CUSTOM ? "Type the expense name" : "Choose an expense type", "error");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(amount) || amount < 0) {
      toast("Enter a valid amount", "error");
      return;
    }

    setSaving(true);
    const payload = { expense_type: expenseType, amount, expense_date: form.date, notes: form.notes.trim() || null };
    const supabase = createClient();
    const { error } = editing
      ? await supabase.from("expenses").update(payload).eq("id", editing.id)
      : await supabase.from("expenses").insert(payload);
    setSaving(false);
    if (error) {
      toast(errorMessage(error), "error");
      return;
    }
    toast(editing ? "Expense updated" : "Expense added");
    setFormOpen(false);
    load();
  }

  function exportExpenses(range: ExportRange) {
    const rows = searched.filter((expense) => inExportRange(expense.expense_date, range));
    if (!rows.length) {
      toast("No expenses in that period.", "error");
      return;
    }
    const total = rows.reduce((sum, expense) => sum + Number(expense.amount), 0);
    downloadTablePdf(
      "Expenses",
      ["Expense", "Amount", "Date", "Note"],
      [
        ...rows.map((expense) => [expense.expense_type, formatMoney(expense.amount), formatDate(expense.expense_date), expense.notes || "-"]),
        ["TOTAL", formatMoney(total), "", ""],
      ],
      { businessName: settings.business_name, logoUrl: settings.logo_url },
      range.label,
    );
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Shop running costs like bills, food and salaries"
        action={
          <>
            <Button variant="secondary" disabled={!searched.length} onClick={() => setExportOpen(true)}>
              <FileDown className="size-4" /> Export PDF
            </Button>
            <Button onClick={() => openForm()}>
              <Plus className="size-4" /> Add Expense
            </Button>
          </>
        }
      />

      {/* Period: week / month / year / all / custom */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Expense period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              onClick={() => {
                setPeriod(p.id);
                if (p.id === "custom" && !customFrom) {
                  setCustomFrom(presetRange("month").start);
                  setCustomTo(todayISO());
                }
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                period === p.id ? "bg-white text-red-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-end gap-2">
            <Field label="From">
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            </Field>
            <Field label="To">
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
            </Field>
          </div>
        )}
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<CalendarDays className="size-5" />}
          tone="bg-red-50 text-red-600"
          label={period === "all" ? "All expenses" : `Spent · ${range.label}`}
          value={formatMoney(totals.period)}
          loading={loading}
        />
        <MetricCard icon={<Receipt className="size-5" />} tone="bg-amber-50 text-amber-600" label="Entries in this period" value={filtered.length.toLocaleString()} loading={loading} />
        <MetricCard icon={<Wallet className="size-5" />} tone="bg-slate-100 text-slate-600" label="All time" value={formatMoney(totals.all)} loading={loading} />
      </div>

      {/* Where the money went in this period */}
      {!loading && totals.byType.length > 0 && (
        <Card className="mb-5">
          <div className="space-y-2.5 pt-1">
            {totals.byType.map(([type, amount]) => {
              const share = totals.period > 0 ? (amount / totals.period) * 100 : 0;
              return (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{type}</span>
                    <span className="whitespace-nowrap text-slate-600">
                      <b className="text-slate-900">{formatMoney(amount)}</b> · {share.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by expense type, note or date..." className="mb-4" />
        <div className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100">
          <Table
            loading={loading}
            head={["Expense", "Amount", "Date", "Note", "Actions"]}
            empty={!filtered.length}
            emptyText={loadError
              ? `Could not load expenses: ${loadError}`
              : search
                ? "No expenses match your search in this period."
                : expenses.length
                  ? "No expenses in this period."
                  : "No expenses have been added yet."}
          >
            {filtered.map((expense) => (
              <tr key={expense.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">{expense.expense_type}</td>
                <td className="px-3 py-3 font-medium">{formatMoney(expense.amount)}</td>
                <td className="px-3 py-3">{formatDate(expense.expense_date)}</td>
                <td className="px-3 py-3 text-slate-600">{expense.notes || "-"}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton label="View expense" onClick={() => setViewing(expense)}>
                      <Eye className="size-4" />
                    </IconButton>
                    <IconButton label="Edit expense" onClick={() => openForm(expense)}>
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        {filtered.length > 0 && (
          <p className="mt-3 text-right text-sm text-slate-600">
            Total shown: <span className="font-semibold text-slate-900">{formatMoney(totals.period)}</span>
          </p>
        )}
      </Card>

      <ExportRangeModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={exportExpenses} title="Export expenses" />

      <DetailsModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.expense_type ?? "Expense"}
        subtitle="Expense details"
        rows={viewing ? [
          { label: "Expense", value: viewing.expense_type },
          { label: "Amount", value: formatMoney(viewing.amount) },
          { label: "Date", value: formatDate(viewing.expense_date) },
          { label: "Added on", value: formatDate(viewing.created_at) },
          { label: "Note", value: viewing.notes, wide: true },
        ] : []}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Expense" : "Add Expense"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Expense" required>
            <Select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
              aria-label="Expense type"
            >
              <option value="">Select expense</option>
              {EXPENSE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
              <option value={CUSTOM}>Custom (type your own)</option>
            </Select>
          </Field>
          {form.type === CUSTOM && (
            <Field label="Expense name" required>
              <Input
                autoFocus
                value={form.customType}
                onChange={(event) => setForm((current) => ({ ...current, customType: event.target.value }))}
                required
                placeholder="e.g. Shop rent, Internet bill"
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                required
                placeholder="0"
              />
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                required
              />
            </Field>
          </div>
          <Field label="Note (Optional)">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Any details about this expense..."
              className="min-h-20"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Update" : "Save Expense"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
