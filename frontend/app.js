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

// Everything rendered via innerHTML that comes from the API (file names, CSV
// cell values, validation messages) is user-controlled and must be escaped.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _errorsButton(jobId) {
  return `<button class="errors-btn" data-action="errors" data-jobid="${esc(jobId)}">Errors</button>`;
}

function updateJobRow(job) {
  const row = document.querySelector(`tr[data-jobid="${CSS.escape(job.pk)}"]`);
  if (!row) return;

  const badge = row.querySelector('.badge');
  if (badge) {
    badge.className = `badge badge-${esc(job.status)}`;
    badge.textContent = job.status;
  }

  const rowsCell = row.querySelector('[data-cell="rows"]');
  if (rowsCell) {
    const failed = _num(job.failedRows);
    rowsCell.innerHTML = `${_num(job.processedRows)}/${_num(job.totalRows)}` +
      (failed ? ` <span style="color:#dc2626">(${failed} failed)</span>` : '');
  }

  const actionsCell = row.querySelector('[data-cell="actions"]');
  if (actionsCell && !actionsCell.querySelector('.errors-btn') && (job.failedRows || 0) > 0) {
    actionsCell.innerHTML = _errorsButton(job.pk);
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

function _failedRowHtml(r) {
  return `<tr>
    <td style="font-family:monospace">${_num(r.rowIndex)}</td>
    <td style="font-family:monospace;word-break:break-all">${esc(JSON.stringify(r.data))}</td>
    <td class="err-msg">${esc((r.errors || []).join(', '))}</td>
  </tr>`;
}

async function _fetchFailedRows(jobId, cursor) {
  const qs = new URLSearchParams({ failed: 'true' });
  if (cursor) qs.set('cursor', cursor);
  const res = await fetch(`${API_BASE}/jobs/${jobId}/rows?${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { rows: data.rows || [], nextCursor: data.nextCursor || null };
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
    const { rows, nextCursor } = await _fetchFailedRows(jobId);

    const tr = document.createElement('tr');
    tr.id = 'errors-' + jobId;
    tr.className = 'errors-row';
    tr.innerHTML = `<td colspan="7">
      <div class="errors-inner">
        <strong style="color:#991b1b" class="errors-count"></strong>
        <table style="margin-top:.5rem">
          <thead><tr><th>#</th><th>Data</th><th>Errors</th></tr></thead>
          <tbody>
            ${rows.length === 0
              ? '<tr><td colspan="3" style="color:#999">No failed rows found.</td></tr>'
              : rows.map(_failedRowHtml).join('')}
          </tbody>
        </table>
        <button class="load-more-btn" style="margin-top:.5rem">Load more</button>
      </div>
    </td>`;

    const tbody = tr.querySelector('tbody');
    const countEl = tr.querySelector('.errors-count');
    const moreBtn = tr.querySelector('.load-more-btn');
    let shown = rows.length;
    let cursor = nextCursor;

    const refresh = () => {
      countEl.textContent = `${shown} failed row(s) shown${cursor ? ' — more available' : ''}`;
      moreBtn.style.display = cursor ? '' : 'none';
    };

    moreBtn.addEventListener('click', async () => {
      moreBtn.disabled = true;
      moreBtn.textContent = 'Loading…';
      try {
        const page = await _fetchFailedRows(jobId, cursor);
        tbody.insertAdjacentHTML('beforeend', page.rows.map(_failedRowHtml).join(''));
        shown += page.rows.length;
        cursor = page.nextCursor;
        moreBtn.textContent = 'Load more';
      } catch (e) {
        moreBtn.textContent = 'Error — retry';
      } finally {
        moreBtn.disabled = false;
        refresh();
      }
    });

    refresh();
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
      const short = esc(job.pk.slice(0, 8));
      const failed = _num(job.failedRows);
      return `<tr data-jobid="${esc(job.pk)}">
        <td>
          <span class="job-id" data-action="copy" data-jobid="${esc(job.pk)}" id="wrap-${short}">
            ${short}…
            <span class="tooltip" id="tip-${short}">Click to copy</span>
          </span>
        </td>
        <td>${esc(job.filename || '—')}</td>
        <td>${esc(job.schemaType || '—')}</td>
        <td><span class="badge badge-${esc(job.status)}">${esc(job.status)}</span></td>
        <td data-cell="rows">${_num(job.processedRows)}/${_num(job.totalRows)}${failed ? ` <span style="color:#dc2626">(${failed} failed)</span>` : ''}</td>
        <td>${esc(new Date(job.createdAt).toLocaleString())}</td>
        <td data-cell="actions">${failed > 0 ? _errorsButton(job.pk) : ''}</td>
      </tr>`;
    }).join('');

    // restart polling for any still-active jobs
    jobs
      .filter(j => !TERMINAL.has(j.status))
      .forEach(j => startPolling(j.pk));

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626">Error loading jobs: ${esc(e.message)}</td></tr>`;
  }
}

// Job IDs are passed through data attributes instead of inline onclick
// strings, so no API value is ever evaluated as JavaScript.
document.getElementById('jobs-tbody').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'errors') toggleErrors(el.dataset.jobid, el);
  else if (el.dataset.action === 'copy') copyJobId(el.dataset.jobid);
});

initAuth();
