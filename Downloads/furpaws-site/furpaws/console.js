// Developer Console — six tools for testing frontend + backend.
// Access is gated the same way as other developer-only pages: the
// checks here are for UI/UX, but the REAL enforcement for the SQL
// tool is inside the run_admin_sql Postgres function itself (see
// sql/11_admin_sql_console.sql) — that holds even if this check were
// somehow bypassed. The other tabs (API tester, storage, JS
// scratchpad) call Supabase using the same anon key and RLS policies
// the rest of the site already uses, so they're bound by the exact
// same table-level permissions as everything else — nothing here
// grants access beyond what the developer role's RLS policies allow.

const loadingState = document.getElementById('loading-state');
const noAccessView = document.getElementById('no-access-view');
const consoleView = document.getElementById('console-view');
const logoutBtn = document.getElementById('logout-btn');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function checkAuthAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'staff-login.html'; return; }

  const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) {
    console.error('Could not determine assurance level:', aalError);
    window.location.href = 'staff-login.html';
    return;
  }
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    window.location.href = 'staff-login.html';
    return;
  }

  const { data: staffRow, error } = await supabaseClient
    .from('staff')
    .select('id, full_name, role, account_disabled')
    .eq('auth_user_id', session.user.id)
    .single();

  loadingState.hidden = true;

  if (error || !staffRow || staffRow.role !== 'developer') {
    revealPage();
    noAccessView.hidden = false;
    return;
  }

  // This is arguably the most sensitive page in the whole system —
  // check account_disabled here too, consistent with every other
  // protected page, rather than only checking role.
  if (staffRow.account_disabled) {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  revealPage();
  consoleView.hidden = false;
  initTabs();
}

function initTabs() {
  const group = document.getElementById('console-tabs');
  group.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      group.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.querySelectorAll('.dash-tab-panel').forEach(p => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    });
  });
}

function renderTable(data, outputEl) {
  if (!Array.isArray(data) || data.length === 0) {
    outputEl.innerHTML = `<div class="console-empty">No rows returned.</div>`;
    return;
  }
  const columns = Object.keys(data[0]);
  outputEl.innerHTML = `
    <table class="console-table">
      <thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>
        ${data.map(row => `<tr>${columns.map(c => `<td>${formatCell(row[c])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <p class="console-row-count">${data.length} row${data.length === 1 ? '' : 's'}</p>
  `;
}

function formatCell(value) {
  if (value === null || value === undefined) return '<span class="console-null">null</span>';
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(String(value));
}

function renderError(err, outputEl) {
  outputEl.innerHTML = `<div class="console-error">${escapeHtml(err.message || String(err))}</div>`;
}

// ============================================
// TAB 1: SQL CONSOLE
// ============================================

const consoleForm = document.getElementById('console-form');
const consoleQuery = document.getElementById('console-query');
const consoleOutput = document.getElementById('console-output');
const consoleRunBtn = document.getElementById('console-run-btn');

consoleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = consoleQuery.value.trim();
  if (!query) return;

  consoleRunBtn.disabled = true;
  consoleRunBtn.textContent = 'Running…';
  consoleOutput.innerHTML = `<div class="console-empty">Running…</div>`;

  const { data, error } = await supabaseClient.rpc('run_admin_sql', { query });

  consoleRunBtn.disabled = false;
  consoleRunBtn.textContent = 'Run query';

  if (error) { renderError(error, consoleOutput); return; }
  if (data && data.error) { renderError({ message: data.error }, consoleOutput); return; }
  renderTable(data, consoleOutput);
});

consoleQuery.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    consoleForm.requestSubmit();
  }
});

// ============================================
// TAB 2: API / REQUEST TESTER
// ============================================

const apiForm = document.getElementById('api-form');
const apiMethod = document.getElementById('api-method');
const apiTarget = document.getElementById('api-target');
const apiBody = document.getElementById('api-body');
const apiOutput = document.getElementById('api-output');
const apiRunBtn = document.getElementById('api-run-btn');

apiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const method = apiMethod.value;
  const target = apiTarget.value.trim();
  if (!target) { renderError({ message: 'Enter a table or RPC function name.' }, apiOutput); return; }

  let bodyJson = {};
  const rawBody = apiBody.value.trim();
  if (rawBody) {
    try {
      bodyJson = JSON.parse(rawBody);
    } catch (err) {
      renderError({ message: 'Body is not valid JSON: ' + err.message }, apiOutput);
      return;
    }
  }

  apiRunBtn.disabled = true;
  apiRunBtn.textContent = 'Sending…';
  apiOutput.innerHTML = `<div class="console-empty">Sending…</div>`;

  try {
    let result;
    if (method === 'select') {
      let q = supabaseClient.from(target).select('*');
      if (bodyJson.eq) {
        for (const [col, val] of Object.entries(bodyJson.eq)) q = q.eq(col, val);
      }
      if (bodyJson.limit) q = q.limit(bodyJson.limit);
      result = await q;
    } else if (method === 'insert') {
      result = await supabaseClient.from(target).insert([bodyJson]).select();
    } else if (method === 'update') {
      if (!bodyJson.match || !bodyJson.set) {
        renderError({ message: 'For update, body needs {"match": {...}, "set": {...}}' }, apiOutput);
        apiRunBtn.disabled = false; apiRunBtn.textContent = 'Send';
        return;
      }
      let q = supabaseClient.from(target).update(bodyJson.set);
      for (const [col, val] of Object.entries(bodyJson.match)) q = q.eq(col, val);
      result = await q.select();
    } else if (method === 'delete') {
      if (!bodyJson.match) {
        renderError({ message: 'For delete, body needs {"match": {...}} — refusing to delete without a filter.' }, apiOutput);
        apiRunBtn.disabled = false; apiRunBtn.textContent = 'Send';
        return;
      }
      let q = supabaseClient.from(target).delete();
      for (const [col, val] of Object.entries(bodyJson.match)) q = q.eq(col, val);
      result = await q.select();
    } else if (method === 'rpc') {
      result = await supabaseClient.rpc(target, bodyJson);
    }

    apiRunBtn.disabled = false;
    apiRunBtn.textContent = 'Send';

    if (result.error) { renderError(result.error, apiOutput); return; }
    renderTable(Array.isArray(result.data) ? result.data : [result.data].filter(Boolean), apiOutput);
  } catch (err) {
    apiRunBtn.disabled = false;
    apiRunBtn.textContent = 'Send';
    renderError(err, apiOutput);
  }
});

// ============================================
// TAB 3: AUTH INSPECTOR
// ============================================

async function loadAuthInfo() {
  const output = document.getElementById('auth-output');
  output.innerHTML = `<div class="console-empty">Loading…</div>`;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const { data: aal } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factors } = await supabaseClient.auth.mfa.listFactors();

  const info = {
    user_id: session?.user?.id,
    email: session?.user?.email,
    session_expires_at: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : null,
    current_assurance_level: aal?.currentLevel,
    next_assurance_level: aal?.nextLevel,
    mfa_factors: (factors?.totp || []).map(f => ({ id: f.id, status: f.status })),
  };

  output.innerHTML = `<pre class="console-json">${escapeHtml(JSON.stringify(info, null, 2))}</pre>`;
}

document.getElementById('auth-refresh-btn').addEventListener('click', loadAuthInfo);

// ============================================
// TAB 4: STORAGE BROWSER
// ============================================

document.getElementById('storage-list-btn').addEventListener('click', async () => {
  const bucket = document.getElementById('storage-bucket').value;
  const path = document.getElementById('storage-path').value.trim();
  const output = document.getElementById('storage-output');

  output.innerHTML = `<div class="console-empty">Loading…</div>`;

  const { data, error } = await supabaseClient.storage.from(bucket).list(path || '', { limit: 200 });

  if (error) { renderError(error, output); return; }
  if (!data || data.length === 0) { output.innerHTML = `<div class="console-empty">No files found.</div>`; return; }

  output.innerHTML = `
    <table class="console-table">
      <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead>
      <tbody>
        ${data.map(f => `
          <tr>
            <td>${escapeHtml(f.name)}</td>
            <td>${f.metadata?.size ? (f.metadata.size / 1024).toFixed(1) + ' KB' : '—'}</td>
            <td>${f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}</td>
            <td><button class="console-delete-btn" data-name="${escapeHtml(f.name)}">Delete</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  output.querySelectorAll('.console-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Permanently delete "${btn.dataset.name}"? This cannot be undone.`)) return;
      const fullPath = path ? `${path}/${btn.dataset.name}` : btn.dataset.name;
      const { error: delError } = await supabaseClient.storage.from(bucket).remove([fullPath]);
      if (delError) { alert('Delete failed: ' + delError.message); return; }
      document.getElementById('storage-list-btn').click();
    });
  });
});

