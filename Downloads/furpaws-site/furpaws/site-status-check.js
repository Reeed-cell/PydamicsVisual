// Site shutdown check — runs on public-facing pages. If site_shutdown
// is active, redirects to the maintenance page. Include this right
// after supabase-config.js on index.html (and any other public page).
//
// The page's <html> element starts with visibility:hidden (set by a
// synchronous inline script at the very top of <head>, before the
// browser paints anything) so real content is never shown and then
// yanked away. This check reveals the page once it's confirmed safe,
// or redirects while still hidden if shutdown is active — either way,
// no flash of the real homepage before bouncing to maintenance.html.

(async function () {
  const revealPage = () => {
    document.documentElement.style.visibility = 'visible';
  };

  // Safety net: never leave the page invisible for more than ~2.5s,
  // even if the status check is slow or hangs on a bad connection —
  // showing the real page late is better than a blank screen forever.
  const revealTimeout = setTimeout(revealPage, 2500);

  try {
    const { data, error } = await supabaseClient
      .from('site_status')
      .select('site_shutdown')
      .eq('id', 1)
      .single();

    clearTimeout(revealTimeout);

    if (!error && data && data.site_shutdown) {
      window.location.href = 'maintenance.html';
      return; // stay hidden — we're navigating away
    }

    revealPage();
  } catch (err) {
    // If this check itself fails, fail open (let the site load) —
    // a broken status check shouldn't be able to take the whole
    // public site down on its own.
    console.error('Site status check failed:', err);
    clearTimeout(revealTimeout);
    revealPage();
  }
})();
