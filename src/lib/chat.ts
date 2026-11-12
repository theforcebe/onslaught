import { z } from "zod";
const memberId = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,100}$/);
export const ChatSendSchema = z
  .object({
    peer: memberId.optional(),
    clientId: z.string().uuid(),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export const ChatReadSchema = z
  .object({
    peer: memberId.optional(),
    through: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type ChatMessage = {
  seq: number;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: number;
};
export type ChatPerson = {
  id: string;
  label: string;
  role: "admin" | "officer" | "raider" | "guild_member";
};
export type ChatStatus = {
  people: ChatPerson[];
  unread: Record<string, number>;
};
export type ChatPage = { messages: ChatMessage[]; hasMore: boolean };
