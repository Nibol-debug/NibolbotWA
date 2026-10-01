import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

console.log("🔧 Running patch-baileys...");

// 1. Find messages-send.js in node_modules
try {
  const findCmd = 'find /app/node_modules -name "messages-send.js" 2>/dev/null';
  const paths = execSync(findCmd).toString().trim().split("\n").filter(Boolean);

  for (const filePath of paths) {
    let content = readFileSync(filePath, "utf8");
    let changed = false;

    // Patch: Detect LID participants in group and encode them with 'lid' instead of 's.whatsapp.net'
    const targetOld = "if (!participant) {\n                    const participantsList = (groupData && !isStatus) ? groupData.participants.map(p => p.id) : [];";
    if (content.includes(targetOld)) {
      const replacement = `let participantsUseLid = false;
                if (!participant) {
                    const participantsList = (groupData && !isStatus) ? groupData.participants.map(p => p.id) : [];
                    participantsUseLid = participantsList.some(p => p && p.endsWith("@lid"));`;
      content = content.replace(targetOld, replacement);
      changed = true;
    }

    const encodeOld = "isLid ? 'lid' : 's.whatsapp.net', d.device";
    if (content.includes(encodeOld)) {
      content = content.replaceAll(encodeOld, "(isLid || participantsUseLid) ? 'lid' : 's.whatsapp.net', d.device");
      changed = true;
    }

    const loopOld = "const jid = (0, WABinary_1.jidEncode)(user, isLid ? 'lid' : 's.whatsapp.net', device);";
    if (content.includes(loopOld)) {
      content = content.replaceAll(loopOld, "const jid = (0, WABinary_1.jidEncode)(user, (isLid || participantsUseLid) ? 'lid' : 's.whatsapp.net', device);");
      changed = true;
    }

    // Always include LID participants in senderKeyJids so they receive senderKeyDistributionMessage
    const senderKeyCheckOld = "if (!senderKeyMap[jid] || !!participant) {";
    if (content.includes(senderKeyCheckOld)) {
      content = content.replace(senderKeyCheckOld, "if (!senderKeyMap[jid] || !!participant || participantsUseLid) {");
      changed = true;
    }

    if (changed) {
      writeFileSync(filePath, content, "utf8");
      console.log(`✅ Patched messages-send.js at ${filePath}`);
    } else {
      console.log(`ℹ️ messages-send.js at ${filePath} already patched or pattern not found`);
    }
  }
} catch (e: any) {
  console.warn("⚠️ Failed patching messages-send.js:", e.message);
}

// 2. Patch libsignal session_cipher.js to auto-heal on Bad MAC / broken sessions
try {
  const findSignalCmd = 'find /app/node_modules -name "session_cipher.js" 2>/dev/null';
  const signalPaths = execSync(findSignalCmd).toString().trim().split("\n").filter(Boolean);

  for (const filePath of signalPaths) {
    let content = readFileSync(filePath, "utf8");
    let changed = false;

    // When all sessions fail with Bad MAC, delete the corrupted session record from storage
    // so that a PreKey Whisper Message can re-negotiate a clean session.
    const failPattern = 'throw new errors.SessionError("No matching sessions found for message");';
    if (content.includes(failPattern) && !content.includes("// AUTO-HEAL-BAD-MAC")) {
      const replacement = `// AUTO-HEAL-BAD-MAC: delete corrupted session so sender can re-key with prekey
        try {
            console.warn("[LIBSIGNAL-AUTOHEAL] Removing broken session record for:", this.addr.toString());
            await this.storage.removeSession(this.addr.toString());
        } catch (cleanupErr) {
            console.error("[LIBSIGNAL-AUTOHEAL] Failed removing broken session:", cleanupErr);
        }
        throw new errors.SessionError("No matching sessions found for message");`;
      content = content.replace(failPattern, replacement);
      changed = true;
    }

    if (changed) {
      writeFileSync(filePath, content, "utf8");
      console.log(`✅ Patched session_cipher.js at ${filePath}`);
    } else {
      console.log(`ℹ️ session_cipher.js at ${filePath} already patched or pattern not found`);
    }
  }
} catch (e: any) {
  console.warn("⚠️ Failed patching session_cipher.js:", e.message);
}

console.log("🎉 patch-baileys completed.");
