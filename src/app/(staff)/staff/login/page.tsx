import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/config";
import { getCurrentStaffSession } from "@/lib/auth/current-session";
import { BrandMark } from "@/components/brand-mark";
import { StaffLoginForm } from "./login-form";

export default async function StaffLoginPage() {
  if (await getCurrentStaffSession()) redirect("/staff");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <BrandMark />
        <p className="text-micro font-semibold uppercase tracking-[0.12em] text-muted">Juno Logic staff</p>
        <h1 className="text-headline font-bold tracking-[-0.02em]">{PRODUCT_NAME}</h1>
        <p className="text-caption text-muted">
          Running and billing every roofer. Access to a client&apos;s data is logged and shown to them.
        </p>
      </header>

      <StaffLoginForm />
    </main>
  );
}
