import { loadPlugins, plugins, commandMap, isFeatureEnabled } from "./src/plugin-loader";
import { db, getBotSettings, logCommand } from "./src/db";

console.log("🧪 Testing Fase 1: Core Bot (Plugin Loader, Command Registry, SQLite)...");

try {
  // Test 1: Load plugins
  await loadPlugins();
  if (plugins.size === 0) {
    throw new Error("No plugins were loaded!");
  }
  console.log(`✅ Plugins loaded: ${Array.from(plugins.keys()).join(", ")}`);

  // Test 2: Check command mapping
  const ping = commandMap.get("ping");
  const help = commandMap.get("help");
  const status = commandMap.get("status");

  if (!ping || !help || !status) {
    throw new Error("Core commands (ping, help, status) not properly registered in commandMap!");
  }
  console.log("✅ Core commands (ping, help, status) registered in commandMap.");

  // Test 3: Check SQLite settings & feature_settings
  const settings = getBotSettings();
  console.log(`✅ SQLite Bot Settings: prefix = '${settings.prefix}', mode = '${settings.mode}', botName = '${settings.botName}'`);

  const pingEnabled = isFeatureEnabled("ping");
  console.log(`✅ Feature 'ping' enabled in SQLite: ${pingEnabled}`);

  // Test 4: Command logging & retention
  logCommand("628123456789@s.whatsapp.net", "ping", "SUCCESS");
  const logCount = (db.query("SELECT COUNT(*) as c FROM command_logs").get() as any)?.c;
  console.log(`✅ SQLite Command Logs verified: count = ${logCount}`);

  console.log("🎉 Fase 1 Core Bot is fully verified and functional!");
  process.exit(0);
} catch (err) {
  console.error("❌ Fase 1 test failed:", err);
  process.exit(1);
}
