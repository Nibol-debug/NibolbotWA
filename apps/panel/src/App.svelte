<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const API = import.meta.env.VITE_API_URL || '';

  // Auth State (P1)
  let isAuthenticated = $state(false);
  let loginUser = $state('');
  let loginPass = $state('');
  let loginError = $state('');
  let isLoggingIn = $state(false);

  // Live bot data from polling
  let activeQR = $state<string | null>(null);
  let connectedPhone = $state<string | null>(null);
  let botUptime = $state(0);

  let statusPollId: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    const token = localStorage.getItem('nibolbot_token');
    if (token) {
      isAuthenticated = true;
      fetchInitialData();
      startStatusPolling();
    }
  });

  onDestroy(() => {
    if (statusPollId) clearInterval(statusPollId);
  });

  function startStatusPolling() {
    if (statusPollId) clearInterval(statusPollId);
    statusPollId = setInterval(pollBotStatus, 3000);
  }

  async function pollBotStatus() {
    try {
      const res = await fetch(`${API}/api/bot/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status) botStatus = data.status;
      if (data.pairingCode) pairingCode = data.pairingCode;
      if (data.qr) activeQR = data.qr; else activeQR = null;
      if (data.phone) connectedPhone = data.phone;
      if (data.uptime != null) botUptime = data.uptime;
    } catch { /* API offline */ }
  }

  function formatUptime(sec: number): string {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
  }

  async function fetchInitialData() {
    await pollBotStatus();
    await fetchSettings();
    await fetchFeatures();
    await fetchGroups();
    await fetchBlacklist();
    await fetchLogs();
    await fetchStats();
    await fetchCacheInfo();
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`${API}/api/settings`);
      if (!res.ok) return;
      const s = await res.json();
      if (s.bot_name) settings.botName = s.bot_name;
      if (s.prefix) settings.prefix = s.prefix;
      if (s.mode) settings.mode = s.mode;
      if (s.owners) settings.owners = Array.isArray(s.owners) ? s.owners.join('\n') : s.owners;
      if (s.sticker_pack) settings.stickerPack = s.sticker_pack;
      if (s.sticker_author) settings.stickerAuthor = s.sticker_author;
      if (s.newsletter_jid) settings.newsletterJid = s.newsletter_jid;
      if (s.channel_name) settings.channelName = s.channel_name;
      if (s.allow_pm !== undefined) settings.allowPm = s.allow_pm;
      if (s.cache_ttl_minutes) cacheTtl = Number(s.cache_ttl_minutes);
      if (s.cache_max_mb) maxCacheLimit = Number(s.cache_max_mb);
    } catch { /* API offline */ }
  }

  async function fetchFeatures() {
    try {
      const res = await fetch(`${API}/api/features`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        features = data.map((f: any) => {
          const cfg = typeof f.config === 'string' ? JSON.parse(f.config) : f.config;
          return {
            id: f.feature,
            name: f.feature,
            category: cfg.category || 'system',
            enabled: f.enabled === 1,
            cooldown: cfg.cooldown ?? 10,
            limitPerDay: cfg.limitPerDay ?? 20,
            maxDuration: cfg.maxDuration ?? 0,
            desc: cfg.description || ''
          };
        });
      }
    } catch { /* API offline */ }
  }

  async function fetchGroups() {
    try {
      const res = await fetch(`${API}/api/groups`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        groups = data.map((g: any) => {
          const cfg = typeof g.config === 'string' ? JSON.parse(g.config) : (g.config || {});
          return {
            jid: g.jid,
            name: g.name || g.jid,
            enabled: g.banned !== 1,
            cooldown: cfg.cooldown ?? 15,
            welcome: cfg.welcome ?? false,
            welcomeMsg: cfg.welcomeMsg || ''
          };
        });
      }
    } catch { /* API offline */ }
  }

  async function fetchBlacklist() {
    try {
      const res = await fetch(`${API}/api/users/blacklist`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        blacklistedUsers = data.map((u: any) => ({
          jid: u.jid,
          reason: 'Blacklisted',
          date: ''
        }));
      }
    } catch { /* API offline */ }
  }

  async function fetchLogs() {
    try {
      const res = await fetch(`${API}/api/logs`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.commands) {
        commandLogs = data.commands.map((l: any) => ({
          id: l.id,
          ts: l.ts || '',
          user: l.user || '',
          cmd: l.command || '',
          status: l.status || '',
          dur: ''
        }));
      }
    } catch { /* API offline */ }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API}/api/stats`);
      if (!res.ok) return;
      const data = await res.json();
      todayCommands = data.todayCommands || 0;
      topFeatures = data.topFeatures || [];
      if (data.memoryUsage != null) ramUsage = data.memoryUsage;
    } catch { /* API offline */ }
  }

  async function requestPair(mode: 'qr' | 'code') {
    try {
      const body = mode === 'code' ? { phone: pairingNumber } : {};
      const res = await fetch(`${API}/api/bot/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        showToast(mode === 'code' ? 'Menunggu pairing code dari Baileys...' : 'QR Code sedang di-generate...');
      }
    } catch {
      showToast('Gagal menghubungi bot service');
    }
  }

  async function handleLogoutBot() {
    try {
      await fetch(`${API}/api/bot/logout`, { method: 'POST' });
      botStatus = 'disconnected';
      activeQR = null;
      connectedPhone = null;
      showToast('Sesi WhatsApp diputus & session dihapus');
    } catch {
      showToast('Gagal logout dari bot service');
    }
  }

  async function handleLogin(e?: Event) {
    if (e) e.preventDefault();
    loginError = '';
    isLoggingIn = true;

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('nibolbot_token', data.token);
        isAuthenticated = true;
        fetchInitialData();
        startStatusPolling();
        showToast('👋 Selamat datang kembali, ' + loginUser + '!');
      } else {
        loginError = data.message || 'Username atau password salah.';
      }
    } catch {
      loginError = 'Gagal terhubung ke API server. Pastikan server API berjalan.';
    } finally {
      isLoggingIn = false;
    }
  }

  function handleLogout() {
    if (statusPollId) clearInterval(statusPollId);
    localStorage.removeItem('nibolbot_token');
    isAuthenticated = false;
    showToast('Berhasil keluar dari panel');
  }

  // Svelte 5 runes for dashboard
  let activeTab = $state('koneksi');
  let toastMessage = $state('');
  let isSaving = $state(false);

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      toastMessage = '';
    }, 3000);
  }

  // P2: Bot Connection State
  let botStatus = $state<'online' | 'pairing' | 'disconnected'>('disconnected');
  let pairingNumber = $state('628');
  let pairingCode = $state('');
  let showQR = $state(false);

  // P3: General Settings State
  let settings = $state({
    botName: 'nibolbot',
    prefix: '.',
    mode: 'public', // 'public' | 'owner'
    owners: '6281234567890\n6289876543210',
    stickerPack: 'nibolbot.my.id',
    stickerAuthor: 'by @nibol',
    newsletterJid: '',
    channelName: 'Nibolbot Updates',
    allowPm: true
  });

  // P4: Features State
  let features = $state<any[]>([]);

  // P5 & P6: Groups and Blacklist State
  let groups = $state<any[]>([]);

  let blacklistInput = $state('');
  let blacklistedUsers = $state<any[]>([]);

  async function addBlacklist() {
    if (!blacklistInput.trim()) return;
    let clean = blacklistInput.trim().replace(/[^0-9@a-z\.]/gi, '');
    if (clean.startsWith('08')) {
      clean = '628' + clean.slice(2);
    }
    const cleanJid = clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
    try {
      await fetch(`${API}/api/users/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: cleanJid })
      });
      blacklistedUsers = [...blacklistedUsers, { jid: cleanJid, reason: 'Manual blacklist', date: '' }];
      blacklistInput = '';
      showToast(`Nomor ${cleanJid.split('@')[0]} berhasil diblokir`);
    } catch {
      showToast('❌ Gagal menambah blacklist');
    }
  }

  async function removeBlacklist(jid: string) {
    try {
      await fetch(`${API}/api/users/blacklist/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      blacklistedUsers = blacklistedUsers.filter(u => u.jid !== jid);
      showToast('Pengguna dihapus dari daftar blokir');
    } catch {
      showToast('❌ Gagal menghapus blacklist');
    }
  }

  // P7: Logs State
  let commandLogs = $state<any[]>([]);

  // P8: Stats State
  let todayCommands = $state(0);
  let topFeatures = $state<any[]>([]);
  let ramUsage = $state(0);

  // P9: Cache State
  let cacheSize = $state(0);
  let cacheTtl = $state(30);
  let maxCacheLimit = $state(300);

  async function handleSaveSettings() {
    isSaving = true;
    try {
      const normalizedOwners = settings.owners
        .split('\n')
        .map((s: string) => {
          let clean = s.trim().replace(/[^0-9]/g, '');
          if (clean.startsWith('08')) {
            clean = '628' + clean.slice(2);
          } else if (clean.startsWith('0') && clean.length > 9) {
            clean = '62' + clean.slice(1);
          }
          return clean || s.trim();
        })
        .filter(Boolean);

      await fetch(`${API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_name: settings.botName,
          prefix: settings.prefix,
          mode: settings.mode,
          owners: normalizedOwners,
          sticker_pack: settings.stickerPack,
          sticker_author: settings.stickerAuthor,
          newsletter_jid: settings.newsletterJid ? settings.newsletterJid.trim() : '',
          channel_name: settings.channelName,
          allow_pm: settings.allowPm,
          cache_ttl_minutes: cacheTtl,
          cache_max_mb: maxCacheLimit
        })
      });
      // Update local view with normalized numbers
      settings.owners = normalizedOwners.join('\n');
      showToast('✅ Pengaturan berhasil disimpan!');
    } catch {
      showToast('❌ Gagal menyimpan pengaturan');
    } finally {
      isSaving = false;
    }
  }

  async function handleSaveFeature(feat: any) {
    try {
      await fetch(`${API}/api/features/${feat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: feat.enabled,
          config: {
            cooldown: feat.cooldown,
            limitPerDay: feat.limitPerDay,
            maxDuration: feat.maxDuration,
            category: feat.category,
            description: feat.desc
          }
        })
      });
      showToast(`✅ Fitur ${feat.id} berhasil diupdate!`);
    } catch {
      showToast('❌ Gagal menyimpan fitur');
    }
  }

  let editingGroup = $state<any | null>(null);

  function startEditGroup(grp: any) {
    editingGroup = { ...grp };
  }

  function cancelEditGroup() {
    editingGroup = null;
  }

  async function handleSaveGroupSettings() {
    if (!editingGroup) return;
    try {
      await fetch(`${API}/api/groups/${encodeURIComponent(editingGroup.jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGroup.name,
          banned: !editingGroup.enabled,
          config: {
            cooldown: Number(editingGroup.cooldown) || 15,
            welcome: !!editingGroup.welcome,
            welcomeMsg: editingGroup.welcomeMsg || "Halo @user, selamat datang!"
          }
        })
      });
      const idx = groups.findIndex(g => g.jid === editingGroup.jid);
      if (idx !== -1) {
        groups[idx] = { ...editingGroup };
      }
      showToast(`✅ Pengaturan grup ${editingGroup.name} berhasil disimpan!`);
      editingGroup = null;
    } catch {
      showToast('❌ Gagal menyimpan pengaturan grup');
    }
  }

  async function handleDeleteGroup(jid: string) {
    if (!confirm('Yakin ingin menghapus grup ini dari database bot?')) return;
    try {
      await fetch(`${API}/api/groups/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      groups = groups.filter(g => g.jid !== jid);
      if (editingGroup?.jid === jid) editingGroup = null;
      showToast('Grup berhasil dihapus dari daftar');
    } catch {
      showToast('❌ Gagal menghapus grup');
    }
  }

  // Admin Change Password State
  let oldPass = $state('');
  let newPass = $state('');
  let confirmPass = $state('');
  let isChangingPass = $state(false);

  async function handleChangePassword() {
    if (!oldPass || !newPass) {
      showToast('❌ Harap isi kata sandi lama dan baru');
      return;
    }
    if (newPass !== confirmPass) {
      showToast('❌ Konfirmasi kata sandi baru tidak cocok');
      return;
    }
    if (newPass.length < 6) {
      showToast('❌ Kata sandi baru minimal 6 karakter');
      return;
    }

    isChangingPass = true;
    try {
      const token = localStorage.getItem('nibol_token');
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Kata sandi admin berhasil diubah!');
        oldPass = '';
        newPass = '';
        confirmPass = '';
      } else {
        showToast(`❌ ${data.message || 'Gagal mengubah kata sandi'}`);
      }
    } catch {
      showToast('❌ Terjadi kesalahan jaringan');
    } finally {
      isChangingPass = false;
    }
  }

  async function fetchCacheInfo() {
    try {
      const res = await fetch(`${API}/api/cache/info`);
      if (res.ok) {
        const data = await res.json();
        if (data.sizeMb !== undefined) cacheSize = data.sizeMb;
      }
    } catch {}
  }

  async function handleToggleGroup(grp: any) {
    const newStatus = !grp.enabled;
    try {
      await fetch(`${API}/api/groups/${encodeURIComponent(grp.jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: grp.name,
          banned: !newStatus,
          config: {
            cooldown: grp.cooldown,
            welcome: grp.welcome,
            welcomeMsg: grp.welcomeMsg
          }
        })
      });
      grp.enabled = newStatus;
      showToast(`Status grup ${grp.name} diperbarui: ${newStatus ? 'Aktif' : 'Diblokir'}`);
    } catch {
      showToast('❌ Gagal memperbarui status grup');
    }
  }

  async function handleClearCache() {
    try {
      await fetch(`${API}/api/cache/clear`, { method: 'POST' });
      cacheSize = 0;
      await fetchCacheInfo();
      showToast('🗑️ Cache berhasil dibersihkan!');
    } catch {
      showToast('❌ Gagal membersihkan cache');
    }
  }

  async function handleRestartBot() {
    try {
      await fetch(`${API}/api/bot/restart`, { method: 'POST' });
      showToast('🔄 Bot sedang di-restart...');
    } catch {
      showToast('❌ Gagal restart bot');
    }
  }
