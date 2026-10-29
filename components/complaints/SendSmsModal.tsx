/* eslint-disable @next/next/no-img-element -- QR code is a generated data URL */
"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, CircleAlert, Copy, MessageSquareText, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Complaint } from "@/lib/types";
import { complaintSmsText, smsHref, smsParts, smsQrText, toIntlMobile } from "@/lib/sms-link";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface SendSmsModalProps {
  complaint: Complaint | null;
  onClose: () => void;
  /** Called after the SMS is marked as sent, with the updated complaint. */
  onSent: (complaint: Complaint) => void;
}

/**
 * Sends the "complaint registered" SMS from the shop's own phone:
 * - on a phone: "Open SMS app" opens Messages with number + text filled in, then tap Send
 * - on a laptop: scan the QR code with the phone camera, then tap Send
 */
export default function SendSmsModal({ complaint, onClose, onSent }: SendSmsModalProps) {
  const toast = useToast();
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const phone = complaint ? toIntlMobile(complaint.phone) : null;
  const text = useMemo(
    () => (complaint ? complaintSmsText(complaint) : ""),
    [complaint],
  );

  useEffect(() => {
    if (!phone || !text) return;
    let cancelled = false;
    QRCode.toDataURL(smsQrText(phone, text), { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [phone, text]);

  /** Remembers that the SMS was sent so the list can show it. */
  async function markSent() {
    if (!complaint) return;
    const sentAt = new Date().toISOString();
    const updated: Complaint = { ...complaint, sms_status: "sent", sms_error: null, sms_sent_at: sentAt };
    onSent(updated);
    const { error } = await createClient()
      .from("complaints")
      .update({ sms_status: "sent", sms_error: null, sms_sent_at: sentAt })
      .eq("id", complaint.id);
    if (error) toast("Couldn't save SMS status", "error");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy not allowed by this browser", "error");
    }
  }

  return (
    <Modal open={Boolean(complaint)} onClose={onClose} title="Send SMS to client" subtitle={complaint ? `${complaint.client_name} · ${complaint.phone}` : ""}>
      {complaint && !phone ? (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <p>
            <b>{complaint.phone}</b> doesn&apos;t look like a mobile number, so an SMS can&apos;t be sent. Edit the complaint
            and enter a number like 0300-1234567.
          </p>
        </div>
      ) : (
        complaint && (
          <div className="space-y-5">
            {/* Message preview */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-slate-700">Message</p>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800">{text}</p>
              <p className="mt-1 text-right text-xs text-slate-400">
                {text.length} characters · {smsParts(text)} SMS {smsParts(text) === 1 ? "part" : "parts"}
              </p>
            </div>

            {/* On a phone: open the SMS app */}
            <a
              href={smsHref(phone!, text)}
              onClick={markSent}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-red-600/25 transition-colors hover:bg-red-700 md:hidden"
            >
              <MessageSquareText className="size-5" />
              Open SMS app
            </a>

            {/* On a laptop: scan with the phone */}
            <div className="hidden items-center gap-5 rounded-2xl border border-slate-200 p-4 md:flex">
              {qr ? (
                <img src={qr} alt="QR code to send the SMS" className="size-40 shrink-0 rounded-lg" />
              ) : (
                <div className="shimmer size-40 shrink-0 rounded-lg" />
              )}
              <div className="space-y-2 text-sm text-slate-600">
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <Smartphone className="size-4 text-red-600" /> Scan with the shop phone
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open the phone camera and point it at the code.</li>
                  <li>Tap the link that appears. Messages opens with everything filled in.</li>
                  <li>Tap <b>Send</b>.</li>
                </ol>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={onClose}>
                Skip
              </Button>
              <Button
                onClick={async () => {
                  await markSent();
                  toast("Marked as sent");
                  onClose();
                }}
              >
                <Check className="size-4" /> I&apos;ve sent it
              </Button>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
