// ── Auth (Cognito PKCE) ───────────────────────────────────────────────────────
const COGNITO_DOMAIN    = window.COGNITO_DOMAIN    || '';
const COGNITO_CLIENT_ID = window.COGNITO_CLIENT_ID || '';
const REDIRECT_URI      = window.COGNITO_REDIRECT_URI || window.location.origin;

function _b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function _sha256(plain) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}
function _randomString(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return _b64url(arr);
}

async function login() {
  const verifier  = _randomString(64);
  const challenge = _b64url(await _sha256(verifier));
  sessionStorage.setItem('pkce_verifier', verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     COGNITO_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    scope:         'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

async function _exchangeCode(code) {
  const verifier = sessionStorage.getItem('pkce_verifier');
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     COGNITO_CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  });
  const tokens = await res.json();
  if (!res.ok || !tokens.id_token) {
    console.error('Token exchange failed', tokens);
    return;
  }
  sessionStorage.setItem('id_token',      tokens.id_token);
  sessionStorage.setItem('refresh_token', tokens.refresh_token || '');
  sessionStorage.removeItem('pkce_verifier');
}

function getIdToken() {
  return sessionStorage.getItem('id_token');
}

function _parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function logout() {
  sessionStorage.clear();
  if (COGNITO_DOMAIN) {
    window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
  } else {
    window.location.reload();
  }
}

async function initAuth() {
  // No Cognito configured (local dev without auth)
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    document.getElementById('login-wall').style.display = 'none';
    document.getElementById('auth-bar').style.display = 'none';
    document.querySelector('main').style.display = '';
    return;
  }

  // Handle callback with auth code
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  if (code) {
    await _exchangeCode(code);
    window.history.replaceState({}, '', window.location.pathname);
  }

  const token  = getIdToken();
  const claims = token ? _parseJwt(token) : null;
  const now    = Math.floor(Date.now() / 1000);

  if (claims && claims.exp > now) {
    // Logged in
    document.getElementById('user-email').textContent = claims.email || claims.sub;
    document.getElementById('auth-bar').style.display = 'flex';
    document.getElementById('login-wall').style.display = 'none';
    document.querySelector('main').style.display = '';
    loadJobs();
  } else {
    // Not logged in
    sessionStorage.removeItem('id_token');
    document.querySelector('main').style.display = 'none';
    document.getElementById('login-wall').style.display = 'block';
  }
}
// ── End Auth ──────────────────────────────────────────────────────────────────

let _toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show toast-${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

const API_BASE = window.DATAPIPE_API_URL || '';

function authHeaders() {
  const token = getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'PARTIAL_FAILURE']);
const activePolling = new Map(); // jobId → intervalId

function startPolling(jobId) {
  if (activePolling.has(jobId)) return;
  const id = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const job = await res.json();
      updateJobRow(job);
      if (TERMINAL.has(job.status)) stopPolling(jobId);
    } catch (_) { /* network hiccup, retry next tick */ }
  }, 2000);
  activePolling.set(jobId, id);
}

function stopPolling(jobId) {
  clearInterval(activePolling.get(jobId));
  activePolling.delete(jobId);
}

function updateJobRow(job) {
  const row = document.querySelector(`tr[data-jobid="${job.pk}"]`);
  if (!row) return;

  const badge = row.querySelector('.badge');
  if (badge) {
    badge.className = `badge badge-${job.status}`;
    badge.textContent = job.status;
  }

  const rowsCell = row.querySelector('[data-cell="rows"]');
  if (rowsCell) {
    const failed = job.failedRows || 0;
    rowsCell.innerHTML = `${job.processedRows || 0}/${job.totalRows || 0}` +
      (failed ? ` <span style="color:#dc2626">(${failed} failed)</span>` : '');
  }

  const actionsCell = row.querySelector('[data-cell="actions"]');
  if (actionsCell && !actionsCell.querySelector('.errors-btn') && (job.failedRows || 0) > 0) {
    actionsCell.innerHTML = `<button class="errors-btn" onclick="toggleErrors('${job.pk}', this)">Errors</button>`;
  }
}