</script>

<!-- TOAST NOTIFICATION -->
{#if toastMessage}
  <div class="toast-container">
    <div class="nb-card toast-box">
      {toastMessage}
    </div>
  </div>
{/if}

{#if !isAuthenticated}
  <!-- LOGIN PAGE (P1) -->
  <div class="login-wrapper">
    <div class="nb-card login-card">
      <div class="login-header">
        <div class="login-logo-row">
          <span class="login-logo">🤖</span>
          <h1 class="login-title">nibolbot</h1>
        </div>
        <span class="nb-badge nb-badge-green">ADMIN AUTHENTICATION</span>
        <p class="login-desc">Masuk untuk mengelola bot WhatsApp, fitur, grup, dan pengaturan cache.</p>
      </div>

      {#if loginError}
        <div class="login-error-box">
          ⚠️ {loginError}
        </div>
      {/if}

      <form onsubmit={handleLogin} class="login-form">
        <div class="form-group">
          <label for="username-field" class="input-label">Username:</label>
          <input
            id="username-field"
            type="text"
            class="nb-input"
            bind:value={loginUser}
            placeholder="Username admin"
            required
          />
        </div>

        <div class="form-group">
          <label for="password-field" class="input-label">Password:</label>
          <input
            id="password-field"
            type="password"
            class="nb-input"
            bind:value={loginPass}
            placeholder="Password"
            required
          />
        </div>

        <button type="submit" class="nb-btn nb-btn-primary login-btn" disabled={isLoggingIn}>
          {isLoggingIn ? 'Memeriksa...' : '🚀 Masuk ke Panel'}
        </button>
      </form>
    </div>
  </div>
{:else}
  <!-- DASHBOARD MAIN -->
  <div class="panel-layout">
    <!-- TOP NAVBAR -->
    <header class="nb-navbar">
      <div class="brand-section">
        <div class="logo-box">
          <span class="logo-icon">🤖</span>
          <span class="logo-title">nibolbot</span>
        </div>
        <span class="nb-badge nb-badge-green">ADMIN PANEL</span>
      </div>

      <!-- Live System Stats Pill -->
      <div class="system-stats-bar">
        <div class="stat-pill">
          <span class="stat-label">WA BOT:</span>
          {#if botStatus === 'online'}
            <span class="status-dot green"></span>
            <strong class="text-green">ONLINE</strong>
          {:else if botStatus === 'pairing'}
            <span class="status-dot yellow"></span>
            <strong class="text-yellow">PAIRING</strong>
          {:else}
            <span class="status-dot red"></span>
            <strong class="text-red">OFFLINE</strong>
          {/if}
        </div>

        <div class="stat-pill hide-mobile">
          <span class="stat-label">RAM API:</span>
          <strong>{ramUsage > 0 ? `${ramUsage} MB` : 'Memuat...'}</strong>
        </div>

        <div class="stat-pill hide-mobile">
          <span class="stat-label">CACHE:</span>
          <strong>{cacheSize.toFixed(1)} MB / {maxCacheLimit} MB</strong>
        </div>

        <div class="stat-pill user-pill">
          <span class="stat-label">OWNER:</span>
          <strong>{loginUser}</strong>
        </div>
      </div>

      <div class="header-actions">
        <button class="nb-btn nb-btn-light quick-btn" onclick={handleClearCache} title="Bersihkan file sementara /tmp">
          🗑️ Clear Cache
        </button>
        <button class="nb-btn nb-btn-primary quick-btn" onclick={handleRestartBot} title="Restart Baileys connection">
          🔄 Restart
        </button>
        <button class="nb-btn nb-btn-danger quick-btn" onclick={handleLogout} title="Keluar dari akun admin">
          🚪 Logout
        </button>
      </div>
    </header>

    <!-- MAIN CONTAINER -->
    <div class="content-wrapper">
      <!-- NAVIGATION TABS -->
      <nav class="tabs-nav">
        <button
          class="tab-btn {activeTab === 'koneksi' ? 'active' : ''}"
          onclick={() => (activeTab = 'koneksi')}
        >
          <span class="tab-icon">🔌</span>
          <span class="tab-text">Koneksi Bot</span>
        </button>

        <button
          class="tab-btn {activeTab === 'umum' ? 'active' : ''}"
          onclick={() => (activeTab = 'umum')}
        >
          <span class="tab-icon">⚙️</span>
          <span class="tab-text">Pengaturan Umum</span>
        </button>

        <button
          class="tab-btn {activeTab === 'fitur' ? 'active' : ''}"
          onclick={() => (activeTab = 'fitur')}
        >
          <span class="tab-icon">⚡</span>
          <span class="tab-text">Fitur & Plugin</span>
        </button>

        <button
          class="tab-btn {activeTab === 'grup' ? 'active' : ''}"
          onclick={() => (activeTab = 'grup')}
        >
          <span class="tab-icon">👥</span>
          <span class="tab-text">Grup & Pengguna</span>
        </button>

        <button
          class="tab-btn {activeTab === 'log' ? 'active' : ''}"
          onclick={() => (activeTab = 'log')}
        >
          <span class="tab-icon">📊</span>
          <span class="tab-text">Log & Statistik</span>
        </button>

        <button
          class="tab-btn {activeTab === 'cache' ? 'active' : ''}"
          onclick={() => (activeTab = 'cache')}
        >
          <span class="tab-icon">💾</span>
          <span class="tab-text">Cache & Storage</span>
        </button>
      </nav>

      <!-- TAB 1: KONEKSI BOT -->
      {#if activeTab === 'koneksi'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Koneksi WhatsApp Bot</h2>
              <p class="section-desc">Hubungkan nomor WhatsApp bot menggunakan Pairing Code atau QR Code Baileys.</p>
            </div>
            <div class="badge-group">
              <span class="nb-badge nb-badge-green">BAILEYS MULTI-DEVICE</span>
            </div>
          </div>

          <div class="grid-2col">
            <!-- Connection Status Card -->
            <div class="nb-card nb-card-hover">
              <div class="card-title-row">
                <h3>Status Koneksi Saat Ini</h3>
                <span class="nb-badge {botStatus === 'online' ? 'nb-badge-green' : botStatus === 'pairing' ? 'nb-badge-yellow' : 'nb-badge-red'}">
                  {botStatus === 'online' ? 'CONNECTED' : botStatus === 'pairing' ? 'PAIRING...' : 'DISCONNECTED'}
                </span>
              </div>

              <div class="status-details-list">
                <div class="status-row">
                  <span class="label">Nomor Bot Terhubung:</span>
                  <span class="nb-code">{connectedPhone ? `+${connectedPhone}` : 'Belum terhubung'}</span>
                </div>
                <div class="status-row">
                  <span class="label">Uptime Sesi:</span>
                  <strong>{formatUptime(botUptime)}</strong>
                </div>
                <div class="status-row">
                  <span class="label">Status Baileys:</span>
                  <span class="text-green font-bold">{botStatus === 'online' ? '✅ Aktif' : botStatus === 'pairing' ? '🔄 Menunggu Pairing' : '❌ Offline'}</span>
                </div>
              </div>

              <div class="card-action-bar">
                {#if botStatus === 'online'}
                  <button class="nb-btn nb-btn-light" onclick={handleLogoutBot}>
                    ⛔ Putuskan Sesi
                  </button>
                {/if}
                <button class="nb-btn nb-btn-primary" onclick={handleRestartBot}>
                  🔄 Restart Socket
                </button>
              </div>
            </div>

            <!-- Pairing Code Card -->
            <div class="nb-card nb-card-hover">
              <div class="card-title-row">
                <h3>Pairing WhatsApp Baru</h3>
                <div class="segmented-control">
                  <button
                    class="seg-btn {!showQR ? 'active' : ''}"
                    onclick={() => (showQR = false)}
                  >
                    Pairing Code
                  </button>
                  <button
                    class="seg-btn {showQR ? 'active' : ''}"
                    onclick={() => (showQR = true)}
                  >
                    QR Code
                  </button>
                </div>
              </div>

              {#if !showQR}
                <div class="pairing-form">
                  <label for="phone-input" class="input-label">Masukkan Nomor WhatsApp Bot (Awali 62):</label>
                  <div class="input-action-group">
                    <input
                      id="phone-input"
                      type="text"
                      class="nb-input"
                      bind:value={pairingNumber}
                      placeholder="6281234567890"
                    />
                    <button
                      class="nb-btn nb-btn-primary"
                      onclick={() => requestPair('code')}
                    >
                      Dapatkan Kode
                    </button>
                  </div>

                  {#if pairingCode}
                    <div class="pairing-code-display">
                      <span class="code-sub">Masukkan kode ini di WhatsApp → Perangkat Tertaut:</span>
                      <div class="code-box">
                        {pairingCode}
                      </div>
                      <span class="code-timer">⏱️ Kedaluwarsa dalam 120 detik</span>
                    </div>
                  {:else if botStatus === 'pairing'}
                    <div class="pairing-code-display">
                      <span class="code-sub">⏳ Menunggu kode dari Baileys...</span>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="qr-section">
                  <button
                    class="nb-btn nb-btn-primary"
                    onclick={() => requestPair('qr')}
                    style="margin-bottom: 1rem;"
                  >
                    🔄 Generate QR Code
                  </button>

                  {#if activeQR}
                    <div class="qr-display">
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={encodeURIComponent(activeQR)}"
                        alt="WhatsApp QR Code"
                        class="qr-image"
                      />
                      <p class="qr-instruction">Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat &gt; Scan QR</p>
                    </div>
                  {:else if botStatus === 'pairing'}
                    <div class="qr-placeholder">
                      <div class="qr-mock">
                        <span class="qr-label">⏳ Menunggu QR dari Baileys...</span>
                      </div>
                    </div>
                  {:else}
                    <div class="qr-placeholder">
                      <div class="qr-mock">
                        <span class="qr-label">Klik tombol di atas untuk generate QR</span>
                      </div>
                      <p class="qr-instruction">Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat</p>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 2: PENGATURAN UMUM -->
      {#if activeTab === 'umum'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Pengaturan Umum Bot</h2>
              <p class="section-desc">Atur nama bot, prefix perintah, hak akses owner, dan identitas stiker.</p>
            </div>
            <button class="nb-btn nb-btn-primary" onclick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? 'Menyimpan...' : '💾 Simpan Perubahan'}
            </button>
          </div>

          <div class="nb-card form-card">
            <div class="form-grid">
              <div class="form-group">
                <label for="bot-name" class="input-label">Nama Bot:</label>
                <input id="bot-name" type="text" class="nb-input" bind:value={settings.botName} />
                <small class="helper-text">Ditampilkan pada judul pesan dan card.</small>
              </div>

              <div class="form-group">
                <label for="prefix-input" class="input-label">Command Prefix:</label>
                <input id="prefix-input" type="text" class="nb-input" bind:value={settings.prefix} />
                <small class="helper-text">Karakter awalan perintah (contoh: ., !, #)</small>
              </div>

              <div class="form-group full-width">
                <span class="input-label">Mode Akses Bot:</span>
                <div class="mode-selector">
                  <label class="mode-card {settings.mode === 'public' ? 'selected' : ''}">
                    <input type="radio" bind:group={settings.mode} value="public" />
                    <div>
                      <strong>🌍 Mode Publik (Semua Pengguna)</strong>
                      <p>Bot merespon perintah dari semua anggota grup dan chat pribadi sesuai limit.</p>
                    </div>
                  </label>
                  <label class="mode-card {settings.mode === 'owner' ? 'selected' : ''}">
                    <input type="radio" bind:group={settings.mode} value="owner" />
                    <div>
                      <strong>🔒 Mode Owner Saja</strong>
                      <p>Hanya nomor yang terdaftar di daftar owner yang dapat menjalankan perintah.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="form-group full-width">
                <span class="input-label">Akses Chat Pribadi (PM / Jalur Pribadi):</span>
                <div class="mode-selector">
                  <label class="mode-card {settings.allowPm ? 'selected' : ''}">
                    <input type="radio" bind:group={settings.allowPm} value={true} />
                    <div>
                      <strong>💬 Izinkan Chat Pribadi & Grup</strong>
                      <p>Semua pengguna dapat menggunakan bot lewat pesan pribadi (PM) maupun grup.</p>
                    </div>
                  </label>
                  <label class="mode-card {!settings.allowPm ? 'selected' : ''}">
                    <input type="radio" bind:group={settings.allowPm} value={false} />
                    <div>
                      <strong>👥 Khusus Grup Saja (Tolak PM)</strong>
                      <p>Pengguna biasa tidak bisa menggunakan bot lewat chat pribadi. Bot hanya merespon di dalam grup (kecuali Owner).</p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="form-group full-width">
                <label for="owner-list" class="input-label">Daftar Nomor Owner (Satu nomor per baris):</label>
                <textarea id="owner-list" class="nb-textarea" rows="3" bind:value={settings.owners}></textarea>
                <small class="helper-text">Format: 08xxx atau 628xxx atau ID LID grup. Nomor owner memiliki akses bypass limit dan mode khusus owner.</small>
              </div>

              <div class="form-group">
                <label for="sticker-pack" class="input-label">Nama Sticker Pack:</label>
                <input id="sticker-pack" type="text" class="nb-input" bind:value={settings.stickerPack} />
              </div>

              <div class="form-group">
                <label for="sticker-author" class="input-label">Nama Sticker Author:</label>
                <input id="sticker-author" type="text" class="nb-input" bind:value={settings.stickerAuthor} />
              </div>

              <div class="form-group">
                <label for="newsletter-jid" class="input-label">WhatsApp Saluran / Newsletter JID (Opsional B9):</label>
                <input id="newsletter-jid" type="text" class="nb-input" bind:value={settings.newsletterJid} />
                <small class="helper-text">Header "Diteruskan dari Saluran". Kosongkan jika pesan biasa.</small>
              </div>

              <div class="form-group">
                <label for="channel-name" class="input-label">Nama Saluran WhatsApp:</label>
                <input id="channel-name" type="text" class="nb-input" bind:value={settings.channelName} />
              </div>
            </div>
          </div>

          <!-- Card Ubah Password Admin -->
          <div class="nb-card form-card mt-4">
            <div class="card-title-row">
              <h3>🔐 Ubah Kata Sandi Admin Panel</h3>
            </div>
            <p class="section-desc mb-3">Ganti kata sandi login panel untuk menjaga keamanan akses administrator.</p>

            <div class="form-grid">
              <div class="form-group">
                <label for="old-pass" class="input-label">Kata Sandi Lama:</label>
                <input id="old-pass" type="password" class="nb-input" bind:value={oldPass} placeholder="Masukkan kata sandi lama" />
              </div>

              <div class="form-group">
                <label for="new-pass" class="input-label">Kata Sandi Baru:</label>
                <input id="new-pass" type="password" class="nb-input" bind:value={newPass} placeholder="Minimal 6 karakter" />
              </div>

              <div class="form-group">
                <label for="confirm-pass" class="input-label">Konfirmasi Kata Sandi Baru:</label>
                <input id="confirm-pass" type="password" class="nb-input" bind:value={confirmPass} placeholder="Ulangi kata sandi baru" />
              </div>

              <div class="form-group" style="display:flex;align-items:flex-end">
                <button class="nb-btn nb-btn-primary" onclick={handleChangePassword} disabled={isChangingPass}>
                  {isChangingPass ? 'Menyimpan...' : '🔐 Perbarui Kata Sandi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 3: FITUR & PLUGIN -->
      {#if activeTab === 'fitur'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Katalog Fitur & Plugin</h2>
              <p class="section-desc">Nyalakan/matikan fitur, atur cooldown anti-spam, dan batas kuota harian.</p>
            </div>
            <button class="nb-btn nb-btn-light" onclick={fetchFeatures}>
              🔄 Muat Ulang
            </button>
          </div>

          <div class="features-grid">
            {#if features.length === 0}
              <div class="nb-card empty-state-box">
                <p>⏳ Memuat plugin & fitur dari bot...</p>
              </div>
            {:else}
              {#each features as feat}
                <div class="nb-card feature-card {feat.enabled ? 'feat-active' : 'feat-inactive'}">
                  <div class="feature-header">
                    <div>
                      <h3 class="feat-name">{feat.name}</h3>
                      <p class="feat-desc">{feat.desc}</p>
                    </div>
                    <label class="switch">
                      <input type="checkbox" bind:checked={feat.enabled} />
                      <span class="slider"></span>
                    </label>
                  </div>

                  <div class="feature-config-box">
                    <div class="config-item">
                      <label for="cd-{feat.id}">Cooldown (detik):</label>
                      <input id="cd-{feat.id}" type="number" class="nb-input nb-input-sm" bind:value={feat.cooldown} />
                    </div>

                    <div class="config-item">
                      <label for="limit-{feat.id}">Limit Harian / User:</label>
                      <input id="limit-{feat.id}" type="number" class="nb-input nb-input-sm" bind:value={feat.limitPerDay} />
                    </div>

                    {#if feat.maxDuration > 0}
                      <div class="config-item">
                        <label for="dur-{feat.id}">Maks Durasi (menit):</label>
                        <input id="dur-{feat.id}" type="number" class="nb-input nb-input-sm" bind:value={feat.maxDuration} />
                      </div>
                    {/if}
                  </div>

                  <div class="feature-footer">
                    <span class="nb-badge nb-badge-green">KATEGORI: {feat.category}</span>
                    <button class="nb-btn nb-btn-primary table-btn" onclick={() => handleSaveFeature(feat)}>
                      💾 Simpan
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- TAB 4: GRUP & PENGGUNA -->
      {#if activeTab === 'grup'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Kelola Grup WhatsApp & Blacklist</h2>
              <p class="section-desc">Atur fitur per grup dan kelola pengguna yang diblokir dari bot.</p>
            </div>
          </div>

          <!-- Groups Table -->
          <div class="nb-card mb-4">
            <div class="card-title-row">
              <h3>Daftar Grup WhatsApp Terdaftar</h3>
              <span class="nb-badge nb-badge-green">{groups.length} Grup Terpantau</span>
            </div>

            <div class="table-responsive">
              <table class="nb-table">
                <thead>
                  <tr>
                    <th>Nama Grup</th>
                    <th>ID Grup (JID)</th>
                    <th>Status Bot</th>
                    <th>Cooldown</th>
                    <th>Welcome Msg</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {#if groups.length === 0}
                    <tr>
                      <td colspan="6" class="empty-table-row">Belum ada grup terdaftar. Bot otomatis mencatat saat menerima pesan dari grup.</td>
                    </tr>
                  {:else}
                    {#each groups as grp}
                      <tr>
                        <td><strong>{grp.name}</strong></td>
                        <td><span class="nb-code">{grp.jid}</span></td>
                        <td>
                          <span class="nb-badge {grp.enabled ? 'nb-badge-green' : 'nb-badge-red'}">
                            {grp.enabled ? 'AKTIF' : 'DIBLOKIR'}
                          </span>
                        </td>
                        <td>{grp.cooldown} detik</td>
                        <td>{grp.welcome ? '✅ Nyala' : '❌ Mati'}</td>
                        <td style="display:flex;gap:6px;flex-wrap:wrap">
                          <button
                            class="nb-btn nb-btn-primary table-btn"
                            onclick={() => startEditGroup(grp)}
                            title="Edit pengaturan grup & welcome"
                          >
                            ⚙️ Edit
                          </button>
                          <button
                            class="nb-btn nb-btn-light table-btn"
                            onclick={() => handleToggleGroup(grp)}
                          >
                            {grp.enabled ? 'Blokir' : 'Buka'}
                          </button>
                          <button
                            class="nb-btn nb-btn-danger table-btn"
                            onclick={() => handleDeleteGroup(grp.jid)}
                            title="Hapus grup dari database"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>

          {#if editingGroup}
            <div class="nb-card mb-4" style="border: 3px solid var(--green-primary); background: #f0fdf4;">
              <div class="card-title-row">
                <h3>⚙️ Pengaturan Grup: {editingGroup.name}</h3>
                <button class="nb-btn nb-btn-light table-btn" onclick={cancelEditGroup}>✕ Tutup</button>
              </div>
              <p class="section-desc mb-3">Atur pesan sambutan (welcome message), cooldown perintah, dan status bot untuk grup ini.</p>

              <div class="form-grid">
                <div class="form-group">
                  <label for="grp-name-input" class="input-label">Nama Grup:</label>
                  <input id="grp-name-input" type="text" class="nb-input" bind:value={editingGroup.name} />
                </div>

                <div class="form-group">
                  <label for="grp-cd-input" class="input-label">Cooldown Antara Perintah (detik):</label>
                  <input id="grp-cd-input" type="number" min="0" max="300" class="nb-input" bind:value={editingGroup.cooldown} />
                  <small class="helper-text">Mencegah spam perintah dari anggota grup.</small>
                </div>

                <div class="form-group full-width">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    <input type="checkbox" id="welcome-toggle" style="width:20px;height:20px;accent-color:var(--green-primary)" bind:checked={editingGroup.welcome} />
                    <label for="welcome-toggle" class="input-label" style="margin:0;cursor:pointer">
                      <strong>Aktifkan Pesan Sambutan Otomatis (Auto Welcome)</strong>
                    </label>
                  </div>
                  <small class="helper-text">Bot akan otomatis menyapa anggota baru yang masuk ke grup ini.</small>
                </div>

                {#if editingGroup.welcome}
                  <div class="form-group full-width">
                    <label for="grp-welcome-msg" class="input-label">Teks Pesan Sambutan:</label>
                    <textarea id="grp-welcome-msg" class="nb-textarea" rows="3" bind:value={editingGroup.welcomeMsg} placeholder="Halo @user, selamat datang di grup!"></textarea>
                    <small class="helper-text">Gunakan <code>@user</code> untuk menyebut nama anggota baru secara otomatis.</small>
                  </div>
                {/if}

                <div class="form-group full-width" style="display:flex;gap:10px;margin-top:10px">
                  <button class="nb-btn nb-btn-primary" onclick={handleSaveGroupSettings}>
                    💾 Simpan Pengaturan Grup
                  </button>
                  <button class="nb-btn nb-btn-light" onclick={cancelEditGroup}>
                    Batal
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Blacklist Section -->
          <div class="nb-card">
            <div class="card-title-row">
              <h3>Blacklist Pengguna</h3>
              <span class="nb-badge nb-badge-red">{blacklistedUsers.length} Diblokir</span>
            </div>

            <div class="blacklist-input-row">
              <input
                type="text"
                class="nb-input"
                bind:value={blacklistInput}
                placeholder="Masukkan nomor HP pengguna (contoh: 628123456789)"
              />
              <button class="nb-btn nb-btn-danger" onclick={addBlacklist}>
                🚫 Tambah ke Blacklist
              </button>
            </div>

            <div class="table-responsive">
              <table class="nb-table">
                <thead>
                  <tr>
                    <th>JID Pengguna</th>
                    <th>Alasan Pemblokiran</th>
                    <th>Tanggal</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {#if blacklistedUsers.length === 0}
                    <tr>
                      <td colspan="4" class="empty-table-row">Tidak ada pengguna dalam daftar blokir.</td>
                    </tr>
                  {:else}
                    {#each blacklistedUsers as user}
                      <tr>
                        <td><span class="nb-code">{user.jid}</span></td>
                        <td>{user.reason}</td>
                        <td>{user.date}</td>
                        <td>
                          <button
                            class="nb-btn nb-btn-light table-btn"
                            onclick={() => removeBlacklist(user.jid)}
                          >
                            Buka Blokir
                          </button>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 5: LOG & STATISTIK -->
      {#if activeTab === 'log'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Log Perintah & Statistik</h2>
              <p class="section-desc">Pantau 200 aktivitas perintah terakhir dan error log secara real-time.</p>
            </div>
            <button class="nb-btn nb-btn-light" onclick={() => { fetchLogs(); fetchStats(); showToast('Log diperbarui'); }}>
              🔄 Segarkan Log
            </button>
          </div>

          <!-- Metric Stat Cards -->
          <div class="stats-grid">
            <div class="nb-card stat-card">
              <span class="stat-number">{todayCommands.toLocaleString()}</span>
              <span class="stat-caption">Perintah Hari Ini</span>
            </div>
            {#each topFeatures.slice(0, 3) as tf}
              <div class="nb-card stat-card">
                <span class="stat-number">{tf.count?.toLocaleString() || 0}</span>
                <span class="stat-caption">{tf.feature || tf.command || 'Unknown'}</span>
                <span class="stat-sub">Top Command</span>
              </div>
            {/each}
          </div>

          <!-- Logs Table -->
          <div class="nb-card">
            <div class="card-title-row">
              <h3>200 Aktivitas Perintah Terakhir (SQLite command_logs)</h3>
              <span class="nb-badge nb-badge-green">LIVE MONITOR</span>
            </div>

            <div class="table-responsive">
              <table class="nb-table font-mono">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Pengguna</th>
                    <th>Perintah</th>
                    <th>Status</th>
                    <th>Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {#if commandLogs.length === 0}
                    <tr>
                      <td colspan="5" class="empty-table-row">Belum ada riwayat aktivitas perintah.</td>
                    </tr>
                  {:else}
                    {#each commandLogs as log}
                      <tr>
                        <td>{log.ts}</td>
                        <td>{log.user}</td>
                        <td><strong>{log.cmd}</strong></td>
                        <td>
                          <span class="nb-badge {log.status === 'SUCCESS' ? 'nb-badge-green' : 'nb-badge-red'}">
                            {log.status}
                          </span>
                        </td>
                        <td>{log.dur}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 6: CACHE & STORAGE -->
      {#if activeTab === 'cache'}
        <div class="tab-pane">
          <div class="section-header">
            <div>
              <h2>Penyimpanan & Manajemen Cache (P9 & Bagian 13 PRD)</h2>
              <p class="section-desc">Pantau alokasi storage VPS 10 GB dan bersihkan cache media otomatis.</p>
            </div>
            <button class="nb-btn nb-btn-danger" onclick={handleClearCache}>
              🗑️ Bersihkan Seluruh Cache Sekarang
            </button>
          </div>

          <div class="grid-2col">
            <!-- Storage Budget Card -->
            <div class="nb-card">
              <h3>Alokasi Disk VPS (Total 10 GB)</h3>
              <p class="helper-text mb-3">Sesuai anggaran storage PRD Seksi 13.</p>

              <div class="storage-bar-wrapper">
                <div class="storage-bar">
                  <div class="storage-segment os" style="width: 35%;" title="OS & Docker (3.5 GB)"></div>
                  <div class="storage-segment bun" style="width: 8%;" title="Bun & node_modules (0.8 GB)"></div>
                  <div class="storage-segment cache" style="width: 5%;" title="Media Cache (0.5 GB)"></div>
                  <div class="storage-segment free" style="width: 52%;" title="Sisa Cadangan (5.2 GB)"></div>
                </div>
                <div class="storage-legend">
                  <span><span class="dot dot-os"></span> OS & Docker (3.5 GB)</span>
                  <span><span class="dot dot-bun"></span> Node/Bun & Deps (0.8 GB)</span>
                  <span><span class="dot dot-cache"></span> Media Cache (0.5 GB)</span>
                  <span><span class="dot dot-free"></span> Sisa Cadangan (±5.2 GB)</span>
                </div>
              </div>

              <div class="status-details-list mt-3">
                <div class="status-row">
                  <span>Aplikasi & DB SQLite:</span>
                  <strong>&lt; 50 MB (Memenuhi target &lt; 100 MB)</strong>
                </div>
                <div class="status-row">
                  <span>Direktori Media Temp:</span>
                  <span class="nb-code">/tmp/nibolbot/</span>
                </div>
                <div class="status-row">
                  <span>Ukuran Cache Saat Ini:</span>
                  <strong class="text-green">{cacheSize.toFixed(1)} MB</strong>
                </div>
              </div>
            </div>

            <!-- Cache Policy Card -->
            <div class="nb-card">
              <h3>Pengaturan Kebijakan Cache</h3>
              <p class="helper-text mb-3">Otomatis menghapus file unduhan audio/video setelah durasi tertentu.</p>

              <div class="form-group mb-3">
                <label for="ttl-slider" class="input-label">TTL Cache Media (Menit): <strong>{cacheTtl} Menit</strong></label>
                <input id="ttl-slider" type="range" min="5" max="120" step="5" class="range-slider" bind:value={cacheTtl} />
                <small class="helper-text">File yang lebih lama dari {cacheTtl} menit akan otomatis dihapus.</small>
              </div>

              <div class="form-group mb-3">
                <label for="limit-slider" class="input-label">Batas Maksimum Cache: <strong>{maxCacheLimit} MB</strong></label>
                <input id="limit-slider" type="range" min="100" max="500" step="50" class="range-slider" bind:value={maxCacheLimit} />
                <small class="helper-text">Jika cache melebihi {maxCacheLimit} MB, job download baru akan ditolak demi keamanan disk.</small>
              </div>

              <button class="nb-btn nb-btn-primary full-width-btn" onclick={handleSaveSettings}>
                Simpan Konfigurasi Cache
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* LOGIN PAGE STYLES */
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background-color: var(--bg-main);
  }

  .login-card {
    max-width: 440px;
    width: 100%;
    padding: 2.25rem;
    box-shadow: var(--hard-shadow-lg);
  }

  .login-header {
    text-align: center;
    margin-bottom: 1.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .login-logo-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .login-logo {
    font-size: 2.2rem;
  }

  .login-title {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .login-desc {
    font-size: 0.88rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .login-error-box {
    background: var(--accent-red);
    color: var(--accent-red-dark);
    border: 2px solid var(--border-color);
    padding: 0.65rem 0.85rem;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.85rem;
    margin-bottom: 1rem;
    box-shadow: var(--hard-shadow-sm);
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .login-btn {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    margin-top: 0.5rem;
  }

  /* PANEL LAYOUT */
  .panel-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-main);
  }

  /* TOP NAVBAR */
  .nb-navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 2rem;
    background: #ffffff;
    border-bottom: var(--border-width) solid var(--border-color);
    box-shadow: 0 4px 0px rgba(13, 31, 20, 0.06);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .brand-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .logo-icon {
    font-size: 1.6rem;
  }

  .logo-title {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text-main);
  }

  .system-stats-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .stat-pill {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    padding: 0.35rem 0.75rem;
    background: var(--bg-card-muted);
    border: 2px solid var(--border-color);
    border-radius: 6px;
    box-shadow: var(--hard-shadow-sm);
  }

  .user-pill {
    background: var(--green-light);
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .status-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--border-color);
  }

  .status-dot.green { background: #22c55e; }
  .status-dot.yellow { background: #eab308; }
  .status-dot.red { background: #ef4444; }

  .text-green { color: #15803d; }
  .text-yellow { color: #854d0e; }
  .text-red { color: #b91c1c; }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .quick-btn {
    padding: 0.45rem 0.9rem;
    font-size: 0.85rem;
  }

  /* TOAST NOTIFICATION */
  .toast-container {
    position: fixed;
    top: 5rem;
    right: 2rem;
    z-index: 100;
    animation: slideIn 0.2s ease-out;
  }

  .toast-box {
    background: #ffffff;
    border-left: 6px solid var(--green-primary);
    padding: 0.8rem 1.4rem;
    font-weight: 700;
  }

  @keyframes slideIn {
    from { transform: translateX(50px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  /* CONTENT AREA */
  .content-wrapper {
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 1.5rem 4rem;
    flex: 1;
  }

  /* TABS NAVIGATION */
  .tabs-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
    border-bottom: var(--border-width) solid var(--border-color);
    padding-bottom: 1rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-main);
    font-size: 0.95rem;
    font-weight: 700;
    padding: 0.65rem 1.1rem;
    background: #ffffff;
    border: var(--border-width) solid var(--border-color);
    border-radius: 6px;
    box-shadow: var(--hard-shadow-sm);
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .tab-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: var(--hard-shadow);
  }

  .tab-btn.active {
    background: var(--green-primary);
    color: #ffffff;
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0px var(--shadow-color);
  }

  /* SECTION HEADERS */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .section-header h2 {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-main);
  }

  .section-desc {
    font-size: 0.95rem;
    color: var(--text-muted);
  }

  .badge-group {
    display: flex;
    gap: 0.5rem;
  }

  /* GRIDS & CARDS */
  .grid-2col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 1.5rem;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.2rem;
    padding-bottom: 0.6rem;
    border-bottom: 2px dashed #cbd5e1;
  }

  .card-title-row h3 {
    font-size: 1.15rem;
    font-weight: 700;
  }

  .status-details-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.95rem;
  }

  .status-row .label {
    color: var(--text-muted);
  }

  .card-action-bar {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  /* PAIRING FORM */
  .pairing-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .input-label {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-main);
  }

  .input-action-group {
    display: flex;
    gap: 0.5rem;
  }

  .pairing-code-display {
    margin-top: 1rem;
    padding: 1.25rem;
    background: var(--bg-card-muted);
    border: 2px solid var(--border-color);
    border-radius: 6px;
    text-align: center;
  }

  .code-sub {
    font-size: 0.85rem;
    color: var(--text-muted);
    display: block;
    margin-bottom: 0.5rem;
  }

  .code-box {
    font-family: var(--font-mono);
    font-size: 2.2rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--green-dark);
    background: #ffffff;
    border: var(--border-width) solid var(--border-color);
    padding: 0.5rem 1rem;
    display: inline-block;
    border-radius: 6px;
    box-shadow: var(--hard-shadow-sm);
  }

  .code-timer {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .segmented-control {
    display: flex;
    border: 2px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
  }

  .seg-btn {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 700;
    background: #ffffff;
    border: none;
    cursor: pointer;
  }

  .seg-btn.active {
    background: var(--green-primary);
    color: #ffffff;
  }

  .qr-placeholder {
    text-align: center;
    padding: 1rem;
  }

  .qr-mock {
    width: 180px;
    height: 180px;
    margin: 0 auto 1rem;
    border: var(--border-width) solid var(--border-color);
    box-shadow: var(--hard-shadow);
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .qr-label {
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--accent-yellow);
    padding: 0.2rem 0.5rem;
    border: 1.5px solid var(--border-color);
  }

  .qr-instruction {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .qr-section {
    text-align: center;
    padding: 1rem;
  }

  .qr-display {
    text-align: center;
  }

  .qr-image {
    border: var(--border-width) solid var(--border-color);
    box-shadow: var(--hard-shadow);
    border-radius: 6px;
    margin-bottom: 0.75rem;
  }

  .nb-badge-yellow {
    background: #fef3c7;
    color: #92400e;
    border-color: var(--border-color);
  }

  /* FORMS */
  .form-card {
    padding: 2rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .helper-text {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .mode-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
    margin-top: 0.4rem;
  }

  .mode-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border: 2px solid var(--border-color);
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
    box-shadow: var(--hard-shadow-sm);
  }

  .mode-card.selected {
    background: var(--green-light);
    border-color: var(--green-primary);
  }

  /* FEATURES GRID */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
  }

  .feature-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .feature-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .feat-name {
    font-size: 1.1rem;
    font-weight: 700;
  }

  .feat-desc {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .feature-config-box {
    background: var(--bg-card-muted);
    border: 1.5px solid var(--border-color);
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .nb-input-sm {
    width: 80px;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
  }

  .feature-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1.5px solid #e2e8f0;
    padding-top: 0.75rem;
  }

  /* SWITCH TOGGLE */
  .switch {
    position: relative;
    display: inline-block;
    width: 46px;
    height: 26px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #cbd5e1;
    border: 2px solid var(--border-color);
    border-radius: 20px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    border: 2px solid var(--border-color);
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: var(--green-primary);
  }

  input:checked + .slider:before {
    transform: translateX(18px);
  }

  /* TABLES */
  .table-responsive {
    overflow-x: auto;
  }

  .nb-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5rem;
  }

  .nb-table th, .nb-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1.5px solid var(--border-color);
    font-size: 0.9rem;
  }

  .nb-table th {
    background: var(--bg-card-muted);
    font-weight: 700;
    color: var(--text-main);
  }

  .table-btn {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
  }

  .empty-table-row {
    text-align: center;
    padding: 2.5rem 1rem !important;
    color: var(--text-muted);
    font-style: italic;
  }

  .empty-state-box {
    grid-column: 1 / -1;
    padding: 2.5rem;
    text-align: center;
    color: var(--text-muted);
    font-weight: 600;
  }

  .blacklist-input-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .blacklist-input-row .nb-input {
    flex: 1 1 240px;
  }

  /* KEYBOARD ACCESSIBILITY (R-32) */
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  .switch input:focus-visible + .slider {
    outline: 3px solid var(--green-primary);
    outline-offset: 2px;
  }

  /* STATS CARDS */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-number {
    font-size: 2.2rem;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text-main);
  }

  .stat-caption {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .stat-sub, .stat-growth {
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* STORAGE BAR */
  .storage-bar-wrapper {
    margin-bottom: 1.5rem;
  }

  .storage-bar {
    height: 28px;
    width: 100%;
    border: var(--border-width) solid var(--border-color);
    border-radius: 6px;
    box-shadow: var(--hard-shadow-sm);
    display: flex;
    overflow: hidden;
  }

  .storage-segment.os { background: #64748b; }
  .storage-segment.bun { background: #38bdf8; }
  .storage-segment.cache { background: var(--green-primary); }
  .storage-segment.free { background: #ffffff; }

  .storage-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid var(--border-color);
    margin-right: 0.35rem;
  }

  .dot-os { background: #64748b; }
  .dot-bun { background: #38bdf8; }
  .dot-cache { background: var(--green-primary); }
  .dot-free { background: #ffffff; }

  .range-slider {
    width: 100%;
    accent-color: var(--green-primary);
  }

  .full-width-btn {
    width: 100%;
    margin-top: 1rem;
  }

  .mb-3 { margin-bottom: 0.75rem; }
  .mb-4 { margin-bottom: 1.5rem; }
  .mt-3 { margin-top: 0.75rem; }

  @media (max-width: 768px) {
    .hide-mobile { display: none; }
    .nb-navbar { padding: 0.75rem 1rem; }
    .content-wrapper { padding: 1rem 0.75rem 3rem; }
    .tabs-nav { overflow-x: auto; flex-wrap: nowrap; }
  }
</style>
