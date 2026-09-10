// Site shutdown check — runs on public-facing pages. If site_shutdown
// is active, redirects to the maintenance page. Include this right
// after supabase-config.js on index.html (and any other public page).

(async function () {
  try {
    const { data, error } = await supabaseClient
      .from('site_status')
      .select('site_shutdown')
      .eq('id', 1)
      .single();

    if (!error && data && data.site_shutdown) {
      window.location.href = 'maintenance.html';
    }
  } catch (err) {
    // If this check itself fails, fail open (let the site load) —
    // a broken status check shouldn't be able to take the whole
    // public site down on its own.
    console.error('Site status check failed:', err);
  }
})();
