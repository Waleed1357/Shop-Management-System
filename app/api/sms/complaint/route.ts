import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendSms } from "@/lib/sms";
import { complaintSmsText } from "@/lib/sms-link";

/**
 * POST /api/sms/complaint  { complaintId }
 * Sends the branded "complaint registered" SMS and saves the result on the complaint.
 * Only signed-in users can call it. Gateway keys stay on the server.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ ok: false, error: "Please log in again." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { complaintId?: string } | null;
  if (!body?.complaintId) return Response.json({ ok: false, error: "complaintId is required" }, { status: 400 });

  const { data: complaint } = await supabase
    .from("complaints")
    .select("id, complaint_no, client_name, phone, address, defect, led_model, serial_number, technician, technician_phone")
    .eq("id", body.complaintId)
    .maybeSingle();
  if (!complaint) return Response.json({ ok: false, error: "Complaint not found" }, { status: 404 });

  const result = await sendSms(complaint.phone, complaintSmsText(complaint));

  // Not set up yet: leave the status alone so the shop can send it from the phone instead.
  if (!(!result.ok && result.notConfigured)) {
    await supabase
      .from("complaints")
      .update(
        result.ok
          ? { sms_status: "sent", sms_error: null, sms_sent_at: new Date().toISOString() }
          : { sms_status: "failed", sms_error: result.error },
      )
      .eq("id", complaint.id);
  }

  // Always 200: the request worked; `ok` says whether the SMS went out.
  return Response.json(result);
}
