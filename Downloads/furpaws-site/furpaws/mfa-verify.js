// Dedicated 2FA verification page. Only usable if the visitor has
// already passed the password step (session exists at AAL1) and
// their account requires AAL2. Anyone else gets sent back to login.

const loadingCheck = document.getElementById('loading-check');
const mfaForm = document.getElementById('mfa-step-form');

async function checkPendingMfa() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    // No session at all — never logged in with a password. Send back.
    window.location.href = 'staff-login.html';
    return;
  }

  // Defense in depth: catch a disabled account here too, not just at
  // the dashboard. The session is authenticated at this point, so
  // this query is allowed by RLS (unlike the pre-login check on the
  // login page, which needs a dedicated RPC instead — see
  // sql/15_fix_account_disabled_check.sql). Without this, a disabled
  // account could complete a full, genuine AAL2 verification before
  // ever being rejected.
  const { data: staffRow } = await supabaseClient
    .from('staff')
    .select('account_disabled')
    .eq('auth_user_id', session.user.id)
    .single();

  if (staffRow?.account_disabled) {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalError || !aal) {
    console.error('Could not determine assurance level:', aalError);
    window.location.href = 'staff-login.html';
    return;
  }

  if (aal.currentLevel === 'aal2') {
    // Already fully verified (e.g. they refreshed this page after
    // completing it, or navigated back) — just go to the dashboard.
    window.location.href = 'dashboard.html';
    return;
  }

  if (aal.nextLevel !== 'aal2') {
    // This account doesn't have 2FA enabled at all — nothing to verify.
    window.location.href = 'dashboard.html';
    return;
  }

  // Valid pending state — show the code form.
  loadingCheck.hidden = true;
  mfaForm.hidden = false;
}

mfaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('mfa-step-status');
  const submitBtn = document.getElementById('mfa-step-submit');
  const code = document.getElementById('mfa-step-code').value.replace(/\D/g, '');

  status.textContent = '';
  status.className = 'form-status';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying…';

  const { data: factors } = await supabaseClient.auth.mfa.listFactors();
  // Specifically the verified factor — not just the first in the list.
  // A stray unverified factor (from an abandoned enrollment attempt)
  // could otherwise get challenged instead of the real one, causing
  // every correct code to be rejected for no visible reason.
  const totpFactor = (factors?.totp || []).find(f => f.status === 'verified');

  if (!totpFactor) {
    status.textContent = 'Something went wrong. Please sign in again.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify';
    return;
  }

  const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId: totpFactor.id });

  if (challengeError) {
    status.textContent = 'Something went wrong. Please try again.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify';
    return;
  }

  const { error: verifyError } = await supabaseClient.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    // Log the failed 2FA attempt and check the flood threshold —
    // repeated 2FA failures on one account suggests someone has the
    // password but not the authenticator device.
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      const { data: staffRow } = await supabaseClient
        .from('staff').select('username').eq('auth_user_id', user?.id).single();
      if (staffRow?.username) {
        await supabaseClient.from('failed_login_attempts').insert([{
          username_attempted: staffRow.username,
          attempt_type: 'mfa',
        }]);
        await supabaseClient.rpc('check_mfa_flood', { p_username: staffRow.username });
      }
    } catch (logErr) {
      console.error('Could not log failed 2FA attempt:', logErr);
    }

    status.textContent = 'Incorrect code. Please try again.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify';
    document.getElementById('mfa-step-code').value = '';
    document.getElementById('mfa-step-code').focus();
    return;
  }

  window.location.href = 'dashboard.html';
});

checkPendingMfa();
