import { z } from "zod";
const memberId = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,100}$/);
export const ChatMentionSchema = z
  .object({
    id: memberId,
    start: z.number().int().min(0).max(1999),
    end: z.number().int().min(1).max(2000),
  })
  .strict();
export type ChatMention = z.infer<typeof ChatMentionSchema>;
export const ChatSendSchema = z
  .object({
    peer: memberId.optional(),
    clientId: z.string().uuid(),
    body: z
      .string()
      .min(1)
      .max(2000)
      .refine((s) => s.trim().length > 0),
    mentions: z.array(ChatMentionSchema).max(10).default([]),
  })
  .strict();
export const ChatReadSchema = z
  .object({
    peer: memberId.optional(),
    through: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mentionSeqs: z
      .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
      .max(50)
      .default([]),
  })
  .strict();
export type ChatMessage = {
  seq: number;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
  mentions: ChatMention[];
};
export type ChatPerson = {
  id: string;
  label: string;
  role: "admin" | "officer" | "raider" | "guild_member";
};
export type ChatStatus = {
  people: ChatPerson[];
  unread: Record<string, number>;
  unreadMentions?: number;
  latestNotification?: ChatNotification | null;
  discord?: { linked: boolean; enabled: boolean };
};
export type ChatNotification = {
  seq: number;
  peer: string;
  senderName: string;
  kind: "dm" | "mention";
};
export type ChatDelivery =
  "disabled" | "sending" | "sent" | "failed" | "uncertain";
export type ChatPage = { messages: ChatMessage[]; hasMore: boolean };
