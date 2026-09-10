// Emergency shutdown page — developer-only. Every action here calls
// a security-definer RPC that independently re-checks the developer
// role AND the dedicated shutdown password server-side (see
// sql/14_manual_shutdown_functions.sql) — this page's own auth check
// is just for showing/hiding the UI nicely, not the real boundary.

const loadingState = document.getElementById('loading-state');
const noAccessView = document.getElementById('no-access-view');
const shutdownView = document.getElementById('shutdown-view');
const logoutBtn = document.getElementById('logout-btn');
const currentStatusEl = document.getElementById('current-status');

const confirmOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-modal-title');
const confirmDesc = document.getElementById('confirm-modal-desc');
const confirmForm = document.getElementById('confirm-form');
const confirmStatus = document.getElementById('confirm-status');
const confirmSubmitBtn = document.getElementById('confirm-submit-btn');

let pendingAction = null;

// Usernames are stored and matched lowercase throughout the system
// (the login page lowercases on submit) — normalize here too, so a
// differently-cased username typed on this page doesn't silently
// fail to match a real account during an actual incident.
function getTargetUsername() {
  return document.getElementById('target-username').value.trim().toLowerCase();
}

async function checkAuthAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'staff-login.html'; return; }

  const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) { window.location.href = 'staff-login.html'; return; }
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    window.location.href = 'staff-login.html';
    return;
  }

  const { data: staffRow, error } = await supabaseClient
    .from('staff')
    .select('id, role, account_disabled')
    .eq('auth_user_id', session.user.id)
    .single();

  loadingState.hidden = true;

  if (error || !staffRow || staffRow.role !== 'developer') {
    noAccessView.hidden = false;
    return;
  }

  // The shutdown controls are the single most sensitive page in the
  // system — check account_disabled here too, consistent with every
  // other protected page, rather than only checking role.
  if (staffRow.account_disabled) {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  shutdownView.hidden = false;
  await refreshStatus();
}

async function refreshStatus() {
  const { data } = await supabaseClient
    .from('site_status')
    .select('site_shutdown, staff_shutdown, reason, updated_at')
    .eq('id', 1)
    .single();

  if (!data) return;

  const parts = [];
  if (data.site_shutdown) parts.push('🔴 Whole site is shut down');
  if (data.staff_shutdown) parts.push('🔴 Staff login is shut down');
  if (!data.site_shutdown && !data.staff_shutdown) parts.push('🟢 Everything is running normally');

  currentStatusEl.innerHTML = parts.map(p => `<div>${p}</div>`).join('') +
    (data.reason ? `<div class="shutdown-reason">Reason: ${escapeHtml(data.reason)}</div>` : '');

  document.querySelector('[data-action="site"]').hidden = data.site_shutdown;
  document.querySelector('[data-action="site-restore"]').hidden = !data.site_shutdown;
  document.querySelector('[data-action="staff"]').hidden = data.staff_shutdown;
  document.querySelector('[data-action="staff-restore"]').hidden = !data.staff_shutdown;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- BUTTON CLICKS → OPEN CONFIRM MODAL ----------

const ACTION_LABELS = {
  site: { title: 'Shut down the whole site?', desc: 'Visitors will see a maintenance page. Staff login is also blocked. Requires the SITE shutdown password.' },
  'site-restore': { title: 'Restore the site?', desc: 'The public site and staff login will work normally again. Requires the SITE shutdown password.' },
  staff: { title: 'Shut down staff login?', desc: 'No one will be able to sign in to the staff dashboard. Requires the STAFF LOGIN shutdown password.' },
  'staff-restore': { title: 'Restore staff login?', desc: 'Staff will be able to sign in again. Requires the STAFF LOGIN shutdown password.' },
  account: { title: 'Disable this account?', desc: 'The specified account will be unable to sign in. Requires the ACCOUNT shutdown password.' },
  'account-restore': { title: 'Restore this account?', desc: 'The specified account will be able to sign in again. Requires the ACCOUNT shutdown password.' },
};

document.querySelectorAll('.shutdown-btn[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;

    if ((action === 'account' || action === 'account-restore')) {
      const username = getTargetUsername();
      if (!username) {
        alert('Enter a username first.');
        return;
      }
    }

    pendingAction = action;
    confirmTitle.textContent = ACTION_LABELS[action].title;
    confirmDesc.textContent = ACTION_LABELS[action].desc;
    confirmStatus.textContent = '';
    confirmStatus.className = 'form-status';
    document.getElementById('shutdown-password').value = '';
    confirmOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  });
});

document.getElementById('close-confirm-modal').addEventListener('click', closeConfirmModal);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirmModal();
});

function closeConfirmModal() {
  confirmOverlay.hidden = true;
  document.body.style.overflow = '';
  pendingAction = null;
}

// ---------- CONFIRM SUBMIT ----------

confirmForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingAction) return;

  const password = document.getElementById('shutdown-password').value;
  confirmSubmitBtn.disabled = true;
  confirmSubmitBtn.textContent = 'Verifying…';
  confirmStatus.textContent = '';
  confirmStatus.className = 'form-status';

  let freshToken;
  try {
    freshToken = await getTurnstileToken('confirm-turnstile');
  } catch (err) {
    confirmStatus.textContent = 'Could not verify — please try again.';
    confirmStatus.classList.add('form-status--error');
    confirmSubmitBtn.disabled = false;
    confirmSubmitBtn.textContent = 'Confirm';
    return;
  }

  const isHuman = await verifyTurnstileToken(freshToken);
  if (!isHuman) {
    confirmStatus.textContent = 'Verification failed. Please try again.';
    confirmStatus.classList.add('form-status--error');
    confirmSubmitBtn.disabled = false;
    confirmSubmitBtn.textContent = 'Confirm';
    return;
  }

  confirmSubmitBtn.textContent = 'Applying…';

  const rpcMap = {
    site: () => supabaseClient.rpc('shutdown_whole_site', { p_password: password }),
    'site-restore': () => supabaseClient.rpc('restore_whole_site', { p_password: password }),
    staff: () => supabaseClient.rpc('shutdown_staff_login', { p_password: password }),
    'staff-restore': () => supabaseClient.rpc('restore_staff_login', { p_password: password }),
    account: () => supabaseClient.rpc('shutdown_single_account', {
      p_password: password,
      p_username: getTargetUsername(),
    }),
    'account-restore': () => supabaseClient.rpc('restore_single_account', {
      p_password: password,
      p_username: getTargetUsername(),
    }),
  };

  const { data, error } = await rpcMap[pendingAction]();

  confirmSubmitBtn.disabled = false;
  confirmSubmitBtn.textContent = 'Confirm';

  if (error || !data || !data.success) {
    confirmStatus.textContent = (data && data.error) || 'Something went wrong. Please try again.';
    confirmStatus.classList.add('form-status--error');
    console.error('Shutdown action failed:', error || data);
    return;
  }

  confirmStatus.textContent = 'Done.';
  confirmStatus.classList.add('form-status--success');
  setTimeout(() => {
    closeConfirmModal();
    refreshStatus();
  }, 1000);
});

checkAuthAndLoad();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
