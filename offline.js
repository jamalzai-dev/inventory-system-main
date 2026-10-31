const retry = document.querySelector('#retry'), status = document.querySelector('#status');
let pending = false;
async function reconnect() {
  if (pending) return;
  pending = true; retry.disabled = true;
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    if (response.ok || response.status === 401) { location.replace(response.status === 401 ? '/login' : '/'); return; }
    throw new Error();
  } catch { status.textContent = 'Server is still unreachable. Try again. / سرور ته لاسرسی نشته. بیا هڅه وکړئ.'; }
  finally { pending = false; retry.disabled = false; }
}
retry.addEventListener('click', reconnect);
window.addEventListener('online', reconnect);
