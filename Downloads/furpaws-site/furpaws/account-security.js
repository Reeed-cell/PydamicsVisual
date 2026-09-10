// Account security — TOTP 2FA enrollment using Supabase Auth's
// built-in MFA support. No external service needed.

const loadingState = document.getElementById('loading-state');
const securityView = document.getElementById('security-view');
const disabledView = document.getElementById('mfa-disabled-view');
const enrollView = document.getElementById('mfa-enroll-view');
const enabledView = document.getElementById('mfa-enabled-view');
const logoutBtn = document.getElementById('logout-btn');

let pendingFactorId = null;
let currentUsername = null;

async function checkAuthAndStatus() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'staff-login.html'; return; }

  const { data: staffRow } = await supabaseClient
    .from('staff')
    .select('username, account_disabled')
    .eq('auth_user_id', session.user.id)
    .single();

  // Consistent with every other protected page — a disabled account
  // shouldn't be able to change its own 2FA settings either.
  if (staffRow?.account_disabled) {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  currentUsername = staffRow?.username || 'staff';

  loadingState.hidden = true;
  securityView.hidden = false;

  await refreshMfaStatus();
}

async function refreshMfaStatus() {
  const { data, error } = await supabaseClient.auth.mfa.listFactors();

  disabledView.hidden = true;
  enrollView.hidden = true;
  enabledView.hidden = true;

  if (error) {
    console.error(error);
    disabledView.hidden = false;
    return;
  }

  const verifiedTotp = (data?.totp || []).find(f => f.status === 'verified');

  if (verifiedTotp) {
    enabledView.hidden = false;
  } else {
    disabledView.hidden = false;
  }
}

// ---------- START ENROLLMENT ----------

document.getElementById('start-enroll-btn').addEventListener('click', async () => {
  // If a previous enrollment attempt was abandoned (tab closed instead
  // of clicking Cancel), an unverified factor can be left behind and
  // block re-enrollment entirely. Clean those up first so this never
  // becomes a dead end for the user.
  const { data: existingFactors } = await supabaseClient.auth.mfa.listFactors();
  const unverified = (existingFactors?.totp || []).filter(f => f.status !== 'verified');
  for (const factor of unverified) {
    await supabaseClient.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
  }

  const { data, error } = await supabaseClient.auth.mfa.enroll({
    factorType: 'totp',
    issuer: `Furstaff: ${currentUsername}`,
    friendlyName: `Furstaff: ${currentUsername}`,
  });

  if (error) {
    alert('Could not start setup. Please try again.');
    console.error(error);
    return;
  }

  pendingFactorId = data.id;

  // Build the <img> via the DOM API and set .src as a property,
  // rather than interpolating the QR data URL into an HTML string
  // via innerHTML. Supabase's QR code is an SVG data URL, and SVG
  // markup often contains literal double-quote characters (e.g.
  // fill="#000"). Embedding that directly into an HTML src="..."
  // attribute string causes the browser's HTML parser to treat the
  // first such quote as the END of the attribute — everything after
  // it stops being parsed as part of the tag and gets rendered as
  // raw text on the page instead. That's exactly what "QR code cut
  // in half, rest showing as text" looks like. Setting .src as a
  // property bypasses HTML parsing entirely, so this can't happen.
  const qrContainer = document.getElementById('mfa-qr-container');
  qrContainer.innerHTML = '';
  const qrImg = document.createElement('img');
  qrImg.src = data.totp.qr_code;
  qrImg.alt = 'Scan this QR code with your authenticator app';
  qrImg.className = 'mfa-qr-image';
  qrContainer.appendChild(qrImg);

  document.getElementById('mfa-secret-text').textContent = data.totp.secret;

  disabledView.hidden = true;
  enrollView.hidden = false;
});

document.getElementById('cancel-enroll-btn').addEventListener('click', async () => {
  if (pendingFactorId) {
    const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: pendingFactorId });
    if (error) console.error('Could not clean up cancelled enrollment:', error);
    pendingFactorId = null;
  }
  enrollView.hidden = true;
  disabledView.hidden = false;
  document.getElementById('mfa-verify-form').reset();
});

// ---------- VERIFY AND COMPLETE ENROLLMENT ----------

document.getElementById('mfa-verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('mfa-enroll-status');
  // Strip everything but digits — some authenticator apps display
  // codes with a space in the middle (e.g. "123 456"), which .trim()
  // alone wouldn't remove, causing a valid code to be rejected.
  const code = document.getElementById('mfa-code').value.replace(/\D/g, '');

  status.textContent = '';
  status.className = 'form-status';

  const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId: pendingFactorId });

  if (challengeError) {
    status.textContent = 'Something went wrong. Please try again.';
    status.classList.add('form-status--error');
    console.error(challengeError);
    return;
  }

  const { error: verifyError } = await supabaseClient.auth.mfa.verify({
    factorId: pendingFactorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyError) {
    status.textContent = 'That code didn\'t work. Check your app and try again.';
    status.classList.add('form-status--error');
    return;
  }

  status.textContent = 'Two-factor authentication enabled.';
  status.classList.add('form-status--success');
  pendingFactorId = null;
  setTimeout(refreshMfaStatus, 1000);
});

// ---------- DISABLE ----------

document.getElementById('disable-mfa-btn').addEventListener('click', async () => {
  if (!confirm('Turn off two-factor authentication for your account?')) return;

  const status = document.getElementById('mfa-disable-status');
  const { data, error: listError } = await supabaseClient.auth.mfa.listFactors();

  if (listError || !data) {
    status.textContent = 'Could not check your account. Please try again.';
    status.className = 'form-status form-status--error';
    console.error('listFactors failed:', listError);
    return;
  }

  const verifiedTotp = (data.totp || []).find(f => f.status === 'verified');
  if (!verifiedTotp) {
    status.textContent = 'Two-factor authentication is not currently enabled.';
    status.className = 'form-status';
    refreshMfaStatus();
    return;
  }

  const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: verifiedTotp.id });

  if (error) {
    status.textContent = 'Could not disable. Please try again.';
    status.className = 'form-status form-status--error';
    return;
  }

  refreshMfaStatus();
});

checkAuthAndStatus();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
