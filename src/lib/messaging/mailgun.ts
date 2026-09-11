import type { EmailSender } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example) — required when LOG_ONLY_TRANSPORT=false`);
  return value;
}

/** Real email send via Mailgun's REST API. Only ever constructed when LOG_ONLY_TRANSPORT=false — see transport.ts. */
export const mailgunEmailSender: EmailSender = {
  async send(to, subject, body) {
    const apiKey = requireEnv("MAILGUN_API_KEY");
    const domain = requireEnv("MAILGUN_DOMAIN");
    const from = requireEnv("MAILGUN_FROM_EMAIL");

    const form = new URLSearchParams({ from, to, subject, text: body });

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Mailgun email send failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { id?: string };
    return { providerMessageId: data.id };
  },
};
