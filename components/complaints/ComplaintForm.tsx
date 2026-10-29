"use client";

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { CalendarDays, Hash, Plus, Tv, UserCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Complaint, ComplaintInput, Technician } from "@/lib/types";
import { errorMessage, formatMoney, todayISO } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/Card";
import { loadCustomerAccount, phoneKey, type CustomerAccount } from "@/lib/customer-account";
import { useToast } from "@/components/providers/ToastProvider";

/** Another LED brought by the same customer. These are kept together in one complaint record. */
type ExtraLed = { key: number; led_model: string; serial_number: string; defect: string; accessories: string; condition: string };
const emptyLed = (key: number): ExtraLed => ({ key, led_model: "", serial_number: "", defect: "", accessories: "", condition: "" });

const EMPTY: ComplaintInput = {
  complaint_no: "",
  client_name: "",
  led_model: "",
  serial_number: "",
  phone: "",
  address: "",
  technician: "",
  technician_phone: "",
  defect: "",
  accessories: "",
  condition: "",
  notes: "",
  status: "pending",
  complaint_date: "",
};

interface ComplaintFormProps {
  /** Pass a complaint to edit it; leave empty to create a new one. */
  complaint?: Complaint;
  /** Gets the complaint(s) saved. Multiple LEDs are kept in one complaint record. */
  onSaved?: (complaints: Complaint[]) => void;
  onCancel?: () => void;
  /** Hide the Notes field (used in the modal). Existing notes are kept when editing. */
  hideNotes?: boolean;
}

/**
 * Pressing Enter moves to the next field instead of submitting.
 * Skips read-only fields and helper buttons; on the last field it moves to the Save button.
 * Shift+Enter still adds a new line in the address box.
 */
function moveToNextField(e: KeyboardEvent<HTMLFormElement>) {
  const target = e.target as HTMLElement;
  if (e.key !== "Enter" || e.shiftKey || target.tagName === "BUTTON" || target.tagName === "SELECT") return;
  if (!target.hasAttribute("data-enter-field")) return;
  e.preventDefault();
  const fields = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("[data-enter-field], button[type='submit']"),
  ).filter((el) => !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly);
  const next = fields[fields.indexOf(target) + 1];
  next?.focus();
}

