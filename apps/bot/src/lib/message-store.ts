import type { proto } from "@whiskeysockets/baileys";

const messageStore = new Map<string, proto.IMessage>();
const MAX_CACHE_SIZE = 3000;

export function storeMessage(id?: string | null, message?: proto.IMessage | null): void {
  if (!id || !message) return;
  if (messageStore.size >= MAX_CACHE_SIZE) {
    const oldest = messageStore.keys().next().value;
    if (oldest) messageStore.delete(oldest);
  }
  messageStore.set(id, message);
}

export function getCachedMessage(id?: string | null): proto.IMessage | undefined {
  if (!id) return undefined;
  return messageStore.get(id);
}
