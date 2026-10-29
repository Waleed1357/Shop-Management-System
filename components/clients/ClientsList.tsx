
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Download,
  Eye,
  FileDown,
  History,
  ListFilter,
  LoaderCircle,
  Pencil,
  Phone,
  Printer,
  Search,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { Complaint, ComplaintStatus } from "@/lib/types";
import { downloadComplaintPdf, downloadTablePdf, printComplaintPdf } from "@/lib/pdf";
import { cn, errorMessage, formatDate, formatMoney } from "@/lib/utils";

import { IconButton, PageHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import DetailsModal from "@/components/ui/DetailsModal";
import ExportRangeModal, { inExportRange, type ExportRange } from "@/components/ui/ExportRangeModal";
import Badge from "@/components/ui/Badge";
import CustomerAccountModal from "@/components/customers/CustomerAccountModal";
import { PAGE_SIZE } from "@/components/ui/Pagination";

import { badgeLabels } from "@/components/ui/Badge";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  useComplaintModal,
  useComplaintSaved,
} from "@/components/providers/ComplaintModalProvider";

const STATUSES: ComplaintStatus[] = [
  "pending",
  "in_progress",
  "resolved",
];

type Filter = "all" | ComplaintStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

const STATUS_STYLES: Record<ComplaintStatus, string> = {
  pending: "bg-amber-50 text-amber-600",
  in_progress: "bg-blue-50 text-blue-600",
  resolved: "bg-emerald-50 text-emerald-600",
};

function StatusSelect({
  status,
  onChange,
}: {
  status: ComplaintStatus;
  onChange: (status: ComplaintStatus) => void;
}) {
  // Coloured pill button + the app's shared dropdown list
  return (
    <Dropdown
      variant="custom"
      aria-label={`Change complaint status, currently ${badgeLabels[status]}`}
      options={STATUSES.map((item) => ({ id: item, label: badgeLabels[item] }))}
      value={status}
      onChange={(next) => onChange(next as ComplaintStatus)}
      triggerClassName={cn(
        "min-w-[126px] rounded-full px-3 py-2 text-[11px] font-semibold transition-shadow hover:shadow-sm",
        STATUS_STYLES[status],
      )}
      renderValue={(option) => <span className="flex-1 whitespace-nowrap">{option?.label}</span>}
      renderOption={(option) => (
        <span className={cn("inline-block rounded-full px-2 py-1 text-[11px] font-semibold", STATUS_STYLES[option.id as ComplaintStatus])}>
          {option.label}
        </span>
      )}
    />
  );
}

