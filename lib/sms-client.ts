export interface SmsResponse {
  ok: boolean;
  error?: string;
  /** True when no SMS gateway is set up yet (send from the shop phone instead). */
  notConfigured?: boolean;
}

/** Asks the server to send the branded "complaint registered" SMS. Never throws. */
export async function sendComplaintSms(complaintId: string): Promise<SmsResponse> {
  try {
    const res = await fetch("/api/sms/complaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaintId }),
    });
    const data = (await res.json().catch(() => null)) as SmsResponse | null;
    if (data) return data;
    return { ok: false, error: `Server error ${res.status}` };
  } catch {
    return { ok: false, error: "No internet connection." };
  }
}
