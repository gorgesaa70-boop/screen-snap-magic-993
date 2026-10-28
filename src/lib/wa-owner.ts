import { toLatinDigits } from "./digits";

/**
 * WhatsApp chats handed to a listing's owner (release 39). The owner answers from the dashboard, the message leaves
 * from the Value Aqar number, and all contact stays on the platform: replies can't carry a phone number, a WhatsApp
 * link or an email.
 */

/** No reply from the owner this long after the hand-over → the team gets a bell (on the customer's next message). */
export const OWNER_SILENCE_MS = 30 * 60_000;
/** The bot stays quiet after handing a chat to an owner, so the owner can answer. */
export const OWNER_HANDOVER_PAUSE_MS = 2 * 3_600_000;

const PHONE = /(?:\+|00)\d{9,14}|(?:20|0)?1[0125]\d{8}/;
const LINK = /wa\.me|whatsapp\.com|api\.whatsapp|t\.me\/|[\w.+-]+@[\w-]+\.[\w.]+/i;

/** True when the text gives a way to reach someone off the platform. Spaces, dashes and dots between digits count. */
export function contactLeak(text: string): boolean {
  const t = toLatinDigits(text);
  return LINK.test(t) || PHONE.test(t.replace(/(?<=\d)[\s\-.]+(?=\d)/g, ""));
}

/** What the customer receives: who is answering, then the reply. */
export function ownerReplyText(ownerName: string, body: string) {
  return `*${ownerName}* (عبر فاليو عقار):\n${body.trim()}`;
}

/** What the bot tells the customer when it hands the chat over. */
export function handoverText(ownerName: string) {
  return `حوّلنا سؤالك لـ *${ownerName}* المسؤول عن الإعلان ده، وهيرد عليك هنا في نفس المحادثة.`;
}
