// Staff login — maps username to the hidden internal auth email,
// then signs in via Supabase Auth.
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

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    loginStatus.textContent = '';
    loginStatus.className = 'form-status';
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';

    const authEmail = USERNAME_TO_AUTH_EMAIL[username];

    if (!authEmail) {
      loginStatus.textContent = 'Incorrect username or password.';
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
      loginStatus.textContent = 'Incorrect username or password.';
      loginStatus.classList.add('form-status--error');
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
      return;
    }

    // Success — redirect to dashboard
    window.location.href = 'dashboard.html';
  });
}
