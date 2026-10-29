/**
 * SMS is sent from the shop's own phone (normal SMS app + SIM package).
 * Nothing is sent automatically, so the SIM can't be flagged for bulk sending.
 */

export interface ComplaintSmsFields {
  complaint_no: string;
  client_name: string;
  phone: string;
  address: string;
  defect: string | null;
  led_model: string;
  serial_number: string;
  technician: string | null;
  technician_phone?: string | null;
}

/** The "complaint registered" SMS sent to the customer. */
export function complaintSmsText(c: ComplaintSmsFields) {
  return [
    "AWAN ELECTRONICS SERVICE CENTER (WAH CANTT)",
    `Complaint No: ${c.complaint_no}`,
    `Customer Name: ${c.client_name}`,
    `Customer Address: ${c.address}`,
    `LED Model: ${c.led_model?.trim() || "-"}`,
    `Serial Number: ${c.serial_number?.trim() || "-"}`,
    `Fault: ${c.defect?.trim() || "-"}`,
    `Technician: ${c.technician?.trim() || "-"}`,
    `Technician Number: ${c.technician_phone?.trim() || "-"}`,
    "",
    "Contact with us for any query.",
  ].join("\n");
}

/** How many SMS parts a message is billed as (160 chars for one, 153 per part when longer; 70/67 if it has Urdu etc.). */
export function smsParts(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** 0300-1234567 / 3001234567 / +92 300 1234567 -> +923001234567. Returns null if it isn't a mobile number. */
export function toIntlMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.startsWith("3") && digits.length === 10) digits = `92${digits}`;
  return /^923\d{9}$/.test(digits) ? `+${digits}` : null;
}

/** Link that opens the phone's SMS app with number and text filled in ("?&body=" works on Android and iPhone). */
export function smsHref(phone: string, text: string) {
  return `sms:${phone}?&body=${encodeURIComponent(text)}`;
}

/** QR content that phone cameras open as a ready-to-send SMS. */
export function smsQrText(phone: string, text: string) {
  return `SMSTO:${phone}:${text}`;
}
