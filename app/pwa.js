import { button, text } from './ui.js';

export async function initializePwa(container, canUpdate) {
  if (!globalThis.isSecureContext || !('serviceWorker' in navigator)) return null;
  let registration, requested = false;
  const applyUpdate = () => {
    if (!canUpdate()) { container.replaceChildren(text('finishBeforeUpdate'), button('updateApp', applyUpdate)); return; }
    if (!registration.waiting) { location.reload(); return; } // Another tab may already have activated it.
    requested = true; registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  };
  const showUpdate = () => {
    if (!registration.waiting) return;
    container.replaceChildren(text('updateAvailable'), button('updateApp', applyUpdate));
    container.hidden = false;
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!requested) return;
    requested = false;
    if (canUpdate()) location.reload(); else { container.replaceChildren(text('finishBeforeUpdate'), button('updateApp', () => { if (canUpdate()) location.reload(); })); }
  });
  try {
    registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });
    showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
    });
    let lastCheck = Date.now();
    window.addEventListener('focus', () => { if (Date.now() - lastCheck > 3600000) { lastCheck = Date.now(); void registration.update().catch(() => {}); } });
    return registration;
  } catch { return null; }
}
