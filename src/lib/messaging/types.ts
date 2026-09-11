/** CLAUDE.md's own naming: integrations wrapped behind small internal interfaces so they can be faked in tests and swapped later. */
export interface SmsSender {
  send(to: string, body: string): Promise<{ providerMessageId?: string }>;
}

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<{ providerMessageId?: string }>;
}
