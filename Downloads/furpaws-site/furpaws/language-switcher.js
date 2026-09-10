// Custom language switcher — a styled dropdown that triggers Google's
// hidden translate widget under the hood, so the UI matches our design
// instead of showing Google's default bar.

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tl', label: 'Filipino' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'war', label: 'Waray' },
  { code: 'hil', label: 'Hiligaynon' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'bik', label: 'Bikol' },
  { code: 'pam', label: 'Kapampangan' },
  { code: 'pag', label: 'Pangasinan' },
];

function initLanguageSwitcher() {
  const trigger = document.getElementById('lang-switcher-trigger');
  const menu = document.getElementById('lang-switcher-menu');
  const currentLabel = document.getElementById('lang-switcher-current');
  if (!trigger || !menu) return;

  menu.innerHTML = LANGUAGES.map(lang =>
    `<button type="button" class="lang-option" data-code="${lang.code}">${lang.label}</button>`
  ).join('');

  trigger.addEventListener('click', () => {
    menu.classList.toggle('is-open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-switcher')) {
      menu.classList.remove('is-open');
    }
  });

  menu.querySelectorAll('.lang-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      setGoogleTranslateLanguage(code);
      currentLabel.textContent = btn.textContent;
      menu.classList.remove('is-open');
      menu.querySelectorAll('.lang-option').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
    });
  });

  // Restore selection from the googtrans cookie, if present
  const savedLang = getGoogTransCookieLang();
  if (savedLang) {
    const match = LANGUAGES.find(l => l.code === savedLang);
    if (match) currentLabel.textContent = match.label;
  }
}

function setGoogleTranslateLanguage(code) {
  // Google's widget reads the target language from a cookie named
  // 'googtrans', shaped like "/en/<code>". Setting it and reloading
  // the hidden select is the standard way to drive the widget
  // programmatically without showing its default UI.
  if (code === 'en') {
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
  } else {
    document.cookie = `googtrans=/en/${code}; path=/;`;
    document.cookie = `googtrans=/en/${code}; path=/; domain=${window.location.hostname}`;
  }
  window.location.reload();
}

function getGoogTransCookieLang() {
  const match = document.cookie.match(/googtrans=\/en\/([a-zA-Z-]+)/);
  return match ? match[1] : null;
}

document.addEventListener('DOMContentLoaded', initLanguageSwitcher);
