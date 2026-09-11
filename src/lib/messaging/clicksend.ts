import type { SmsSender } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example) — required when LOG_ONLY_TRANSPORT=false`);
  return value;
}

/** Real SMS send via ClickSend's v3 REST API. Only ever constructed when LOG_ONLY_TRANSPORT=false — see transport.ts. */
export const clickSendSmsSender: SmsSender = {
  async send(to, body) {
    const username = requireEnv("CLICKSEND_USERNAME");
    const apiKey = requireEnv("CLICKSEND_API_KEY");
    const from = requireEnv("CLICKSEND_FROM");

    const response = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ source: "ridge", to, body, from }] }),
    });

    if (!response.ok) {
      throw new Error(`ClickSend SMS send failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      data?: { messages?: { message_id?: string }[] };
    };
    return { providerMessageId: data.data?.messages?.[0]?.message_id };
  },
};
