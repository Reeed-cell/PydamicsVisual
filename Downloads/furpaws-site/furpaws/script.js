// Get the current date/time in Philippine Time (Asia/Manila, GMT+8),
// regardless of the visitor's own device timezone.
function getPHTime() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[map.weekday];
  const hour = parseInt(map.hour, 10) % 24;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  return { day, hour, minute, second, decimalHour: hour + minute / 60 };
}

// Live open/closed status based on clinic hours (Philippine Time)
function updateHoursStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  const { day, decimalHour: hour } = getPHTime();

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

  // Highlight today's row in the hours list
  document.querySelectorAll('#hours-list li').forEach(li => {
    li.classList.toggle('is-today', parseInt(li.dataset.day, 10) === day);
  });
}

// Live PH clock, ticking every second
function updateClock() {
  const clockEl = document.getElementById('hours-clock');
  if (!clockEl) return;

  const { hour, minute, second } = getPHTime();
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const pad = (n) => String(n).padStart(2, '0');

  clockEl.textContent = `${pad(displayHour)}:${pad(minute)}:${pad(second)} ${period} · Philippine Time`;
}

updateHoursStatus();
updateClock();
setInterval(updateHoursStatus, 30000);
setInterval(updateClock, 1000);

// Staggered line-by-line reveal for the hours list, once the board
// itself has scrolled into view (data-reveal handles the board's
// own fade-in; this adds the per-row stagger inside it).
function animateHoursList() {
  const rows = document.querySelectorAll('#hours-list li');
  rows.forEach((row, i) => {
    row.style.animationDelay = `${i * 60}ms`;
    row.classList.add('hours-row-in');
  });
}

const hoursBoard = document.getElementById('hours-board');
if (hoursBoard) {
  if (typeof IntersectionObserver === 'undefined') {
    // No IntersectionObserver support — reveal immediately rather than
    // leaving the hours rows permanently invisible (they start at
    // opacity: 0 and only the animation normally removes that).
    animateHoursList();
  } else {
    try {
      const boardObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateHoursList();
            boardObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      boardObserver.observe(hoursBoard);
    } catch (err) {
      console.error('Hours board observer failed, revealing directly:', err);
      animateHoursList();
    }
  }
}

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
