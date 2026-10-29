import "server-only";

/**
 * Sends SMS from the server. Settings live in .env.local (never in the browser).
 *
 * 1. TextBee (used when TEXTBEE_API_KEY is set)
 *      An Android phone with the TextBee app sends the SMS from its own SIM.
 *      TEXTBEE_API_KEY   from the textbee.dev dashboard
 *
 * 2. Branded SMS gateway (used when SMS_API_URL is set and TextBee isn't)
 *      SMS_API_URL       the gateway's "send SMS" link with {to}, {message}, {sender} placeholders
 *      SMS_SENDER        approved sender name / mask
 *      SMS_SUCCESS_TEXT  (optional) text in the reply that means "accepted"
 *      SMS_PHONE_FORMAT  intl_no_plus = 923001234567 (default) | intl = +923001234567 | local = 03001234567
 *
 * If neither is set, nothing is sent and the app falls back to sending from the shop phone by hand.
 */

export type SmsResult = { ok: true } | { ok: false; error: string; notConfigured?: boolean };

/** 0300-1234567 / 3001234567 / +92 300 1234567 -> 923001234567. Null if it isn't a Pakistani mobile number. */
function toDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.startsWith("3") && digits.length === 10) digits = `92${digits}`;
  return /^923\d{9}$/.test(digits) ? digits : null;
}

export function formatPhone(raw: string): string | null {
  const digits = toDigits(raw);
  if (!digits) return null;
  switch (process.env.SMS_PHONE_FORMAT) {
    case "intl":
      return `+${digits}`;
    case "local":
      return `0${digits.slice(2)}`;
    default:
      return digits;
  }
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  try {
    if (process.env.TEXTBEE_API_KEY?.trim()) return await sendTextBee(phone, message);
    if (process.env.SMS_API_URL?.trim()) return await sendHttpGateway(phone, message);
    return { ok: false, notConfigured: true, error: "SMS is not set up yet." };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, error: timedOut ? "SMS service did not answer in time." : "Could not reach the SMS service." };
  }
}

/** https://textbee.dev — POST /gateway/send-sms with x-api-key. */
async function sendTextBee(phone: string, message: string): Promise<SmsResult> {
  const digits = toDigits(phone);
  if (!digits) return { ok: false, error: `${phone} is not a valid mobile number.` };

  const res = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.TEXTBEE_API_KEY!.trim() },
    body: JSON.stringify({ recipients: [`+${digits}`], message }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as
    | { data?: { success?: boolean; message?: string }; message?: string; error?: string }
    | null;

  // TextBee replies {"data":{"success":true,"message":"SMS added to queue for processing",...}}
  if (res.ok && data?.data?.success !== false) return { ok: true };
  if (res.status === 401) return { ok: false, error: "TextBee API key is wrong or expired." };
  return { ok: false, error: data?.data?.message ?? data?.message ?? data?.error ?? `TextBee error ${res.status}` };
}

async function sendHttpGateway(phone: string, message: string): Promise<SmsResult> {
  const template = process.env.SMS_API_URL!.trim();
  if (!template.includes("{to}") || !template.includes("{message}")) {
    return { ok: false, notConfigured: true, error: "SMS_API_URL must contain {to} and {message}." };
  }
  const to = formatPhone(phone);
  if (!to) return { ok: false, error: `${phone} is not a valid mobile number.` };

  const url = template
    .replace("{to}", encodeURIComponent(to))
    .replace("{message}", encodeURIComponent(message))
    .replace("{sender}", encodeURIComponent(process.env.SMS_SENDER ?? ""));
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const reply = (await res.text()).trim();
  if (!res.ok) return { ok: false, error: `SMS gateway error ${res.status}: ${reply.slice(0, 150)}` };

  const expected = process.env.SMS_SUCCESS_TEXT?.trim();
  if (expected && !reply.toLowerCase().includes(expected.toLowerCase())) {
    return { ok: false, error: `SMS gateway said: ${reply.slice(0, 150)}` };
  }
  return { ok: true };
}
