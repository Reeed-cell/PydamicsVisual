// Live open/closed status based on clinic hours
function updateHoursStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 4 = Thursday
  const hour = now.getHours() + now.getMinutes() / 60;

  const isClosedToday = day === 0; // Sunday — closed all day
  const openTime = 14; // 2:00 PM
  const closeTime = day === 4 ? 18 : 19; // Thursday closes 6PM, else 7PM

  const isOpen = !isClosedToday && hour >= openTime && hour < closeTime;

  if (isClosedToday) {
    dot.classList.add('is-closed');
    dot.classList.remove('is-open');
    text.textContent = 'Closed today · opens Monday';
  } else if (isOpen) {
    dot.classList.add('is-open');
    dot.classList.remove('is-closed');
    const closeLabel = day === 4 ? '6:00 PM' : '7:00 PM';
    text.textContent = `Open now · closes ${closeLabel}`;
  } else {
    dot.classList.add('is-closed');
    dot.classList.remove('is-open');
    text.textContent = hour < openTime ? 'Closed · opens 2:00 PM' : 'Closed for today';
  }
}

updateHoursStatus();
setInterval(updateHoursStatus, 60000);

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    mainNav.classList.toggle('is-open');
  });
}
