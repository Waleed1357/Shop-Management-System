import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sendSms } from "@/lib/sms";

/**
 * POST /api/sms/test   header: x-sms-test-token: <SMS_TEST_TOKEN>   body: { "to": "03001234567" }
 * Sends a fixed test SMS to check the SMS setup. Disabled unless SMS_TEST_TOKEN is set (16+ characters).
 * The text is fixed so the endpoint can't be used to send other messages.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.SMS_TEST_TOKEN?.trim() ?? "";
  const given = request.headers.get("x-sms-test-token") ?? "";
  if (expected.length < 16 || !sameSecret(given, expected)) {
    return Response.json({ ok: false, error: "Not allowed" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { to?: string } | null;
  if (!body?.to) return Response.json({ ok: false, error: "Send { \"to\": \"03001234567\" }" }, { status: 400 });

  const result = await sendSms(body.to, "Test SMS from Awan Electronics Service Center. SMS is working.");
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
