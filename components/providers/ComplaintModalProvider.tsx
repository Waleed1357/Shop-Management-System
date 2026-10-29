"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Complaint } from "@/lib/types";
import { sendComplaintSms } from "@/lib/sms-client";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import ComplaintForm from "@/components/complaints/ComplaintForm";
import SendSmsModal from "@/components/complaints/SendSmsModal";
import { useToast } from "@/components/providers/ToastProvider";

type Listener = (complaint: Complaint) => void;

interface ComplaintModalContextValue {
  /** Opens the add modal, or the edit modal when a complaint is passed. */
  openComplaint: (complaint?: Complaint) => void;
  /** Sends the "complaint registered" SMS (asks first if it was already sent). */
  openSms: (complaint: Complaint) => void;
  subscribe: (listener: Listener) => () => void;
}

const ComplaintModalContext = createContext<ComplaintModalContextValue>({
  openComplaint: () => {},
  openSms: () => {},
  subscribe: () => () => {},
});

/** Shared Add / Edit Complaint and SMS windows that any page (or the top bar) can open. */
export function ComplaintModalProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Complaint | "new" | null>(null);
  /** Complaints still waiting to be texted from the shop phone (shown one at a time). */
  const [phoneSmsQueue, setPhoneSmsQueue] = useState<Complaint[]>([]);
  const phoneSmsFor = phoneSmsQueue[0] ?? null;
  const [confirmResend, setConfirmResend] = useState<Complaint | null>(null);
  const sending = useRef(false);
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const notify = useCallback((c: Complaint) => listeners.current.forEach((l) => l(c)), []);

  /**
   * 1. Try the branded SMS gateway (sender shows the business name).
   * 2. If it isn't set up yet, or it fails, open "send from the shop phone" as a backup.
   */
  const deliverSms = useCallback(
    async (complaints: Complaint[]) => {
      if (sending.current || !complaints.length) return;
      sending.current = true;
      toast(complaints.length > 1 ? `Sending ${complaints.length} SMS...` : "Sending SMS...");
      const needPhone: Complaint[] = [];
      for (const complaint of complaints) {
        const result = await sendComplaintSms(complaint.id);
        if (result.ok) {
          toast(`SMS sent to ${complaint.phone} (${complaint.complaint_no})`);
          notify({ ...complaint, sms_status: "sent", sms_error: null, sms_sent_at: new Date().toISOString() });
          continue;
        }
        if (!result.notConfigured) {
          toast(`SMS not sent: ${result.error}. Send it from the phone instead.`, "error");
          notify({ ...complaint, sms_status: "failed", sms_error: result.error ?? null });
        }
        needPhone.push(complaint);
      }
      sending.current = false;
      if (needPhone.length) setPhoneSmsQueue(needPhone);
    },
    [notify, toast],
  );

  const openComplaint = useCallback((complaint?: Complaint) => setEditing(complaint ?? "new"), []);
  const openSms = useCallback(
    (complaint: Complaint) => (complaint.sms_status === "sent" ? setConfirmResend(complaint) : deliverSms([complaint])),
    [deliverSms],
  );
  const close = useCallback(() => setEditing(null), []);
  // Closing shows the next complaint's SMS, if there is one.
  const closePhoneSms = useCallback(() => setPhoneSmsQueue((queue) => queue.slice(1)), []);
  const cancelResend = useCallback(() => setConfirmResend(null), []);

  return (
    <ComplaintModalContext value={{ openComplaint, openSms, subscribe }}>
      {children}
      <Modal
        open={Boolean(editing)}
        onClose={close}
        title={editing === "new" ? "New Complaint" : "Edit Complaint"}
        subtitle={editing === "new" ? "Press Enter to jump to the next field" : editing?.complaint_no}
        size="wide"
        tall
      >
        {editing && (
          <ComplaintForm
            key={editing === "new" ? "new" : editing.id}
            complaint={editing === "new" ? undefined : editing}
            hideNotes
            onCancel={close}
            onSaved={(saved) => {
              saved.forEach(notify);
              // One SMS per saved complaint batch, even when the form temporarily creates multiple rows.
              if (editing === "new") deliverSms(saved.slice(0, 1));
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(confirmResend)}
        title="Send SMS again?"
        message={confirmResend ? `${confirmResend.client_name} already got the SMS for ${confirmResend.complaint_no}. Send it again?` : ""}
        confirmLabel="Send again"
        onConfirm={() => {
          const c = confirmResend;
          setConfirmResend(null);
          if (c) deliverSms([c]);
        }}
        onCancel={cancelResend}
      />

      {/* Backup: send from the shop's own phone */}
      <SendSmsModal
        key={phoneSmsFor?.id}
        complaint={phoneSmsFor}
        onClose={closePhoneSms}
        onSent={(updated) => {
          setPhoneSmsQueue((queue) => [updated, ...queue.slice(1)]);
          notify(updated);
        }}
      />
    </ComplaintModalContext>
  );
}

export const useComplaintModal = () => useContext(ComplaintModalContext).openComplaint;
export const useSmsModal = () => useContext(ComplaintModalContext).openSms;

/** Runs `callback` whenever a complaint is added or edited (or its SMS is sent) through these windows. */
export function useComplaintSaved(callback: Listener) {
  const { subscribe } = useContext(ComplaintModalContext);
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  useEffect(() => subscribe((c) => ref.current(c)), [subscribe]);
}
