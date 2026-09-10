// Cloudflare Turnstile helper — renders an invisible/managed widget
// per form, and verifies the resulting token via a Supabase Edge
// Function (so the secret key never touches the browser).
//
// IMPORTANT: replace TURNSTILE_SITE_KEY below with your real site key
// from the Cloudflare Turnstile dashboard. This one is public/safe to
// expose — it's the secret key that must stay server-side only.

const TURNSTILE_SITE_KEY = "0x4AAAAAAEKxT3uzwbmXXXZb";

let turnstileScriptLoaded = false;
let turnstileScriptLoading = null;

function loadTurnstileScript() {
  if (turnstileScriptLoaded) return Promise.resolve();
  if (turnstileScriptLoading) return turnstileScriptLoading;

  turnstileScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => { turnstileScriptLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return turnstileScriptLoading;
}

// Renders a Turnstile widget into the given container element and
// resolves with the token once solved. Widgets are 'managed' mode —
// invisible for most visitors, a light checkbox only if Cloudflare's
// risk model is unsure.
//
// Safe to call multiple times on the same container (e.g. once per
// submit attempt) — any previous widget in that container is removed
// first, since Turnstile tokens are single-use and expire after a
// few minutes, so a fresh render is needed for each real attempt.
const turnstileWidgetIds = {};

async function getTurnstileToken(containerId) {
  await loadTurnstileScript();

  return new Promise((resolve, reject) => {
    if (!window.turnstile) {
      reject(new Error('Turnstile failed to load'));
      return;
    }

    // Remove any prior widget rendered into this container
    if (turnstileWidgetIds[containerId] !== undefined) {
      try {
        window.turnstile.remove(turnstileWidgetIds[containerId]);
      } catch (err) {
        // Widget may already be gone — safe to ignore
      }
      delete turnstileWidgetIds[containerId];
    }

    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    const widgetId = window.turnstile.render(`#${containerId}`, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => resolve(token),
      'error-callback': () => reject(new Error('Turnstile verification failed')),
      'expired-callback': () => reject(new Error('Turnstile token expired')),
      size: 'flexible',
    });

    turnstileWidgetIds[containerId] = widgetId;
  });
}

// Verifies a token server-side via the Supabase Edge Function.
// Returns true only if Cloudflare confirms the token is valid.
async function verifyTurnstileToken(token) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/verify-turnstile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }
    );
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('Turnstile server verification failed:', err);
    return false;
  }
}
