const form = document.querySelector('#login-form');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const submit = document.querySelector('#login-submit');
const label = document.querySelector('#submit-label');
const error = document.querySelector('#login-error');
const toggle = document.querySelector('#show-password');
toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'Hide' : 'Show';
  toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  toggle.setAttribute('aria-pressed', String(visible));
});
for (const input of [username, password]) input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  const missing = [username, password].filter(input => !input.value.trim());
  if (missing.length) {
    missing.forEach(input => input.setAttribute('aria-invalid', 'true'));
    error.textContent = 'Enter your username and password to continue.';
    error.hidden = false;
    missing[0].focus();
    return;
  }
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  label.textContent = 'Signing in…';
  try {
    const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!tokenResponse.ok) throw new Error();
    const { csrfToken } = await tokenResponse.json();
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ username: username.value.trim(), password: password.value })
    });
    if (response.ok) { location.replace('/'); return; }
    error.textContent = response.status === 401 ? 'The username or password is incorrect. Please try again.'
      : response.status === 429 ? 'Too many sign-in attempts. Please wait 15 minutes and try again.'
        : 'Sign-in is temporarily unavailable. Please try again.';
    error.hidden = false;
  } catch {
    error.textContent = 'Unable to connect. Check your connection and try again.';
    error.hidden = false;
  } finally {
    password.value = '';
    submit.disabled = false;
    form.removeAttribute('aria-busy');
    label.textContent = 'Sign in';
  }
});