async function uploadFile() {
  const fileInput = document.getElementById('file-input');
  const schemaSelect = document.getElementById('schema-select');
  const btn = document.getElementById('upload-btn');

  if (!fileInput.files.length) {
    showToast('Please select a file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('schemaType', schemaSelect.value);

  btn.disabled = true;
  btn.textContent = 'Uploading…';

  try {
    const res = await fetch(`${API_BASE}/jobs/upload`, { method: 'POST', headers: authHeaders(), body: formData });
    const data = await res.json();

    if (res.ok) {
      showToast('Job queued successfully', 'success');
      fileInput.value = '';
      await loadJobs();
      startPolling(data.jobId);
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (e) {
    showToast(`Network error: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

function copyJobId(id) {
  navigator.clipboard.writeText(id).catch(() => {});
  const el = document.getElementById('tip-' + id.slice(0, 8));
  if (el) { el.textContent = 'Copied!'; setTimeout(() => { el.textContent = 'Click to copy'; }, 1500); }
}

async function toggleErrors(jobId, btn) {
  const existingRow = document.getElementById('errors-' + jobId);
  if (existingRow) {
    existingRow.remove();
    btn.textContent = 'Errors';
    return;
  }

  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/rows?failed=true`, { headers: authHeaders() });
    const data = await res.json();
    const rows = data.rows || [];

    const tr = document.createElement('tr');
    tr.id = 'errors-' + jobId;
    tr.className = 'errors-row';
    tr.innerHTML = `<td colspan="7">
      <div class="errors-inner">
        <strong style="color:#991b1b">${rows.length} failed row(s) shown (max 50)</strong>
        <table style="margin-top:.5rem">
          <thead><tr><th>#</th><th>Data</th><th>Errors</th></tr></thead>
          <tbody>
            ${rows.length === 0
              ? '<tr><td colspan="3" style="color:#999">No failed rows found.</td></tr>'
              : rows.map(r => `<tr>
                  <td style="font-family:monospace">${r.rowIndex}</td>
                  <td style="font-family:monospace;word-break:break-all">${JSON.stringify(r.data)}</td>
                  <td class="err-msg">${(r.errors || []).join(', ')}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </td>`;

    btn.closest('tr').insertAdjacentElement('afterend', tr);
    btn.textContent = 'Hide';
  } catch (e) {
    btn.textContent = 'Error';
  } finally {
    btn.disabled = false;
  }
}

async function loadJobs() {
  const tbody = document.getElementById('jobs-tbody');

  // stop polling for all jobs — will restart for active ones below
  activePolling.forEach((_, jobId) => stopPolling(jobId));

  try {
    const res = await fetch(`${API_BASE}/jobs`, { headers: authHeaders() });
    const data = await res.json();
    const jobs = (data.jobs || []).filter(j => !j.pk.startsWith('etag#'));

    if (!jobs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:2rem">No jobs yet.</td></tr>';
      return;
    }

    tbody.innerHTML = jobs.map(job => {
      const short = job.pk.slice(0, 8);
      const hasErrors = (job.failedRows || 0) > 0;
      const failed = job.failedRows || 0;
      return `<tr data-jobid="${job.pk}">
        <td>
          <span class="job-id" onclick="copyJobId('${job.pk}')" id="wrap-${short}">
            ${short}…
            <span class="tooltip" id="tip-${short}">Click to copy</span>
          </span>
        </td>
        <td>${job.filename || '—'}</td>
        <td>${job.schemaType || '—'}</td>
        <td><span class="badge badge-${job.status}">${job.status}</span></td>
        <td data-cell="rows">${job.processedRows || 0}/${job.totalRows || 0}${failed ? ` <span style="color:#dc2626">(${failed} failed)</span>` : ''}</td>
        <td>${new Date(job.createdAt).toLocaleString()}</td>
        <td data-cell="actions">${hasErrors ? `<button class="errors-btn" onclick="toggleErrors('${job.pk}', this)">Errors</button>` : ''}</td>
      </tr>`;
    }).join('');

    // restart polling for any still-active jobs
    jobs
      .filter(j => !TERMINAL.has(j.status))
      .forEach(j => startPolling(j.pk));

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626">Error loading jobs: ${e.message}</td></tr>`;
  }
}

initAuth();