export default function ComplaintForm({ complaint, onSaved, onCancel, hideNotes }: ComplaintFormProps) {
  const toast = useToast();
  const isEdit = Boolean(complaint);
  const [form, setForm] = useState<ComplaintInput>(() => (complaint ? { ...EMPTY, ...complaint } : EMPTY));
  const [saving, setSaving] = useState(false);
  const [extraLeds, setExtraLeds] = useState<ExtraLed[]>([]);
  const [advance, setAdvance] = useState(() => (complaint?.advance_amount ? String(complaint.advance_amount) : ""));
  const [nextLedKey, setNextLedKey] = useState(1);
  const [technicians, setTechnicians] = useState<Pick<Technician, "id" | "name" | "phone">[]>([]);
  /** Rough preview of the next complaint number (the database gives the real one on save). */
  const [nextNo, setNextNo] = useState<number | null>(null);
  /** Earlier visits of the customer with this phone number (new complaints only). */
  const [returning, setReturning] = useState<CustomerAccount | null>(null);

  const setLed = (key: number, field: keyof Omit<ExtraLed, "key">) => (e: { target: { value: string } }) =>
    setExtraLeds((leds) => leds.map((led) => (led.key === key ? { ...led, [field]: e.target.value } : led)));

  function addLed() {
    setExtraLeds((leds) => [...leds, emptyLed(nextLedKey)]);
    setNextLedKey((k) => k + 1);
  }

  const loadNextNo = useCallback(async () => {
    const { data } = await createClient()
      .from("complaints")
      .select("complaint_no")
      .order("created_at", { ascending: false })
      .limit(200);
    const numbers = (data ?? []).map((c) => c.complaint_no as string).filter((no) => /^\d+$/.test(no)).map(Number);
    setNextNo(Math.max(93600, ...numbers.map((n) => n + 1)));
  }, []);

  useEffect(() => {
    // The date is set on the client so it uses the user's current day.
    if (!complaint) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- needs the browser clock
      setForm((f) => ({ ...f, complaint_date: todayISO() }));
      loadNextNo();
    }
    createClient()
      .from("technicians")
      .select("id, name, phone")
      .order("name")
      .then(({ data }) => setTechnicians(data ?? []));
  }, [complaint, loadNextNo]);

  // Look up the phone number: a returning customer shows their LEDs and any money still due.
  const phoneLookup = isEdit ? "" : phoneKey(form.phone);
  useEffect(() => {
    if (phoneLookup.length < 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when the number is incomplete
      setReturning(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      loadCustomerAccount(phoneLookup)
        .then((account) => {
          if (cancelled) return;
          setReturning(account);
          // Fill in the name and address from the last visit if they're still empty.
          if (account) {
            const last = account.leds[account.leds.length - 1]?.complaint;
            setForm((f) => ({
              ...f,
              client_name: f.client_name || account.name,
              address: f.address || last?.address || "",
            }));
          }
        })
        .catch(() => !cancelled && setReturning(null));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phoneLookup]);

  const set = (key: keyof ComplaintInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  /** Typing a saved technician's name fills in their phone number. */
  function onTechnicianChange(e: { target: { value: string } }) {
    const name = e.target.value;
    const match = technicians.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
    setForm((f) => ({
      ...f,
      technician: name,
      technician_phone: match?.phone && !f.technician_phone ? match.phone : f.technician_phone,
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const advanceAmount = Number(advance || 0);
    if (!Number.isFinite(advanceAmount) || advanceAmount < 0) {
      toast("Enter a valid advance amount", "error");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    // The complaint number is given by the database (93600, 93601, ...), so it isn't sent for new complaints.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out on purpose
    const { complaint_no: _no, ...fields } = form;
    const payload = {
      ...fields,
      client_name: form.client_name.trim(),
      phone: form.phone.trim(),
      technician: form.technician?.trim() || null,
      technician_phone: form.technician_phone?.trim() || null,
      defect: form.defect || null,
      accessories: form.accessories?.trim() || null,
      condition: form.condition?.trim() || null,
      notes: form.notes || null,
      advance_amount: advanceAmount,
    };

    if (isEdit) {
      const { data, error } = await supabase.from("complaints").update(payload).eq("id", complaint!.id).select().single();
      setSaving(false);
      if (error) {
        toast(errorMessage(error), "error");
        return;
      }
      toast("Complaint updated");
      onSaved?.([data as Complaint]);
      return;
    }

    const allLeds = [
      { led_model: form.led_model.trim(), serial_number: form.serial_number.trim(), defect: form.defect?.trim() || "", accessories: form.accessories?.trim() || "", condition: form.condition?.trim() || "" },
      ...extraLeds.map((led) => ({
        led_model: led.led_model.trim(),
        serial_number: led.serial_number.trim(),
        defect: led.defect.trim(),
        accessories: led.accessories.trim(),
        condition: led.condition.trim(),
      })),
    ].filter((led) => led.led_model || led.serial_number || led.defect || led.accessories || led.condition);

    const row = {
      ...payload,
      led_model: allLeds.map((led) => led.led_model).filter(Boolean).join(" / ") || payload.led_model,
      serial_number: allLeds.map((led) => led.serial_number).filter(Boolean).join(" / ") || payload.serial_number,
      defect: allLeds.map((led) => led.defect).filter(Boolean).join(" | ") || null,
      accessories: allLeds.map((led) => led.accessories).filter(Boolean).join(" / ") || null,
      condition: allLeds.map((led) => led.condition).filter(Boolean).join(" / ") || null,
    };

    const { data, error } = await supabase.from("complaints").insert([row]).select();
    setSaving(false);

    if (error) {
      toast(errorMessage(error), "error");
      return;
    }

    const saved = (data as Complaint[]) ?? [];
    toast(saved[0] ? `Complaint ${saved[0].complaint_no} saved` : "Complaint saved");
    setForm({ ...EMPTY, complaint_date: todayISO() });
    setReturning(null);
    loadNextNo();
    setExtraLeds([]);
    setAdvance("");
    // For a new complaint, the SMS to the client is sent next (see ComplaintModalProvider).
    onSaved?.(saved);
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={moveToNextField} className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Technician Name">
            <Input
              data-enter-field
              list="complaint-technicians"
              autoComplete="off"
              value={form.technician ?? ""}
              onChange={onTechnicianChange}
              placeholder="Enter technician name"
            />
          </Field>
          <Field label="Technician Phone">
            <Input data-enter-field type="tel" value={form.technician_phone ?? ""} onChange={set("technician_phone")} placeholder="03xx-xxxxxxx" />
          </Field>
        </div>
        <datalist id="complaint-technicians">
          {technicians.map((t) => (
            <option key={t.id} value={t.name}>{t.phone ?? ""}</option>
          ))}
        </datalist>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client Name" required>
            <Input data-enter-field value={form.client_name} onChange={set("client_name")} required placeholder="Enter client name" />
          </Field>
          <Field label="Phone Number" required>
            <Input data-enter-field type="tel" value={form.phone} onChange={set("phone")} required placeholder="03xx-xxxxxxx" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product Defect">
            <Input data-enter-field value={form.defect ?? ""} onChange={set("defect")} placeholder="Enter product defect" />
          </Field>
          <Field label="Accessories Taken">
            <Input data-enter-field value={form.accessories ?? ""} onChange={set("accessories")} placeholder="e.g. remote, stand, power cable" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="LED Model" required>
            <Input data-enter-field value={form.led_model} onChange={set("led_model")} required placeholder='e.g. Samsung 43"' />
          </Field>
          <Field label="Serial Number" required>
            <Input data-enter-field value={form.serial_number} onChange={set("serial_number")} required placeholder="Enter serial number" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Condition">
            <Input data-enter-field value={form.condition ?? ""} onChange={set("condition")} placeholder="e.g. Screen scratched, no stand" />
          </Field>
          <div />
        </div>
        {returning && (
          <div className={returning.totals.due > 0
            ? "rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
            : "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <UserCheck className="size-4" /> Returning customer: {returning.name}
            </p>
            <p className="mt-1">
              {returning.leds.length} earlier LED{returning.leds.length === 1 ? "" : "s"} over {returning.totals.visits} visit{returning.totals.visits === 1 ? "" : "s"}
              {" · "}Paid {formatMoney(returning.totals.paid)}
              {returning.totals.due > 0
                ? <> · <b>Still due {formatMoney(returning.totals.due)}</b></>
                : " · Nothing due"}
            </p>
            {returning.leds.filter((l) => l.due > 0).map((l) => (
              <p key={l.complaint.id} className="mt-0.5">
                {l.complaint.complaint_no} · {l.complaint.led_model}: {formatMoney(l.due)} due
              </p>
            ))}
            {returning.totals.due > 0 && (
              <p className="mt-1 text-amber-800">Take old payments from the Complaints page → history button on any of their complaints.</p>
            )}
          </div>
        )}
        <Field label="Address" required>
          <Textarea data-enter-field value={form.address} onChange={set("address")} required placeholder="Enter address" className="min-h-20" />
        </Field>

        {!isEdit && (
          <section className="space-y-3 border-t border-slate-100 pt-4">
            {extraLeds.map((led, index) => (
              <div key={led.key} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Tv className="size-4 text-red-600" /> LED {index + 2}
                  </p>
                  <IconButton
                    label={`Remove LED ${index + 2}`}
                    onClick={() => setExtraLeds((leds) => leds.filter((l) => l.key !== led.key))}
                    className="-my-1 text-slate-400 hover:text-red-600"
                  >
                    <X className="size-4" />
                  </IconButton>
                </div>
                <Field label="LED Model" required>
                  <Input data-enter-field autoFocus value={led.led_model} onChange={setLed(led.key, "led_model")} required placeholder='e.g. Samsung 43"' />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Serial Number" required>
                    <Input data-enter-field value={led.serial_number} onChange={setLed(led.key, "serial_number")} required placeholder="Enter serial number" />
                  </Field>
                  <Field label="Product Defect">
                    <Input data-enter-field value={led.defect} onChange={setLed(led.key, "defect")} placeholder="Enter product defect" />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Accessories Taken">
                    <Input data-enter-field value={led.accessories} onChange={setLed(led.key, "accessories")} placeholder="e.g. remote, stand, power cable" />
                  </Field>
                  <Field label="Condition">
                    <Input data-enter-field value={led.condition} onChange={setLed(led.key, "condition")} placeholder="e.g. Screen scratched, no stand" />
                  </Field>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addLed} className="w-full">
              <Plus className="size-4" /> Add another LED
            </Button>
            {extraLeds.length > 0 && (
              <p className="text-xs text-slate-500">
                Multiple LEDs are kept together in one complaint record for this customer.
              </p>
            )}
          </section>
        )}

      </div>

      <div className="flex flex-col gap-4">
        <Field label="Complaint No.">
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              readOnly
              className="pl-9 font-mono"
              value={isEdit ? form.complaint_no : nextNo ? String(nextNo) : "..."}
              title={isEdit ? undefined : "Given automatically when you save"}
            />
          </div>
          {!isEdit && (
            <span className="block text-xs text-slate-500">
              Given automatically when you save{extraLeds.length ? " as one complaint record" : ""}.
            </span>
          )}
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set("status")}>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </Select>
        </Field>
        <Field label="Advance paid (Optional)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
            placeholder="0"
          />
          {Number(advance) > 0 && (
            <span className="block text-xs text-emerald-700">
              Customer paid {formatMoney(advance)} in advance{extraLeds.length ? " (saved on the first LED's complaint)" : ""}.
            </span>
          )}
        </Field>
        <Field label="Date">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="date"
              value={form.complaint_date}
              onChange={set("complaint_date")}
              readOnly={!isEdit}
              className="pl-9"
              title={isEdit ? undefined : "Set automatically to today"}
            />
          </div>
        </Field>
        {!hideNotes && (
          <Field label="Notes (Optional)" className="flex flex-1 flex-col [&>textarea]:flex-1">
            <Textarea value={form.notes ?? ""} onChange={set("notes")} placeholder="Enter any additional notes..." />
          </Field>
        )}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel ?? (() => {
            setForm({ ...EMPTY, complaint_date: todayISO() });
            setExtraLeds([]);
            setAdvance("");
          })}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "Update" : extraLeds.length ? "Save Complaint" : "Save Complaint"}
          </Button>
        </div>
      </div>
    </form>
  );
}
