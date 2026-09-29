import type { WASocket, proto } from "@whiskeysockets/baileys";
import type { Database } from "bun:sqlite";

export interface BotSettings {
  botName: string;
  prefix: string;
  mode: 'public' | 'owner';
  owners: string[];
  stickerPack: string;
  stickerAuthor: string;
  newsletterJid?: string;
  channelName?: string;
}

export interface FeatureDefaults {
  enabled: boolean;
  cooldown: number; // in seconds
  limitPerDay: number;
  maxDuration?: number; // in minutes (for media/downloads)
}

export interface PluginContext {
  sock: WASocket;
  msg: proto.IWebMessageInfo;
  from: string; // group or remote JID
  sender: string; // user JID
  isGroup: boolean;
  command: string;
  args: string[];
  fullText: string;
  reply: (content: string | proto.AnyMessageContent) => Promise<any>;
  db: Database;
  settings: BotSettings;
}

export interface PluginDefinition {
  name: string;
  category: 'music' | 'downloader' | 'media' | 'system' | 'admin';
  description?: string;
  commands: string[];
  defaults: FeatureDefaults;
  run: (ctx: PluginContext) => Promise<void>;
}

export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def;
}
