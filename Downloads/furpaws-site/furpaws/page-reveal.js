// Shared by every page that starts hidden behind #page-loader (see
// page-loader.css). Call this once you know it's actually safe to
// show the page — either access is confirmed, or you're about to
// redirect elsewhere anyway (in which case just don't call this at
// all, and navigate while still hidden).

function revealPage() {
  document.documentElement.style.visibility = 'visible';
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('is-fading');
    setTimeout(() => loader.remove(), 320);
  }
}
