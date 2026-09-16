import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { PRODUCT_NAME } from "@/lib/config";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentRooferSession();
  if (session) redirect("/today");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 px-5 py-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <BrandMark size={56} />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display font-semibold tracking-[-0.025em] text-balance">
            {PRODUCT_NAME}
          </h1>
          <p className="text-body text-muted text-pretty">
            Your leads, your quote days and your jobs — all in one place.
          </p>
        </div>
      </header>

      <LoginForm />

      <p className="text-center text-caption text-muted">
        Trouble getting in? Give Juno Logic a call. ·{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy
        </Link>
      </p>
    </main>
  );
}
