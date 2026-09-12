// Staff login — maps username to the hidden internal auth email,
// then signs in via Supabase Auth. If the account has 2FA enabled,
// redirects to a separate page for the verification code.
//
// TEMPORARY: hardcoded mapping for the 2 current accounts.
// Once more staff are added, replace this with a proper lookup
// (Edge Function or similar) rather than adding more entries here.
const USERNAME_TO_AUTH_EMAIL = {
  franzmembrere: "franzmembrere@staff.furpawsclinic.internal",
  franzmembrerejr: "franzmembrerejr@dev.furpawsclinic.internal",
};

const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const loginSubmit = document.getElementById('login-submit');

// If redirected here after an inactivity timeout, let them know why
if (new URLSearchParams(window.location.search).get('timeout') === '1') {
  loginStatus.textContent = "You were signed out after being inactive.";
  loginStatus.className = 'form-status';
}

// Check site-wide staff shutdown BEFORE revealing the page at all —
// previously this ran as fire-and-forget after the form was already
// visible and enabled, so a real visitor could see and even start
// typing into a login form that was about to be disabled out from
// under them a moment later. Now the whole page stays behind the
// loading screen until this resolves, and reveals only once in
// whichever final state is actually correct.
(async function checkStaffShutdown() {
  const { data, error } = await supabaseClient
    .from('site_status')
    .select('staff_shutdown')
    .eq('id', 1)
    .single();

  if (!error && data && data.staff_shutdown) {
    loginForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
    loginStatus.textContent = 'Staff login is temporarily disabled. Contact the site administrator.';
    loginStatus.classList.add('form-status--error');
  }

  revealPage();
})();

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    loginStatus.textContent = '';
    loginStatus.className = 'form-status';
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Verifying…';

    // Get a fresh token right now, rather than relying on one fetched
    // when the page first loaded — Turnstile tokens expire after a
    // few minutes, and a stale token is the most common cause of a
    // real visitor seeing "verification failed."
    let freshToken;
    try {
      freshToken = await getTurnstileToken('login-turnstile');
    } catch (err) {
      console.error('Turnstile setup failed:', err);
      loginStatus.textContent = 'Could not verify — please refresh the page and try again.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    loginSubmit.textContent = 'Signing in…';

    const isHuman = await verifyTurnstileToken(freshToken);
    if (!isHuman) {
      loginStatus.textContent = 'Verification failed. Please try again.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    const authEmail = USERNAME_TO_AUTH_EMAIL[username];

    if (!authEmail) {
      await logFailedAttempt(username, 'password');
      loginStatus.textContent = 'Incorrect username or password.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    // Check if this specific account has been disabled (either
    // manually, or by the auto 2FA-flood trigger). Uses a dedicated
    // RPC rather than querying the staff table directly — the
    // visitor isn't authenticated yet at this point, and the staff
    // table's RLS only allows authenticated reads, so a direct query
    // here would silently return nothing and never actually block
    // a disabled account before the password check.
    const { data: isDisabled } = await supabaseClient.rpc('check_account_disabled', {
      p_username: username,
    });

    if (isDisabled) {
      loginStatus.textContent = 'This account has been disabled. Contact the site administrator.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: authEmail,
      password: password,
    });

    if (error) {
      await logFailedAttempt(username, 'password');
      // Distinguish "wrong credentials" from other failures (like a
      // rate limit) so this doesn't wrongly tell people their
      // password is wrong when it isn't.
      const isRateLimit = error.status === 429 || /rate.?limit/i.test(error.message || '');
      loginStatus.textContent = isRateLimit
        ? "Too many attempts right now — please wait a few minutes and try again."
        : 'Incorrect username or password.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      console.error('Sign-in error:', error);
      return;
    }

    // Check if this account has 2FA enrolled and needs a second step.
    // If this check itself fails, we genuinely don't know whether 2FA
    // is required — silently sending them to the dashboard could
    // bypass a real 2FA requirement, so show an error and let them
    // retry instead of guessing in either direction.
    const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalError || !aal) {
      console.error('Could not determine assurance level:', aalError);
      loginStatus.textContent = 'Something went wrong. Please try signing in again.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      // Password was correct — send them to the dedicated 2FA page.
      window.location.href = 'mfa-verify.html';
      return;
    }

    // No 2FA required, or already satisfied — go straight in
    window.location.href = 'dashboard.html';
  });
}

// Logs a failed attempt and checks the flood-detection threshold.
// Best-effort — if this fails, it shouldn't block the actual login
// error message from showing.
async function logFailedAttempt(username, type) {
  try {
    await supabaseClient.from('failed_login_attempts').insert([{
      username_attempted: username,
      attempt_type: type,
    }]);
    if (type === 'password') {
      await supabaseClient.rpc('check_login_flood');
    }
  } catch (err) {
    console.error('Could not log failed attempt:', err);
  }
}