// ============================================
// TAB 5: CONFIG / ENVIRONMENT CHECK
// ============================================

document.getElementById('config-run-btn').addEventListener('click', async () => {
  const output = document.getElementById('config-output');
  output.innerHTML = `<div class="console-empty">Running checks…</div>`;

  const checks = [];

  // Supabase URL/key present
  checks.push({
    name: 'Supabase URL configured',
    pass: typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('https://'),
    detail: typeof SUPABASE_URL === 'string' ? SUPABASE_URL : 'missing',
  });
  checks.push({
    name: 'Supabase anon key configured',
    pass: typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.length > 10,
    detail: typeof SUPABASE_ANON_KEY === 'string' ? `${SUPABASE_ANON_KEY.slice(0, 12)}…` : 'missing',
  });

  // Can reach the database at all
  const { error: dbError } = await supabaseClient.from('staff').select('id', { head: true, count: 'exact' });
  checks.push({ name: 'Database reachable', pass: !dbError, detail: dbError ? dbError.message : 'OK' });

  // Session exists
  const { data: { session } } = await supabaseClient.auth.getSession();
  checks.push({ name: 'Active session', pass: !!session, detail: session ? session.user.email : 'none' });

  // Storage buckets reachable
  for (const bucket of ['pet-record-images', 'booking-attachments']) {
    const { error: bucketError } = await supabaseClient.storage.from(bucket).list('', { limit: 1 });
    checks.push({ name: `Storage bucket: ${bucket}`, pass: !bucketError, detail: bucketError ? bucketError.message : 'OK' });
  }

  // RLS sanity: anon should NOT be able to read patient_notes without auth context issues,
  // but since we're authenticated as developer, just confirm the table responds
  const { error: notesError } = await supabaseClient.from('patient_notes').select('id', { head: true, count: 'exact' });
  checks.push({ name: 'patient_notes table accessible', pass: !notesError, detail: notesError ? notesError.message : 'OK' });

  // run_admin_sql RPC reachable
  const { error: rpcError } = await supabaseClient.rpc('run_admin_sql', { query: 'select 1' });
  checks.push({ name: 'run_admin_sql RPC deployed', pass: !rpcError, detail: rpcError ? rpcError.message : 'OK' });

  output.innerHTML = `
    <table class="console-table">
      <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>
        ${checks.map(c => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td class="${c.pass ? 'console-check-pass' : 'console-check-fail'}">${c.pass ? '✓ Pass' : '✗ Fail'}</td>
            <td>${escapeHtml(c.detail)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
});

// ============================================
// TAB 6: JS SCRATCHPAD
// ============================================

const jsForm = document.getElementById('js-form');
const jsCode = document.getElementById('js-code');
const jsOutput = document.getElementById('js-output');
const jsRunBtn = document.getElementById('js-run-btn');

jsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = jsCode.value.trim();
  if (!code) return;

  jsRunBtn.disabled = true;
  jsRunBtn.textContent = 'Running…';
  jsOutput.innerHTML = `<div class="console-empty">Running…</div>`;

  try {
    // Wrap in an async function so `await` works directly in the
    // scratchpad, with supabaseClient available in scope.
    const runner = new Function('supabaseClient', `return (async () => { ${code} })();`);
    const result = await runner(supabaseClient);

    jsRunBtn.disabled = false;
    jsRunBtn.textContent = 'Run';

    if (result === undefined) {
      jsOutput.innerHTML = `<div class="console-empty">Ran successfully — no return value.</div>`;
    } else if (Array.isArray(result)) {
      renderTable(result, jsOutput);
    } else {
      jsOutput.innerHTML = `<pre class="console-json">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
    }
  } catch (err) {
    jsRunBtn.disabled = false;
    jsRunBtn.textContent = 'Run';
    renderError(err, jsOutput);
  }
});

jsCode.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    jsForm.requestSubmit();
  }
});

// ---------- INIT ----------

checkAuthAndLoad();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
