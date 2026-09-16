import { getCurrentStaffSession } from "@/lib/auth/current-session";
import { getClientTenant } from "@/lib/staff/clients";
import { exportTenant } from "@/lib/export/tenant-export";

/**
 * A roofer's complete data, as a JSON download.
 *
 * CLAUDE.md: "Any roofer can export all his data." This route is how that
 * promise is kept, and it matters most at the moment a roofer leaves —
 * exactly when a platform is most tempted to make leaving difficult.
 *
 * exportTenant reads through withStaffTenantAccess, so the download itself
 * lands in the access log the roofer can see.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const session = await getCurrentStaffSession();
  if (!session) return new Response("Not found", { status: 404 });

  const { tenantId } = await params;
  const tenant = await getClientTenant(tenantId);
  if (!tenant) return new Response("Not found", { status: 404 });

  const bundle = await exportTenant(session.staffUserId, tenantId);

  const slug = tenant.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug || "client"}-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Never cached: it's a full copy of a business's customer records.
      "Cache-Control": "no-store",
    },
  });
}
