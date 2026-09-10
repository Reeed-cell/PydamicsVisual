// FAQ accordion — smooth height animation for <details> elements,
// since the native toggle snaps open/closed with no transition.

document.querySelectorAll('.faq-item').forEach(details => {
  const summary = details.querySelector('summary');
  const content = details.querySelector('p');
  if (!summary || !content) return;

  let animation = null;
  let isClosing = false;
  let isExpanding = false;

  summary.addEventListener('click', (e) => {
    e.preventDefault();

    // Ignore clicks while an animation is already running or about to
    // start — without this, a fast double-click could land in the gap
    // between openFaq() synchronously flipping details.open and the
    // next animation frame actually marking isExpanding true, causing
    // the two animations to fight and leave the panel in a visually
    // broken half-open state.
    if (isClosing || isExpanding) return;

    details.style.overflow = 'hidden';

    if (!details.open) {
      openFaq();
    } else {
      closeFaq();
    }
  });

  function openFaq() {
    isExpanding = true;
    details.style.height = `${details.offsetHeight}px`;
    details.open = true;
    window.requestAnimationFrame(() => expand());
  }

  function expand() {
    const startHeight = details.offsetHeight;
    const endHeight = summary.offsetHeight + content.offsetHeight + 22;

    if (animation) animation.cancel();
    animation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
    animation.onfinish = () => onAnimationFinish(true);
    animation.oncancel = () => { isExpanding = false; };
  }

  function closeFaq() {
    isClosing = true;
    const startHeight = details.offsetHeight;
    const endHeight = summary.offsetHeight;

    if (animation) animation.cancel();
    animation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    );
    animation.onfinish = () => onAnimationFinish(false);
    animation.oncancel = () => { isClosing = false; };
  }

  function onAnimationFinish(open) {
    details.open = open;
    details.style.height = '';
    details.style.overflow = '';
    isClosing = false;
    isExpanding = false;
    animation = null;
  }
});
