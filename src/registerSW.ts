// Registers the service worker (production builds only — kept off in dev so it
// never fights Vite's HMR) and shows a small "new version available" banner
// that updates only when the user chooses to, so an in-progress analysis is
// never reloaded out from under them.

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let wantsReload = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when the user asked to update (avoids a reload on first install).
    if (wantsReload) window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const offerUpdate = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) {
          showUpdateBanner(() => { wantsReload = true; worker.postMessage({ type: 'SKIP_WAITING' }); });
        }
      };
      if (reg.waiting) offerUpdate(reg.waiting);           // update already downloaded on a prior visit
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed') offerUpdate(nw);
        });
      });
    }).catch(() => { /* registration is best-effort */ });
  });
}

// A subtle top bar that reflects connectivity + background-sync state:
//   • offline  — working from cached data (and how many edits are queued)
//   • syncing  — replaying queued offline edits after reconnect
//   • synced   — brief confirmation, then it disappears
// On reconnect it flushes the write outbox so offline changes reach the server.
export function initBackgroundSync(
  flush: () => Promise<{ synced: number; dropped: number; remaining: number }>,
  pendingCount: () => Promise<number>,
): void {
  if (typeof window === 'undefined') return;
  let syncing = false;
  const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`;
  const isOffline = () => navigator.onLine === false; // read fresh (avoids stale narrowing)

  const setBar = (kind: 'offline' | 'syncing' | 'synced' | null, text?: string) => {
    let bar = document.getElementById('pwa-status-bar');
    if (!kind) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pwa-status-bar';
      bar.setAttribute('role', 'status');
      document.body.appendChild(bar);
    }
    const bg = kind === 'offline' ? '#b45309' : kind === 'syncing' ? '#1d4ed8' : '#15803d';
    bar.style.cssText =
      `position:fixed;left:0;right:0;top:0;z-index:99998;background:${bg};color:#fff;` +
      'text-align:center;padding:5px 8px;font:13px system-ui,Arial,sans-serif;letter-spacing:.2px;';
    bar.textContent = text ?? '';
  };

  const showOffline = async () => {
    const n = await pendingCount().catch(() => 0);
    setBar('offline', 'Offline — working from cached data' + (n > 0 ? ` · ${plural(n)} will sync when you reconnect` : ''));
  };

  const doSync = async () => {
    if (syncing) return;
    if (isOffline()) { showOffline(); return; }
    const n = await pendingCount().catch(() => 0);
    if (n === 0) { setBar(null); return; }
    syncing = true;
    setBar('syncing', `Syncing ${plural(n)}…`);
    let res = { synced: 0, dropped: 0, remaining: n };
    try { res = await flush(); } catch { /* keep queued */ }
    syncing = false;
    if (isOffline()) { showOffline(); return; }
    if (res.remaining === 0) {
      setBar('synced', 'All changes synced ✓');
      setTimeout(() => { if (!syncing && !isOffline()) setBar(null); }, 2500);
    } else {
      setBar('syncing', `${plural(res.remaining)} pending…`);
      setTimeout(doSync, 15000); // transient server issue — retry shortly
    }
  };

  window.addEventListener('offline', () => showOffline());
  window.addEventListener('online', () => doSync());
  if (isOffline()) showOffline(); else doSync();
}

function showUpdateBanner(onReload: () => void): void {
  if (document.getElementById('pwa-update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'pwa-update-banner';
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;' +
    'background:#1e293b;color:#fff;padding:10px 14px;border-radius:10px;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;align-items:center;gap:12px;' +
    'font:14px system-ui,Arial,sans-serif;';

  const msg = document.createElement('span');
  msg.textContent = 'A new version is available.';

  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.style.cssText = 'background:#0EA5E9;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;';
  reload.onclick = () => { reload.disabled = true; reload.textContent = 'Updating…'; onReload(); };

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.style.cssText = 'background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:16px;line-height:1;';
  dismiss.onclick = () => bar.remove();

  bar.append(msg, reload, dismiss);
  document.body.appendChild(bar);
}
