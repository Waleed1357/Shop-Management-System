"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem } from "@/lib/types";
import { cn, errorMessage, formatMoney } from "@/lib/utils";
import { Card, IconButton, PageHeader, Table } from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { PAGE_SIZE } from "@/components/ui/Pagination";
import { useToast } from "@/components/providers/ToastProvider";

type ItemForm = { name: string; category: string; sku: string; quantity: string; cost_price: string; min_stock: string };
type AddMode = "existing" | "new";
const EMPTY: ItemForm = { name: "", category: "", sku: "", quantity: "0", cost_price: "0", min_stock: "0" };
/** One line in "Add to existing": which item and how many came in. */
type StockRow = { itemId: string; quantity: string };

export default function InventoryManagement() {
  const toast = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY);
  const [addMode, setAddMode] = useState<AddMode>("new");
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [newRows, setNewRows] = useState<ItemForm[]>([EMPTY]);
  const [itemSearch, setItemSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("inventory_items").select("*").order("name");
    if (error) toast(errorMessage(error), "error");
    setItems((data as InventoryItem[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading remote data on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.name, i.category, i.sku].some((v) => v?.toLowerCase().includes(q)));
  }, [items, search]);

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

  function openForm(item: InventoryItem | null) {
    setEditing(item);
    setAddMode(items.length ? "existing" : "new");
    setStockRows([]);
    setNewRows([{ ...EMPTY }]);
    setItemSearch("");
    setForm(
      item
        ? {
            name: item.name,
            category: item.category ?? "",
            sku: item.sku ?? "",
            quantity: String(item.quantity),
            cost_price: String(item.cost_price),
            min_stock: String(item.min_stock),
          }
        : EMPTY,
    );
    setFormOpen(true);
  }

  const toPayload = (f: ItemForm) => ({
    name: f.name.trim(),
    category: f.category.trim() || null,
    sku: f.sku.trim() || null,
    quantity: Number(f.quantity),
    cost_price: Number(f.cost_price),
    min_stock: Number(f.min_stock),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = createClient();

    // ---- Add stock to one or more existing items ----
    if (!editing && addMode === "existing") {
      if (!stockRows.length) return toast("Pick at least one item from the list.", "error");
      if (stockRows.some((r) => !Number.isInteger(Number(r.quantity)) || Number(r.quantity) < 1)) {
        return toast("Every quantity must be a whole number of at least 1.", "error");
      }

      setSaving(true);
      const updated: InventoryItem[] = [];
      const failed: string[] = [];
      for (const row of stockRows) {
        const { data, error } = await supabase.rpc("add_inventory_stock", {
          p_item_id: row.itemId,
          p_quantity: Number(row.quantity),
        });
        if (error) failed.push(items.find((i) => i.id === row.itemId)?.name ?? "item");
        else updated.push(data as InventoryItem);
      }
      setSaving(false);

      setItems((current) => current.map((item) => updated.find((u) => u.id === item.id) ?? item));
      if (failed.length) {
        // Keep only the rows that failed so they can be retried.
        setStockRows((rows) => rows.filter((r) => !updated.some((u) => u.id === r.itemId)));
        toast(`Couldn't add stock to: ${failed.join(", ")}`, "error");
        return;
      }
      setFormOpen(false);
      toast(updated.length === 1 ? `Added ${stockRows[0].quantity} to ${updated[0].name}` : `Stock added to ${updated.length} items`);
      return;
    }

    setSaving(true);
    const { error } = editing
      ? await supabase.from("inventory_items").update(toPayload(form)).eq("id", editing.id)
      : // ---- Create one or more new items (saved together: all or nothing) ----
        await supabase.from("inventory_items").insert(newRows.map(toPayload));
    setSaving(false);
    if (error) return toast(errorMessage(error), "error");
    toast(editing ? "Item updated" : newRows.length === 1 ? "Item added" : `${newRows.length} items added`);
    setFormOpen(false);
    setVisibleCount(PAGE_SIZE);
    load();
  }

  const set = (key: keyof ItemForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  /** Adds an item to the "Add to existing" list (or removes it if it's already there). */
  function toggleStockRow(id: string) {
    setStockRows((rows) =>
      rows.some((r) => r.itemId === id) ? rows.filter((r) => r.itemId !== id) : [...rows, { itemId: id, quantity: "1" }],
    );
    setItemSearch("");
  }
  const setStockQty = (id: string, quantity: string) =>
    setStockRows((rows) => rows.map((r) => (r.itemId === id ? { ...r, quantity } : r)));
  const setNewField = (index: number, key: keyof ItemForm) => (e: { target: { value: string } }) =>
    setNewRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r)));

  const matchingItems = items.filter((item) =>
    [item.name, item.category, item.sku]
      .some((value) => value?.toLowerCase().includes(itemSearch.trim().toLowerCase())),
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Manage your parts and products in stock"
        action={
          <Button onClick={() => openForm(null)}>
            <Plus className="size-4" /> Add Item
          </Button>
        }
      />

      <Card>
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by item name, category or SKU..."
          className="mb-4"
        />
        <div
          ref={tableScrollRef}
          className="clients-table-scroll h-[min(60vh,600px)] overflow-auto rounded-xl border border-slate-100"
        >
          <Table loading={loading} head={["Item", "Category", "SKU", "Quantity", "Cost Price", "Actions"]} empty={!filtered.length}>
            {filtered.slice(0, visibleCount).map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-medium">{item.name}</td>
                <td className="px-3 py-3">{item.category || "-"}</td>
                <td className="px-3 py-3">{item.sku || "-"}</td>
                <td className="px-3 py-3 font-semibold">{item.quantity}</td>
                <td className="px-3 py-3">{formatMoney(item.cost_price)}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <IconButton label="Edit" onClick={() => openForm(item)}>
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
              aria-label="Loading more inventory items as you scroll"
            >
              {isLoadingMore && (
                <LoaderCircle
                  className="size-5 animate-spin text-red-600"
                  role="status"
                  aria-label="Loading more inventory items"
                />
              )}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Item" : addMode === "existing" ? "Add Stock" : "Add Items"}
        size={editing ? "lg" : "wide"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {!editing && items.length > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAddMode("existing")}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${addMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                Add to existing
              </button>
              <button
                type="button"
                onClick={() => setAddMode("new")}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${addMode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                Create new item
              </button>
            </div>
          )}
          {editing ? (
            <>
              <Field label="Item Name" required>
                <Input value={form.name} onChange={set("name")} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Input value={form.category} onChange={set("category")} placeholder="e.g. Backlight" />
                </Field>
                <Field label="SKU / Code">
                  <Input value={form.sku} onChange={set("sku")} placeholder="Optional" />
                </Field>
                <Field label="Quantity" required>
                  <Input type="number" min="0" value={form.quantity} onChange={set("quantity")} required />
                </Field>
                <Field label="Cost Price" required>
                  <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={set("cost_price")} required />
                </Field>
              </div>
            </>
          ) : addMode === "existing" ? (
            <>
              {/* 1. Pick items (tap again to remove) */}
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-slate-700">
                  Pick items <span className="font-normal text-slate-400">· tap to add or remove</span>
                </p>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 p-2">
                    <Input
                      autoFocus
                      value={itemSearch}
                      onChange={(event) => setItemSearch(event.target.value)}
                      onKeyDown={(event) => {
                        // Enter adds the first match instead of submitting the form
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const first = matchingItems.find((i) => !stockRows.some((r) => r.itemId === i.id));
                          if (first) toggleStockRow(first.id);
                        }
                      }}
                      placeholder="Search by name, category or SKU..."
                      aria-label="Search inventory items"
                    />
                  </div>
                  <div role="listbox" aria-multiselectable="true" aria-label="Inventory items" className="max-h-48 overflow-y-auto overscroll-contain p-1">
                    {matchingItems.length ? (
                      matchingItems.map((item) => {
                        const picked = stockRows.some((r) => r.itemId === item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={picked}
                            onClick={() => toggleStockRow(item.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-red-50",
                              picked ? "bg-red-50 text-red-700" : "text-slate-700",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-md border",
                                picked ? "border-red-600 bg-red-600 text-white" : "border-slate-300 bg-white",
                              )}
                            >
                              {picked && <Check className="size-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                            <span className="shrink-0 text-xs text-slate-500">Stock: {item.quantity}</span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-3 py-4 text-center text-sm text-slate-500">No matching inventory items.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Quantity for each picked item */}
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-slate-700">
                  Incoming quantity{" "}
                  {stockRows.length > 0 && (
                    <span className="text-slate-400">
                      · {stockRows.length} {stockRows.length === 1 ? "item" : "items"}
                    </span>
                  )}
                </p>
                {stockRows.length ? (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {stockRows.map((row) => {
                      const item = items.find((i) => i.id === row.itemId);
                      if (!item) return null;
                      const qty = Number(row.quantity);
                      return (
                        <div key={row.itemId} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                            <p className="whitespace-nowrap text-xs text-slate-500">
                              {item.quantity} →{" "}
                              <b className="text-slate-700">{item.quantity + (Number.isFinite(qty) && qty > 0 ? qty : 0)}</b> in stock
                            </p>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={row.quantity}
                            onChange={(event) => setStockQty(row.itemId, event.target.value)}
                            aria-label={"Quantity for " + item.name}
                            className="w-32 shrink-0 text-center"
                            required
                          />
                          <IconButton
                            label={"Remove " + item.name}
                            onClick={() => toggleStockRow(row.itemId)}
                            className="shrink-0 text-slate-400 hover:text-red-600"
                          >
                            <X className="size-4" />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                    Pick one or more items from the list above.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Create one or more new items */}
              <div className="space-y-3">
                {newRows.map((row, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Item {index + 1}</p>
                      {newRows.length > 1 && (
                        <IconButton
                          label={"Remove item " + (index + 1)}
                          onClick={() => setNewRows((rows) => rows.filter((_, i) => i !== index))}
                          className="-my-1 text-slate-400 hover:text-red-600"
                        >
                          <X className="size-4" />
                        </IconButton>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Item Name" required className="sm:col-span-2">
                        <Input
                          autoFocus={index === newRows.length - 1}
                          value={row.name}
                          onChange={setNewField(index, "name")}
                          required
                          placeholder='e.g. LED Backlight Strip 32"'
                        />
                      </Field>
                      <Field label="Category">
                        <Input value={row.category} onChange={setNewField(index, "category")} placeholder="e.g. Backlight" />
                      </Field>
                      <Field label="SKU / Code">
                        <Input value={row.sku} onChange={setNewField(index, "sku")} placeholder="Optional" />
                      </Field>
                      <Field label="Quantity" required>
                        <Input type="number" min="0" value={row.quantity} onChange={setNewField(index, "quantity")} required />
                      </Field>
                      <Field label="Cost Price" required>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.cost_price}
                          onChange={setNewField(index, "cost_price")}
                          required
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                className="w-full border-dashed"
                onClick={() => setNewRows((rows) => [...rows, { ...EMPTY, category: rows[rows.length - 1]?.category ?? "" }])}
              >
                <Plus className="size-4" /> Add another item
              </Button>
            </>
          )}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing
                ? "Update"
                : addMode === "existing"
                  ? stockRows.length > 1
                    ? "Add Stock (" + stockRows.length + " items)"
                    : "Add Stock"
                  : newRows.length > 1
                    ? "Save " + newRows.length + " Items"
                    : "Save Item"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
