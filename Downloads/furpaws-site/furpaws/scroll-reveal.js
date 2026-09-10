// Scroll reveal — fades/slides elements in as they enter the viewport.
// Respects prefers-reduced-motion (handled via CSS media query too,
// but we also skip the observer entirely for belt-and-suspenders).

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length === 0) return;

  // If the browser can't do IntersectionObserver for any reason, or
  // reduced motion is requested, just show everything immediately —
  // losing the animation is fine, but content silently staying
  // invisible forever (opacity: 0 with nothing to ever remove it)
  // would be a real problem, not just a missed nicety.
  if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
    revealEls.forEach(el => el.classList.add('is-revealed'));
    return;
  }

  let observer;
  try {
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });
  } catch (err) {
    console.error('Scroll reveal setup failed, showing content directly:', err);
    revealEls.forEach(el => el.classList.add('is-revealed'));
    return;
  }

  revealEls.forEach(el => observer.observe(el));
})();
