import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-5", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {/* On phones the buttons share the full width */}
      {action && <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">{action}</div>}
    </div>
  );
}

export function EmptyState({ text = "No records found.", action }: { text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:py-14">
      <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="size-6" />
      </div>
      <p className="text-sm text-slate-500">{text}</p>
      {action}
    </div>
  );
}

interface TableProps {
  head: string[];
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
}

type CellProps = { children?: ReactNode; "data-label"?: string };

/** Gives every cell a data-label (its column name) so phones can show rows as labelled cards. */
function labelCells(children: ReactNode, head: string[]) {
  return Children.map(children, (row) => {
    if (!isValidElement<CellProps>(row)) return row;
    let i = 0;
    // Content is wrapped in one div so the phone card layout stays "label | value".
    const cells = Children.map(row.props.children, (cell) =>
      isValidElement<CellProps>(cell)
        ? cloneElement(
            cell as ReactElement<CellProps>,
            { "data-label": head[i++] ?? "" },
            <div className="min-w-0 max-md:wrap-break-word">{cell.props.children}</div>,
          )
        : cell,
    );
    return cloneElement(row, {}, cells);
  });
}

/**
 * Data table.
 * - Tablet / desktop: a normal table (scrolls sideways if the screen is too narrow).
 * - Phone (< 768px): each row becomes a card with "Label ..... value" lines.
 */
export function Table({ head, children, empty, emptyText, emptyAction, loading }: TableProps) {
  return (
    <div className="md:overflow-hidden md:rounded-xl md:border md:border-slate-200/80">
      <div className="md:overflow-x-auto">
        <table className="w-full text-left text-sm max-md:block md:min-w-[720px]">
          <thead className="bg-slate-50 max-md:hidden">
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              {head.map((h, i) => (
                <th key={`${h}-${i}`} className="whitespace-nowrap px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={cn(
              "text-slate-700 [&>tr]:transition-colors",
              // desktop rows
              "md:divide-y md:divide-slate-100 md:[&_td]:px-4 md:[&_td]:py-3.5",
              // phone cards
              "max-md:flex max-md:flex-col max-md:gap-3",
              "max-md:[&>tr]:block max-md:[&>tr]:rounded-xl max-md:[&>tr]:border max-md:[&>tr]:border-slate-200 max-md:[&>tr]:bg-white max-md:[&>tr]:px-4 max-md:[&>tr]:py-2",
              "max-md:[&_td]:flex max-md:[&_td]:min-h-10 max-md:[&_td]:items-center max-md:[&_td]:justify-between max-md:[&_td]:gap-4 max-md:[&_td]:py-1.5 max-md:[&_td]:text-right",
              "max-md:[&_td]:before:shrink-0 max-md:[&_td]:before:text-left max-md:[&_td]:before:text-xs max-md:[&_td]:before:font-medium max-md:[&_td]:before:text-slate-500 max-md:[&_td]:before:content-[attr(data-label)]",
              "max-md:[&_td+td]:border-t max-md:[&_td+td]:border-slate-100",
            )}
          >
            {loading
              ? Array.from({ length: 4 }, (_, r) => (
                  <tr key={r}>
                    {head.map((h, c) => (
                      <td key={`${h}-${c}`} data-label={h}>
                        <div className="shimmer h-3.5 w-24 rounded md:w-auto" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : labelCells(children, head)}
          </tbody>
        </table>
      </div>
      {!loading && empty && <EmptyState text={emptyText} action={emptyAction} />}
    </div>
  );
}

export function IconButton({
  onClick,
  label,
  variant = "default",
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  variant?: "default" | "danger" | "info";
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white p-0 shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95",
        variant === "danger"
          ? "border-red-100 text-red-500 hover:border-red-200 hover:bg-red-50"
          : variant === "info"
            ? "border-blue-100 text-blue-600 hover:border-blue-200 hover:bg-blue-50"
            : "border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Small summary tile with a colored icon. */
export function StatTile({
  icon,
  tone,
  label,
  value,
  note,
  loading,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  note?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="flex items-start gap-4 transition-shadow hover:shadow-md">
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-12", tone)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {loading ? (
          <div className="shimmer mt-2 h-7 w-24 rounded" />
        ) : (
          <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        )}
        {note && !loading && <div className="mt-1 text-xs text-slate-500">{note}</div>}
      </div>
    </Card>
  );
}
