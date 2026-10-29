"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem, ShopPurchase, WarrantyUnit } from "@/lib/types";
import { errorMessage, formatDate, formatWarranty, todayISO, warrantyEndDate } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import SearchSelect, { type SearchOption } from "@/components/ui/SearchSelect";
import { useToast } from "@/components/providers/ToastProvider";

type InventoryOption = Pick<InventoryItem, "id" | "name" | "category" | "quantity">;

interface ShopPurchaseFormModalProps {
  open: boolean;
  purchase?: ShopPurchase | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ShopPurchaseFormModal({ open, purchase = null, onClose, onSaved }: ShopPurchaseFormModalProps) {
  const toast = useToast();
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [warrantyValue, setWarrantyValue] = useState("");
  const [warrantyUnit, setWarrantyUnit] = useState<WarrantyUnit>("months");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset the purchase form on open */
    setCustomerName(purchase?.customer_name ?? "");
    setPhone(purchase?.phone ?? "");
    setAddress(purchase?.address ?? "");
    setProduct(purchase?.product ?? "");
    setAmount(purchase ? String(purchase.amount) : "");
    setDate(purchase?.purchase_date ?? todayISO());
    setWarrantyValue(purchase?.warranty_value ? String(purchase.warranty_value) : "");
    setWarrantyUnit(purchase?.warranty_unit ?? "months");
    /* eslint-enable react-hooks/set-state-in-effect */
    createClient()
      .from("inventory_items")
      .select("id, name, category, quantity")
      .order("name")
      .then(({ data, error }) => {
        if (error) toast(errorMessage(error), "error");
        else setInventory((data as InventoryOption[]) ?? []);
      });
  }, [open, purchase, toast]);

  // Inventory items for the Product dropdown. The product is saved by name.
  const productOptions = useMemo<SearchOption[]>(() => {
    const list: SearchOption[] = inventory.map((i) => ({
      id: i.name,
      label: i.name,
      sublabel: `${i.category ? `${i.category} · ` : ""}${i.quantity} in stock`,
    }));
    // Older purchase whose product isn't in inventory: keep showing it.
    if (product && !inventory.some((i) => i.name === product)) {
      list.unshift({ id: product, label: product, sublabel: "Not in inventory" });
    }
    return list;
  }, [inventory, product]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product.trim()) {
      toast("Select a product from the list.", "error");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      toast("Enter a valid purchase amount.", "error");
      return;
    }

    const warranty = warrantyValue.trim() ? Number(warrantyValue) : null;
    if (warranty !== null && (!Number.isInteger(warranty) || warranty < 1)) {
      toast("Warranty must be a whole number (1 or more), or leave it empty.", "error");
      return;
    }

    setSaving(true);
    const payload = {
      customer_name: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      product: product.trim(),
      amount: numericAmount,
      purchase_date: date,
      warranty_value: warranty,
      warranty_unit: warranty ? warrantyUnit : null,
    };
    const query = createClient().from("shop_purchases");
    const { error } = purchase
      ? await query.update(payload).eq("id", purchase.id)
      : await query.insert(payload);
    setSaving(false);

    if (error) {
      toast(errorMessage(error), "error");
      return;
    }

    toast(purchase ? "Shop purchase updated" : "Shop purchase recorded");
    window.dispatchEvent(new Event("shop-purchase-saved"));
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={purchase ? "Edit Shop Purchase" : "Record Shop Purchase"} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" required>
            <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          </Field>
          <Field label="Phone" required>
            <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </Field>
        </div>
        <Field label="Address" required>
          <Input value={address} onChange={(event) => setAddress(event.target.value)} required />
        </Field>
        <SearchSelect
          label="Product"
          required
          options={productOptions}
          value={product}
          onChange={setProduct}
          placeholder="Select a product from inventory"
          searchPlaceholder="Search product or category..."
          emptyText={inventory.length ? "No product matches your search." : "No items in inventory yet."}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" />
          </Field>
          <Field label="Purchase date" required>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </Field>
        </div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
            <Field label="Warranty">
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={warrantyValue}
                onChange={(event) => setWarrantyValue(event.target.value)}
                placeholder="e.g. 6 (optional)"
              />
            </Field>
            <Field label="Period">
              <Select value={warrantyUnit} onChange={(event) => setWarrantyUnit(event.target.value as WarrantyUnit)} aria-label="Warranty period">
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            {formatWarranty(Number(warrantyValue) || null, warrantyUnit)
              ? `${formatWarranty(Number(warrantyValue), warrantyUnit)} warranty · valid until ${formatDate(warrantyEndDate(date, Number(warrantyValue), warrantyUnit))}`
              : "Leave empty if there is no warranty."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{purchase ? "Update Purchase" : "Save Purchase"}</Button>
        </div>
      </form>
    </Modal>
  );
}
