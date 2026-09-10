// Emergency access — deliberately NOT linked from anywhere on the
// site. Only works for the developer account, and specifically
// ignores staff_shutdown (that's the whole point: a way in when
// everything else is locked, for the one account resolving the
// incident). Does NOT bypass account_disabled — if the developer
// account itself was disabled, this page correctly still refuses,
// since that's a deliberate state, not the emergency this exists for.

const USERNAME_TO_AUTH_EMAIL = {
  franzmembrerejr: "franzmembrerejr@dev.furpawsclinic.internal",
};

const form = document.getElementById('emergency-login-form');
const status = document.getElementById('emergency-status');
const submitBtn = document.getElementById('emergency-submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  status.textContent = '';
  status.className = 'form-status';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying…';

  let freshToken;
  try {
    freshToken = await getTurnstileToken('emergency-turnstile');
  } catch (err) {
    status.textContent = 'Could not verify — please refresh and try again.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    return;
  }

  const isHuman = await verifyTurnstileToken(freshToken);
  if (!isHuman) {
    status.textContent = 'Verification failed.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    return;
  }

  // Only the developer account can use this page at all — checked
  // here AND you should never share this URL, since that's the real
  // access control (an unguessable, unlinked URL), not this check
  // alone.
  const authEmail = USERNAME_TO_AUTH_EMAIL[username];
  if (!authEmail) {
    status.textContent = 'Access denied.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    return;
  }

  submitBtn.textContent = 'Signing in…';

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail,
    password: password,
  });

  if (error) {
    // Log failed attempts here too — this page has an unguessable
    // URL as its primary defense, but if that URL were ever
    // discovered, failed attempts against it should still be
    // visible in the suspicious-activity system rather than
    // invisible. The developer role is exempt from the staff_shutdown
    // auto-trigger, so logging here can't cause a self-lockout.
    try {
      await supabaseClient.from('failed_login_attempts').insert([{
        username_attempted: username,
        attempt_type: 'password',
      }]);
    } catch (logErr) {
      console.error('Could not log failed attempt:', logErr);
    }

    status.textContent = 'Incorrect username or password.';
    status.classList.add('form-status--error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    return;
  }

  // Deliberately does NOT check staff_shutdown — that's the point of
  // this page. Still respects account_disabled via the dashboard's
  // own check on load (if this specific account were disabled, the
  // dashboard will correctly sign it back out).
  const { data: aal } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    window.location.href = 'mfa-verify.html';
    return;
  }

  window.location.href = 'dashboard.html';
});
