import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySessionToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/current-session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySessionToken(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
