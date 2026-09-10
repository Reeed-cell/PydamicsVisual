// Inactivity timeout for staff pages.
// - After 3 minutes 30 seconds of no mouse/keyboard activity, the
//   page gets a heavy blur overlay.
// - Any mouse movement or keypress removes the blur and resets the timer.
// - If truly inactive (blur showing, still no input) until 10 minutes
//   total have passed, the user is automatically signed out.
//
// Activity is tracked via a shared localStorage timestamp rather than
// a purely per-tab timer. This matters because Supabase Auth sessions
// are shared across tabs of the same origin (localStorage-backed) —
// with a naive per-tab timer, an idle background tab (e.g. a second
// dashboard tab left open) would silently sign out an ACTIVE tab too,
// since calling signOut() anywhere kills the one shared session. Using
// a shared "last activity" timestamp means any tab's activity keeps
// every tab alive, which is what a user would actually expect.
//
// Include this on every page that sits behind login (dashboard,
// records, account-security) — after supabase-config.js.

(function () {
  const BLUR_AFTER_MS = (3 * 60 + 30) * 1000; // 3:30
  const LOGOUT_AFTER_MS = 10 * 60 * 1000;      // 10:00
  const STORAGE_KEY = 'furpaws_last_activity';
  const CHECK_INTERVAL_MS = 2000;
  const RECORD_THROTTLE_MS = 1000;

  let overlay = null;
  let throttleTimer = null;
  let loggedOut = false;

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'inactivity-blur-overlay';
    overlay.innerHTML = `
      <div class="inactivity-message">
        <p>Away for a moment?</p>
        <span>Move your mouse or press any key to continue</span>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showBlur() {
    createOverlay();
    document.body.classList.add('inactivity-blurred');
  }

  function hideBlur() {
    document.body.classList.remove('inactivity-blurred');
  }

  async function forceLogout() {
    if (loggedOut) return;
    loggedOut = true;
    try {
      await supabaseClient.auth.signOut();
    } catch (err) {
      console.error('Auto-logout failed:', err);
    }
    window.location.href = 'staff-login.html?timeout=1';
  }

  function getLastActivity() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return parseInt(stored, 10);
    } catch (err) {
      // localStorage unavailable (e.g. restrictive private browsing) —
      // fall back to "just now" so we fail toward staying logged in
      // rather than toward an unexpected logout.
    }
    return Date.now();
  }

  function recordActivity() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (err) {
      // Ignore — getLastActivity() has its own fallback.
    }
    hideBlur();
  }

  // Throttled so we're not writing to localStorage on every single
  // mousemove tick (which can fire dozens of times a second) — real
  // activity is still captured, just coalesced to roughly once/second.
  function onActivityEvent() {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => { throttleTimer = null; }, RECORD_THROTTLE_MS);
    recordActivity();
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, onActivityEvent, { passive: true });
  });

  recordActivity();

  setInterval(() => {
    if (loggedOut) return;
    const idleMs = Date.now() - getLastActivity();

    if (idleMs >= LOGOUT_AFTER_MS) {
      forceLogout();
    } else if (idleMs >= BLUR_AFTER_MS) {
      showBlur();
    } else {
      hideBlur();
    }
  }, CHECK_INTERVAL_MS);
})();
