import { NextRequest, NextResponse } from "next/server";
import { submitWebsiteLead } from "@/lib/crm/intake";

/**
 * POST target for a Juno-built roofer website's enquiry form. Public and
 * unauthenticated by design — see src/lib/crm/intake.ts for how the
 * intake key resolves a tenant and the write still goes through the
 * normal RLS-enforced path. Responses deliberately look the same (200)
 * whether the lead was created or silently ignored (bad key, honeypot
 * tripped) so a prober can't learn which keys are valid.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ intakeKey: string }> }) {
  const { intakeKey } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const address = typeof body.address === "string" ? body.address : "";
  if (!name.trim() || !address.trim()) {
    return NextResponse.json({ error: "name and address are required" }, { status: 400 });
  }

  const result = await submitWebsiteLead(intakeKey, {
    name,
    address,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    honeypot: typeof body.honeypot === "string" ? body.honeypot : undefined,
  });

  if (result.status === "rate_limited") {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
