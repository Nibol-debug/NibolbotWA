import type { PluginDefinition } from "@nibolbot/shared";
import { db } from "./db";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const plugins: Map<string, PluginDefinition> = new Map();
export const commandMap: Map<string, PluginDefinition> = new Map();

export async function loadPlugins(): Promise<void> {
  plugins.clear();
  commandMap.clear();

  const pluginsDir = join(import.meta.dir, "plugins");
  let files: string[] = [];
  try {
    files = readdirSync(pluginsDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
  } catch {
    console.warn("⚠️ Plugins directory not found, creating empty map.");
    return;
  }

  for (const file of files) {
    try {
      const modulePath = join(pluginsDir, file);
      const mod = await import(modulePath);
      const plugin: PluginDefinition = mod.default || mod.plugin;

      if (!plugin || !plugin.name || !plugin.commands) {
        console.warn(`⚠️ Skipped invalid plugin file: ${file}`);
        continue;
      }

      plugins.set(plugin.name, plugin);

      // Register all command aliases
      for (const cmd of plugin.commands) {
        commandMap.set(cmd.toLowerCase(), plugin);
      }

      // Sync defaults with SQLite feature_settings (PRD Section 9)
      const existing = db.query("SELECT feature FROM feature_settings WHERE feature = ?").get(plugin.name);
      if (!existing) {
        db.run(
          "INSERT INTO feature_settings (feature, enabled, config) VALUES (?, ?, ?)",
          [plugin.name, plugin.defaults.enabled ? 1 : 0, JSON.stringify(plugin.defaults)]
        );
      }

      console.log(`🔌 Loaded plugin [${plugin.name}] commands: ${plugin.commands.join(", ")}`);
    } catch (err) {
      console.error(`❌ Failed to load plugin ${file}:`, err);
    }
  }

  console.log(`✅ Loaded ${plugins.size} plugins (${commandMap.size} commands) total.`);
}

export function getPluginForCommand(cmd: string): PluginDefinition | undefined {
  return commandMap.get(cmd.toLowerCase());
}

export function isFeatureEnabled(featureName: string): boolean {
  const row = db.query("SELECT enabled FROM feature_settings WHERE feature = ?").get(featureName) as { enabled: number } | null;
  if (!row) return true; // default to enabled if not found
  return row.enabled === 1;
}

export function getFeatureConfig(featureName: string): any {
  const row = db.query("SELECT config FROM feature_settings WHERE feature = ?").get(featureName) as { config: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.config);
  } catch {
    return null;
  }
}
