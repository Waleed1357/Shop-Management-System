import { cn } from "@/lib/utils";

export const badgeStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-600/20",
  resolved: "bg-green-50 text-green-700 ring-green-600/20",
  paid: "bg-green-50 text-green-700 ring-green-600/20",
  unpaid: "bg-red-50 text-red-700 ring-red-600/20",
  partial: "bg-amber-50 text-amber-700 ring-amber-600/20",
  low: "bg-red-50 text-red-700 ring-red-600/20",
  ok: "bg-green-50 text-green-700 ring-green-600/20",
  used: "bg-slate-100 text-slate-700 ring-slate-500/20",
  partly_returned: "bg-amber-50 text-amber-700 ring-amber-600/20",
  returned: "bg-blue-50 text-blue-700 ring-blue-600/20",
};

export const badgeLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  resolved: "Resolved",
  paid: "Paid",
  unpaid: "Unpaid",
  partial: "Partial",
  low: "Low stock",
  ok: "In stock",
  used: "Used",
  partly_returned: "Partly returned",
  returned: "Returned",
};

export default function Badge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        badgeStyles[status] ?? "bg-slate-100 text-slate-600 ring-slate-500/20",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {badgeLabels[status] ?? status}
    </span>
  );
}
