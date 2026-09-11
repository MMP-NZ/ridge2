import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { PRODUCT_NAME } from "@/lib/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentRooferSession();
  if (session) redirect("/today");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">{PRODUCT_NAME}</h1>
      <LoginForm />
    </main>
  );
}
