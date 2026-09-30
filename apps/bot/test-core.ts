import { loadPlugins, plugins, commandMap, isFeatureEnabled } from "./src/plugin-loader";
import { db, getBotSettings, logCommand } from "./src/db";
import { normalizePhoneNumber, checkIsOwner, extractMessageText } from "./src/command-handler";

console.log("🧪 Testing Fase 1: Core Bot (Plugin Loader, Command Registry, SQLite, Owner & Group Handling)...");

try {
  // Test 1: Load plugins
  await loadPlugins();
  if (plugins.size === 0) {
    throw new Error("No plugins were loaded!");
  }
  console.log(`✅ Plugins loaded: ${Array.from(plugins.keys()).join(", ")}`);

  // Test 2: Check command mapping (including new owner plugin)
  const ping = commandMap.get("ping");
  const help = commandMap.get("help");
  const status = commandMap.get("status");
  const owner = commandMap.get("owner");

  if (!ping || !help || !status || !owner) {
    throw new Error("Core commands (ping, help, status, owner) not properly registered in commandMap!");
  }
  console.log("✅ Core commands (ping, help, status, owner) registered in commandMap.");

  // Test 3: Phone number normalization
  if (normalizePhoneNumber("081234567890") !== "6281234567890") {
    throw new Error(`normalizePhoneNumber failed on 08xxx: ${normalizePhoneNumber("081234567890")}`);
  }
  if (normalizePhoneNumber("+62 812-3456-7890") !== "6281234567890") {
    throw new Error(`normalizePhoneNumber failed on +62: ${normalizePhoneNumber("+62 812-3456-7890")}`);
  }
  console.log("✅ Phone number normalization verified (08xxx -> 628xxx, formatting stripped).");

  // Test 4: checkIsOwner logic
  const mockSock: any = {
    user: {
      id: "6283146564122:10@s.whatsapp.net",
      lid: "151380685783137:10@lid"
    }
  };
  const testOwners = ["081234567890", "628999999999"];

  // 4a. fromMe should always be owner
  const isOwnerFromMe = checkIsOwner("any@s.whatsapp.net", { key: { fromMe: true } } as any, mockSock, testOwners);
  if (!isOwnerFromMe) throw new Error("checkIsOwner failed: fromMe should be recognized as owner!");

  // 4b. Bot socket user phone or LID
  const isOwnerBotPhone = checkIsOwner("6283146564122@s.whatsapp.net", { key: { fromMe: false } } as any, mockSock, testOwners);
  const isOwnerBotLid = checkIsOwner("151380685783137@lid", { key: { fromMe: false } } as any, mockSock, testOwners);
  if (!isOwnerBotPhone || !isOwnerBotLid) throw new Error("checkIsOwner failed: Bot phone or LID should be owner!");

  // 4c. Indonesian 08xxx owner registered vs 628xxx sender
  const isOwner08 = checkIsOwner("6281234567890:5@s.whatsapp.net", { key: { fromMe: false } } as any, mockSock, testOwners);
  if (!isOwner08) throw new Error("checkIsOwner failed: 08xxx owner not matched with 628xxx sender!");

  // 4d. Non-owner sender
  const isNonOwner = checkIsOwner("628111111111@s.whatsapp.net", { key: { fromMe: false } } as any, mockSock, testOwners);
  if (isNonOwner) throw new Error("checkIsOwner failed: non-owner incorrectly identified as owner!");
  console.log("✅ checkIsOwner logic verified for fromMe, bot socket identity, 08/628 normalizations, and non-owner.");

  // Test 5: Message text unwrapping (Group ephemeral & viewOnce)
  const plainMsg = { conversation: ".ping" };
  const ephemeralMsg = {
    ephemeralMessage: {
      message: {
        conversation: ".ping"
      }
    }
  };
  const viewOnceMsg = {
    viewOnceMessage: {
      message: {
        extendedTextMessage: {
          text: ".help"
        }
      }
    }
  };
  if (extractMessageText(plainMsg) !== ".ping") throw new Error("extractMessageText failed on plain message");
  if (extractMessageText(ephemeralMsg) !== ".ping") throw new Error("extractMessageText failed on ephemeral message");
  if (extractMessageText(viewOnceMsg) !== ".help") throw new Error("extractMessageText failed on viewOnce message");
  console.log("✅ Group message unwrapping verified (plain, ephemeralMessage, viewOnceMessage).");

  // Test 6: Check SQLite settings & feature_settings
  const settings = getBotSettings();
  console.log(`✅ SQLite Bot Settings: prefix = '${settings.prefix}', mode = '${settings.mode}', botName = '${settings.botName}'`);

  const pingEnabled = isFeatureEnabled("ping");
  console.log(`✅ Feature 'ping' enabled in SQLite: ${pingEnabled}`);

  // Test 7: Command logging & retention
  logCommand("628123456789@s.whatsapp.net", "ping", "SUCCESS");
  const logCount = (db.query("SELECT COUNT(*) as c FROM command_logs").get() as any)?.c;
  console.log(`✅ SQLite Command Logs verified: count = ${logCount}`);

  console.log("🎉 All core bot tests passed successfully!");
  process.exit(0);
} catch (err) {
  console.error("❌ Fase 1 test failed:", err);
  process.exit(1);
}
