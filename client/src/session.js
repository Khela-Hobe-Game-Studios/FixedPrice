const SESSION_KEY = 'ek_daam_session';
const PID_KEY = 'ek_daam_pid';

// Durable per-device id. This is what the server keys scores, answers and bets
// off — socket ids change on every reconnect, so using them meant a player who
// backgrounded their phone came back as a stranger with a zeroed score.
// Kept separate from the session so it survives a session clear.
export function getPlayerId() {
  let pid = null;
  try { pid = localStorage.getItem(PID_KEY); } catch { /* private mode */ }
  if (!pid) {
    pid = (crypto.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try { localStorage.setItem(PID_KEY, pid); } catch { /* ignore */ }
  }
  return pid;
}

export function saveSession(data) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
