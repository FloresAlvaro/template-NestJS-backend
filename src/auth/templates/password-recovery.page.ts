import { createHash } from 'node:crypto';

const script = `
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
const resetting = /^[a-f0-9]{64}$/.test(token || '');
document.getElementById('title').textContent = resetting ? 'Nueva contraseña' : 'Recuperar contraseña';
document.getElementById('email-field').hidden = resetting;
document.getElementById('password-field').hidden = !resetting;
document.getElementById('email').required = !resetting;
document.getElementById('password').required = resetting;
document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('submit');
  const message = document.getElementById('message');
  button.disabled = true;
  message.textContent = 'Procesando…';
  try {
    const response = await fetch(resetting ? '/api/auth/reset-password' : '/api/auth/forgot-password', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resetting ? { token, newPassword: document.getElementById('password').value } : { email: document.getElementById('email').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join('. ') : result.message || 'No se pudo completar la solicitud');
    message.textContent = resetting ? 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' : result.message;
    document.getElementById('password').value = '';
    if (resetting) document.getElementById('form').hidden = true;
  } catch (error) {
    message.textContent = error.message || 'Error de conexión. Vuelve a intentarlo.';
  } finally { button.disabled = false; }
});`;

export const recoveryCsp = `default-src 'none'; script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
export const recoveryPage = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recuperar contraseña · Tienda</title>
<style>body{font:16px system-ui,sans-serif;background:#f3f5f8;color:#172033;margin:0;padding:24px}main{max-width:440px;margin:8vh auto;padding:32px;background:white;border-radius:16px}label{display:block;margin:20px 0}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;font:inherit}button{background:#2548b8;color:white;border:0;border-radius:8px;cursor:pointer}button:disabled{opacity:.6}p{line-height:1.5}#message{overflow-wrap:anywhere}</style></head>
<body><main><h1 id="title">Recuperar contraseña</h1><p>Solicita un enlace por correo o establece tu nueva contraseña desde el enlace recibido.</p>
<form id="form"><label id="email-field">Correo electrónico<input id="email" type="email" maxlength="254" autocomplete="email" required></label>
<label id="password-field" hidden>Nueva contraseña (12–128 caracteres)<input id="password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label>
<button id="submit" type="submit">Continuar</button></form><p id="message" role="status" aria-live="polite"></p>
<noscript>Activa JavaScript para completar la recuperación.</noscript></main><script>${script}</script></body></html>`;
