"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, LoaderCircle, Pencil, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { downloadPurchasePdf, printPurchasePdf } from "@/lib/pdf";
import type { ShopPurchase } from "@/lib/types";
import { errorMessage, formatDate, formatMoney, formatWarranty, warrantyEndDate } from "@/lib/utils";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import { PAGE_SIZE } from "@/components/ui/Pagination";
import { useToast } from "@/components/providers/ToastProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import ShopPurchaseFormModal from "@/components/invoices/ShopPurchaseFormModal";

export default function ShopPurchasesList() {
  const toast = useToast();
  const { settings } = useSettings();
  const branding = { businessName: settings.business_name, logoUrl: settings.logo_url };
  const [purchases, setPurchases] = useState<ShopPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [editing, setEditing] = useState<ShopPurchase | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await createClient()
      .from("shop_purchases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      const message = errorMessage(error);
      setLoadError(message);
      toast(message, "error");
    } else {
      setPurchases((data as ShopPurchase[]) ?? []);
      setLoadError("");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load purchases on mount
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    window.addEventListener("shop-purchase-saved", loadPurchases);
    return () => window.removeEventListener("shop-purchase-saved", loadPurchases);
  }, [loadPurchases]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return purchases;
    return purchases.filter((purchase) =>
      [purchase.customer_name, purchase.phone, purchase.address, purchase.product]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [purchases, search]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filtered.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startLoadingMore(() => {
            setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length));
          });
        }
      },
      { root: tableScrollRef.current, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount, startLoadingMore]);

  return (
    <>
      <PageHeader title="All Purchases" subtitle={`${purchases.length} shop purchases`} />
      <Card>
        <SearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by customer, phone, product or address..."
          className="mb-4"
        />
        <div
          ref={tableScrollRef}
          className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100"
        >
          <Table
            loading={loading}
            head={["Customer", "Phone", "Address", "Product", "Amount", "Purchase Date", "Warranty", "Actions"]}
            empty={!filtered.length}
            emptyText={loadError
              ? `Could not load purchases: ${loadError}`
              : search
                ? "No purchases match your search."
                : "No shop purchases have been recorded yet."}
          >
            {filtered.slice(0, visibleCount).map((purchase) => (
              <tr key={purchase.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">{purchase.customer_name}</td>
                <td className="px-3 py-3">{purchase.phone}</td>
                <td className="px-3 py-3">{purchase.address}</td>
                <td className="px-3 py-3">{purchase.product}</td>
                <td className="px-3 py-3 font-medium">{formatMoney(purchase.amount)}</td>
                <td className="px-3 py-3">{formatDate(purchase.purchase_date)}</td>
                <td className="px-3 py-3">
                  {formatWarranty(purchase.warranty_value, purchase.warranty_unit) ? (
                    <>
                      <p className="font-medium">{formatWarranty(purchase.warranty_value, purchase.warranty_unit)}</p>
                      <p className="text-xs text-slate-500">
                        until {formatDate(warrantyEndDate(purchase.purchase_date, purchase.warranty_value, purchase.warranty_unit))}
                      </p>
                    </>
                  ) : (
                    <span className="text-slate-400">No warranty</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton
                      label="Print receipt"
                      variant="info"
                      onClick={() =>
                        printPurchasePdf(purchase, branding).catch((error: unknown) => toast(errorMessage(error), "error"))
                      }
                    >
                      <Printer className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Download PDF"
                      variant="info"
                      onClick={() =>
                        downloadPurchasePdf(purchase, branding).catch((error: unknown) => toast(errorMessage(error), "error"))
                      }
                    >
                      <Download className="size-4" />
                    </IconButton>
                    <IconButton label="Edit purchase" onClick={() => setEditing(purchase)}>
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!loading && visibleCount < filtered.length && (
            <div
              ref={loadMoreRef}
              className="flex h-10 items-center justify-center"
              aria-label="Loading more purchases as you scroll"
            >
              {isLoadingMore && (
                <LoaderCircle
                  className="size-5 animate-spin text-red-600"
                  role="status"
                  aria-label="Loading more purchases"
                />
              )}
            </div>
          )}
        </div>
      </Card>
      <ShopPurchaseFormModal
        open={Boolean(editing)}
        purchase={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </>
  );
}