export default function ClientsList() {
  const toast = useToast();
  const { settings } = useSettings();
  const openComplaint = useComplaintModal();

  const branding = {
    businessName: settings.business_name,
    logoUrl: settings.logo_url,
  };

  const [rows, setRows] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewing, setViewing] = useState<Complaint | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyPhone, setHistoryPhone] = useState<string | null>(null);
  const [technicianFilter, setTechnicianFilter] = useState("all");

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("complaints")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast(errorMessage(error), "error");
    }

    setRows((data as Complaint[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  useComplaintSaved((saved) => {
    setRows((previous) =>
      previous.some((item) => item.id === saved.id)
        ? previous.map((item) =>
            item.id === saved.id ? saved : item,
          )
        : [saved, ...previous],
    );
  });

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: rows.length,
      pending: 0,
      in_progress: 0,
      resolved: 0,
    };

    rows.forEach((row) => {
      if (row.status in result) {
        result[row.status]++;
      }
    });

    return result;
  }, [rows]);

  const technicians = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.technician)
          .filter((name): name is string => Boolean(name)),
      ),
    ).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");

    return rows.filter((row) => {
      const matchesStatus =
        filter === "all" || row.status === filter;

      const matchesTechnician =
        technicianFilter === "all" ||
        row.technician === technicianFilter;

      const matchesSearch =
        !query ||
        row.complaint_no.toLowerCase().includes(query) ||
        row.client_name.toLowerCase().includes(query) ||
        row.led_model.toLowerCase().includes(query) ||
        row.serial_number.toLowerCase().includes(query) ||
        (digits.length > 0 &&
          row.phone.replace(/\D/g, "").includes(digits));

      return (
        matchesStatus &&
        matchesTechnician &&
        matchesSearch
      );
    });
  }, [rows, search, filter, technicianFilter]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filtered.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startLoadingMore(() => {
            setVisibleCount((count) =>
              Math.min(count + PAGE_SIZE, filtered.length),
            );
          });
        }
      },
      { root: tableScrollRef.current, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount, startLoadingMore]);

  async function changeStatus(
    row: Complaint,
    status: ComplaintStatus,
  ) {
    const previousStatus = row.status;

    setRows((previous) =>
      previous.map((item) =>
        item.id === row.id ? { ...item, status } : item,
      ),
    );

    const { error } = await createClient()
      .from("complaints")
      .update({ status })
      .eq("id", row.id);

    if (error) {
      setRows((previous) =>
        previous.map((item) =>
          item.id === row.id
            ? { ...item, status: previousStatus }
            : item,
        ),
      );

      toast(errorMessage(error), "error");
      return;
    }

    toast(`${row.complaint_no} marked ${badgeLabels[status]}`);
  }

  function exportAll(range: ExportRange) {
    const rows = filtered.filter((row) => inExportRange(row.complaint_date, range));
    if (!rows.length) {
      toast("No complaints in that period.", "error");
      return;
    }
    downloadTablePdf(
      "All Clients",
      [
        "Complaint No.",
        "Client Name",
        "Model",
        "Serial No.",
        "Phone",
        "Address",
        "Date",
        "Status",
        "Technician",
      ],
      rows.map((row) => [
        row.complaint_no,
        row.client_name,
        row.led_model,
        row.serial_number,
        row.phone,
        row.address,
        formatDate(row.complaint_date),
        badgeLabels[row.status],
        row.technician ?? "-",
      ]),
      branding,
      range.label,
    );
  }

  return (
    <>
      <PageHeader
        title="Complaints"
        subtitle="Every complaint you have received. Search, update status, edit or download."
        action={
          <>
            <Button
              variant="secondary"
              onClick={() => setExportOpen(true)}
              disabled={!filtered.length}
            >
              <FileDown className="size-4" />
              Export PDF
            </Button>
          </>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        {/* Filters and search */}
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {FILTERS.map((item) => {
              const active = filter === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setFilter(item.key);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200",
                    active
                      ? "bg-[#142454] text-white shadow-md shadow-blue-950/15"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                  )}
                >
                  {item.label}

                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px]",
                      active
                        ? "bg-white text-[#142454]"
                        : "bg-slate-200/70 text-slate-600",
                    )}
                  >
                    {counts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-2 xl:w-auto">
            <div className="relative w-full xl:w-[400px]">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Search by complaint no., client name, phone or model..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />

              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              aria-label="Toggle advanced filters"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm transition",
                showFilters
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <ListFilter className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Advanced filters */}
        {showFilters && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <span className="text-xs font-semibold text-slate-600">
              Technician
            </span>

            <Dropdown
              variant="compact"
              aria-label="Filter by technician"
              options={[{ id: "all", label: "All Technicians" }, ...technicians.map((name) => ({ id: name, label: name }))]}
              value={technicianFilter}
              onChange={(next) => {
                setTechnicianFilter(next);
                setVisibleCount(PAGE_SIZE);
              }}
            />

            <button
              type="button"
              onClick={() => {
                setTechnicianFilter("all");
                setFilter("all");
                setSearch("");
                setVisibleCount(PAGE_SIZE);
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Table */}
        <div
          ref={tableScrollRef}
          className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100"
        >
          <table className="w-full min-w-[1020px] border-collapse text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F6F8FC] text-[11px] font-semibold text-slate-500">
                <th className="px-4 py-4">#</th>
                <th className="px-4 py-4">Client</th>
                <th className="px-4 py-4">Model</th>
                <th className="px-4 py-4">Date</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Technician</th>
                <th className="px-4 py-4 text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                // Shimmer rows while complaints load
                Array.from({ length: 6 }, (_, row) => (
                  <tr key={row} aria-hidden="true">
                    <td className="px-4 py-4"><div className="shimmer h-6 w-20 rounded-lg" /></td>
                    <td className="px-4 py-4">
                      <div className="shimmer h-3.5 w-32 rounded" />
                      <div className="shimmer mt-2 h-3 w-24 rounded" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="shimmer h-3.5 w-28 rounded" />
                      <div className="shimmer mt-2 h-3 w-20 rounded" />
                    </td>
                    <td className="px-4 py-4"><div className="shimmer h-3.5 w-20 rounded" /></td>
                    <td className="px-4 py-4"><div className="shimmer h-8 w-28 rounded-full" /></td>
                    <td className="px-4 py-4"><div className="shimmer h-3.5 w-24 rounded" /></td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="shimmer size-8 rounded-lg" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <Search className="h-5 w-5 text-slate-400" />
                      </div>

                      <p className="text-sm font-semibold text-slate-800">
                        No complaints found
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {search || filter !== "all" || technicianFilter !== "all"
                          ? "Try adjusting your search or filters."
                          : "No complaints have been added yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.slice(0, visibleCount).map((row) => (
                  <tr
                    key={row.id}
                    className="group transition-colors duration-150 hover:bg-[#F8FAFF]"
                  >
                    {/* Complaint number */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex rounded-lg bg-[#EAF2FF] px-2.5 py-1.5 font-mono text-xs font-bold text-[#1550A2]">
                        {row.complaint_no}
                      </span>
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-xs font-semibold text-[#17264B]">
                          {row.client_name}
                        </p>

                        <a
                          href={`tel:${row.phone}`}
                          className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-500 hover:text-blue-600"
                        >
                          <Phone className="h-3 w-3" />
                          {row.phone}
                        </a>
                      </div>
                    </td>

                    {/* Model */}
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap text-xs font-medium text-[#17264B]">
                        {row.led_model}
                      </p>

                      <p className="mt-1 whitespace-nowrap text-[11px] text-slate-400">
                        S/N {row.serial_number}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(row.complaint_date)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusSelect
                        status={row.status}
                        onChange={(status) =>
                          changeStatus(row, status)
                        }
                      />
                    </td>

                    {/* Technician */}
                    <td className="px-4 py-3">
                      {row.technician ? (
                        <span className="whitespace-nowrap text-xs font-medium text-[#17264B]">
                          {row.technician}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Not assigned
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton label="View complaint" onClick={() => setViewing(row)}>
                          <Eye className="size-4" />
                        </IconButton>

                        <IconButton label="Customer history & payments" variant="info" onClick={() => setHistoryPhone(row.phone)}>
                          <History className="size-4" />
                        </IconButton>

                        <IconButton
                          label="Print complaint"
                          variant="info"
                          onClick={() =>
                            printComplaintPdf(row, branding).catch((error: unknown) =>
                              toast(errorMessage(error), "error"),
                            )
                          }
                        >
                          <Printer className="size-4" />
                        </IconButton>

                        <IconButton
                          label="Download PDF"
                          variant="info"
                          onClick={() =>
                            downloadComplaintPdf(row, branding)
                          }
                        >
                          <Download className="size-4" />
                        </IconButton>

                        <IconButton
                          label="Edit Complaint"
                          onClick={() => openComplaint(row)}
                        >
                          <Pencil className="size-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && visibleCount < filtered.length && (
            <div
              ref={loadMoreRef}
              className="flex h-10 items-center justify-center"
              aria-label="Loading more complaints as you scroll"
            >
              {isLoadingMore && (
                <LoaderCircle
                  className="size-5 animate-spin text-red-600"
                  role="status"
                  aria-label="Loading more complaints"
                />
              )}
            </div>
          )}
        </div>

      </div>

      <CustomerAccountModal phone={historyPhone} onClose={() => setHistoryPhone(null)} />

      <ExportRangeModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={exportAll} title="Export complaints" />

      <DetailsModal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `Complaint ${viewing.complaint_no}` : "Complaint"}
        subtitle={viewing?.client_name}
        rows={viewing ? [
          { label: "Complaint No.", value: viewing.complaint_no },
          { label: "Status", value: <Badge status={viewing.status} /> },
          { label: "Client Name", value: viewing.client_name },
          { label: "Phone Number", value: viewing.phone },
          { label: "LED Model", value: viewing.led_model },
          { label: "Serial Number", value: viewing.serial_number },
          { label: "Product Defect", value: viewing.defect },
          { label: "Condition", value: viewing.condition },
          { label: "Technician", value: viewing.technician || "Not assigned" },
          { label: "Technician Phone", value: viewing.technician_phone },
          { label: "Date", value: formatDate(viewing.complaint_date) },
          { label: "Advance paid", value: Number(viewing.advance_amount) > 0 ? formatMoney(viewing.advance_amount) : "None" },
          { label: "SMS", value: viewing.sms_status === "sent" ? "Sent" : viewing.sms_status === "failed" ? "Failed" : "Not sent" },
          { label: "Address", value: viewing.address, wide: true },
          { label: "Notes", value: viewing.notes, wide: true },
        ] : []}
      />
    </>
  );
}
