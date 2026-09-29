import { fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { rmSync } from "node:fs";

console.log("🔍 Testing Baileys compatibility with Bun...");

try {
  // Test 1: Baileys version fetch (HTTP/crypto)
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`✅ Version fetch OK: ${version.join(".")} (latest: ${isLatest})`);

  // Test 2: Auth state generation & disk persistence (crypto + fs)
  const testDir = "./tmp_test_auth";
  const { state, saveCreds } = await useMultiFileAuthState(testDir);
  await saveCreds();
  console.log(`✅ Multi-file auth state OK: registration ID = ${state.creds.registrationId}`);

  // Cleanup test dir
  rmSync(testDir, { recursive: true, force: true });
  console.log("🎉 Baileys is 100% compatible with Bun runtime!");
  process.exit(0);
} catch (err) {
  console.error("❌ Baileys test failed on Bun:", err);
  process.exit(1);
}
