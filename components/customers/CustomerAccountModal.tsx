"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Clock, History, LoaderCircle, Receipt, Wallet } from "lucide-react";
import {
  loadCustomerAccount,
  recordCustomerPayment,
  type AccountLed,
  type CustomerAccount,
} from "@/lib/customer-account";
import { cn, errorMessage, formatDate, formatMoney, todayISO } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Everything about one customer (matched by phone): every LED they brought, what each was billed,
 * every payment over all visits, and what is still due. Payments can be taken here.
 */
export default function CustomerAccountModal({ phone, onClose }: { phone: string | null; onClose: () => void }) {
  const toast = useToast();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [bulkAmount, setBulkAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (forPhone: string) => {
    setLoading(true);
    try {
      setAccount(await loadCustomerAccount(forPhone));
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!phone) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset and load each time it opens */
    setAccount(null);
    setAmounts({});
    setBulkAmount("");
    load(phone);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [phone, load]);

  /** Payment for one LED. */
  async function payLed(led: AccountLed) {
    const amount = Number(amounts[led.complaint.id]);
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter the amount received", "error");
    if (led.billed !== null && amount > led.due) return toast(`Only ${formatMoney(led.due)} is due for this LED`, "error");
    setBusy(led.complaint.id);
    try {
      await recordCustomerPayment(led, amount, todayISO(), null);
      toast(`${formatMoney(amount)} received for ${led.complaint.complaint_no}`);
      setAmounts((current) => ({ ...current, [led.complaint.id]: "" }));
      await load(phone!);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setBusy(null);
  }

  /** One amount spread over the oldest unpaid LEDs first. */
  async function payOldestFirst() {
    if (!account) return;
    let left = Number(bulkAmount);
    if (!Number.isFinite(left) || left <= 0) return toast("Enter the amount received", "error");
    if (left > account.totals.due) return toast(`Only ${formatMoney(account.totals.due)} is due in total`, "error");
    setBusy("bulk");
    try {
      for (const led of account.leds) {
        if (left <= 0) break;
        if (led.due <= 0) continue;
        const part = Math.min(left, led.due);
        await recordCustomerPayment(led, part, todayISO(), "Paid towards old balance");
        left -= part;
      }
      toast(`${formatMoney(bulkAmount)} received`);
      setBulkAmount("");
      await load(phone!);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setBusy(null);
  }

  return (
    <Modal
      open={Boolean(phone)}
      onClose={onClose}
      title={account ? `${account.name} — Customer history` : "Customer history"}
      subtitle={account ? `${account.phone} · ${account.leds.length} LED${account.leds.length === 1 ? "" : "s"} · ${account.totals.visits} visit${account.totals.visits === 1 ? "" : "s"}` : phone ?? ""}
      size="xl"
      tall
    >
      {loading && !account ? (
        <div className="flex h-40 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-red-600" aria-label="Loading customer history" />
        </div>
      ) : !account ? (
        <p className="py-10 text-center text-sm text-slate-500">No complaints found for this phone number.</p>
      ) : (
        <div className="space-y-5">
          {/* Totals */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary icon={<Receipt className="size-4" />} tone="bg-slate-50 text-slate-700" label="Total billed" value={account.totals.billed} />
            <Summary icon={<CircleCheck className="size-4" />} tone="bg-emerald-50 text-emerald-700" label="Total paid" value={account.totals.paid} />
            <Summary icon={<Clock className="size-4" />} tone="bg-red-50 text-red-700" label="Balance due" value={account.totals.due} />
          </div>

          {account.totals.due > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50/50 p-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-slate-700">
                <Wallet className="mr-1.5 inline size-4 text-red-600" />
                Receive one amount — it pays the <b>oldest</b> unpaid LEDs first.
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  placeholder={`Up to ${account.totals.due}`}
                  className="w-40"
                  aria-label="Amount received"
                />
                <Button onClick={payOldestFirst} loading={busy === "bulk"} disabled={Boolean(busy)}>
                  Receive
                </Button>
              </div>
            </div>
          )}

          {/* Each LED */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">LEDs brought in</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Complaint</th>
                    <th className="px-3 py-2.5 font-semibold">LED</th>
                    <th className="px-3 py-2.5 font-semibold">Repair</th>
                    <th className="px-3 py-2.5 font-semibold">Billed</th>
                    <th className="px-3 py-2.5 font-semibold">Paid</th>
                    <th className="px-3 py-2.5 font-semibold">Due</th>
                    <th className="px-3 py-2.5 font-semibold">Receive payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {account.leds.map((led) => {
                    const c = led.complaint;
                    return (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatDate(c.complaint_date)}</td>
                        <td className="px-3 py-2.5 font-mono font-medium">{c.complaint_no}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800">{c.led_model}</p>
                          <p className="text-xs text-slate-500">S/N {c.serial_number}{c.defect ? ` · ${c.defect}` : ""}</p>
                        </td>
                        <td className="px-3 py-2.5"><Badge status={c.status} /></td>
                        <td className="px-3 py-2.5 font-medium">
                          {led.billed === null ? <span className="text-xs font-normal text-slate-400">No invoice yet</span> : formatMoney(led.billed)}
                        </td>
                        <td className="px-3 py-2.5 text-emerald-700">{formatMoney(led.paid)}</td>
                        <td className={cn("px-3 py-2.5 font-semibold", led.due > 0 ? "text-red-700" : "text-slate-400")}>
                          {led.billed === null ? "-" : led.due > 0 ? formatMoney(led.due) : "Cleared"}
                        </td>
                        <td className="px-3 py-2.5">
                          {led.billed === null || led.due > 0 ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="1"
                                step="0.01"
                                value={amounts[c.id] ?? ""}
                                onChange={(e) => setAmounts((current) => ({ ...current, [c.id]: e.target.value }))}
                                placeholder={led.billed === null ? "Advance" : "Amount"}
                                className="w-24"
                                aria-label={`Amount received for ${c.complaint_no}`}
                              />
                              <Button size="sm" onClick={() => payLed(led)} loading={busy === c.id} disabled={Boolean(busy)}>
                                Pay
                              </Button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CircleCheck className="size-3.5" /> Fully paid
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Payment history */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <History className="size-4" /> Payment history
            </h3>
            {account.history.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {account.history.map((h) => (
                  <li key={h.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {formatDate(h.date)} · {h.complaint.complaint_no}{" "}
                        <span className="font-normal text-slate-500">({h.complaint.led_model})</span>
                      </p>
                      <p className="text-xs text-slate-500">{h.notes || (h.kind === "advance" ? "Advance" : "Payment")}</p>
                    </div>
                    <span className="font-semibold text-emerald-700">+ {formatMoney(h.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No payments yet.
              </p>
            )}
          </section>

          <p className="text-xs text-slate-500">
            The bill for each LED comes from its invoice. When an LED is fully paid, its invoice is marked Paid automatically.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Summary({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: number }) {
  return (
    <div className={cn("rounded-xl p-3", tone)}>
      <p className="flex items-center gap-1.5 text-xs">{icon} {label}</p>
      <p className="mt-1 text-lg font-semibold">{formatMoney(value)}</p>
    </div>
  );
}
