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

// A subtle bar that appears while the browser reports no connection, so users
// know analyses are running against cached data.
export function initOfflineIndicator(): void {
  if (typeof window === 'undefined') return;
  const render = () => {
    const offline = navigator.onLine === false;
    let bar = document.getElementById('pwa-offline-bar');
    if (offline && !bar) {
      bar = document.createElement('div');
      bar.id = 'pwa-offline-bar';
      bar.setAttribute('role', 'status');
      bar.textContent = 'Offline — working from cached data';
      bar.style.cssText =
        'position:fixed;left:0;right:0;top:0;z-index:99998;background:#b45309;color:#fff;' +
        'text-align:center;padding:5px 8px;font:13px system-ui,Arial,sans-serif;letter-spacing:.2px;';
      document.body.appendChild(bar);
    } else if (!offline && bar) {
      bar.remove();
    }
  };
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
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
