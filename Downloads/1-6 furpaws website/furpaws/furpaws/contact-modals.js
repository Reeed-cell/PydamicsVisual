// Feedback modal + Mail modal — public-facing, no login required.

// ---------- MODAL OPEN/CLOSE HELPERS ----------

function openModal(overlayEl) {
  overlayEl.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(overlayEl) {
  overlayEl.hidden = true;
  document.body.style.overflow = '';
}

// ---------- FEEDBACK MODAL ----------

const feedbackOverlay = document.getElementById('feedback-modal-overlay');
const openFeedbackBtn = document.getElementById('open-feedback-modal');
const closeFeedbackBtn = document.getElementById('close-feedback-modal');
const feedbackForm = document.getElementById('feedback-form');
const feedbackStatus = document.getElementById('feedback-status');
const feedbackSubmit = document.getElementById('feedback-submit');

if (openFeedbackBtn) {
  openFeedbackBtn.addEventListener('click', () => openModal(feedbackOverlay));
  closeFeedbackBtn.addEventListener('click', () => closeModal(feedbackOverlay));
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) closeModal(feedbackOverlay);
  });

  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = 'Sending…';
    feedbackStatus.textContent = '';
    feedbackStatus.className = 'form-status';

    const payload = {
      category: document.getElementById('fb-category').value,
      message: document.getElementById('fb-message').value.trim(),
      name: document.getElementById('fb-name').value.trim() || null,
      email: document.getElementById('fb-email').value.trim() || null,
      status: 'open',
    };

    const { error } = await supabaseClient.from('feedback').insert([payload]);

    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = 'Send';

    if (error) {
      feedbackStatus.textContent = 'Could not send. Please try again.';
      feedbackStatus.classList.add('form-status--error');
      console.error(error);
      return;
    }

    feedbackStatus.textContent = 'Thanks — we got it.';
    feedbackStatus.classList.add('form-status--success');
    feedbackForm.reset();
    setTimeout(() => closeModal(feedbackOverlay), 1400);
  });
}

// ---------- MAIL MODAL ----------

const mailOverlay = document.getElementById('mail-modal-overlay');
const openMailBtn = document.getElementById('open-mail-modal');
const closeMailBtn = document.getElementById('close-mail-modal');
const mailForm = document.getElementById('mail-form');
const mailStatus = document.getElementById('mail-status');
const mailSubmit = document.getElementById('mail-submit');
const mailToInput = document.getElementById('mail-to');
const mailSuggestions = document.getElementById('mail-suggestions');

let staffDirectory = [];
let directoryLoaded = false;

async function loadStaffDirectory() {
  if (directoryLoaded) return;
  const { data, error } = await supabaseClient
    .from('public_staff_directory')
    .select('full_name, internal_address');

  if (!error && data) {
    staffDirectory = data;
    directoryLoaded = true;
  }
}

if (openMailBtn) {
  openMailBtn.addEventListener('click', () => {
    openModal(mailOverlay);
    loadStaffDirectory();
  });
  closeMailBtn.addEventListener('click', () => closeModal(mailOverlay));
  mailOverlay.addEventListener('click', (e) => {
    if (e.target === mailOverlay) closeModal(mailOverlay);
  });

  mailToInput.addEventListener('input', () => {
    const q = mailToInput.value.trim().toLowerCase();
    if (!q) {
      mailSuggestions.hidden = true;
      return;
    }
    const matches = staffDirectory.filter(s =>
      s.full_name.toLowerCase().includes(q) || s.internal_address.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      mailSuggestions.hidden = true;
      return;
    }

    mailSuggestions.innerHTML = matches.map(s => `
      <div class="autocomplete-item" data-address="${s.internal_address}">
        <span class="autocomplete-name">${s.full_name}</span>
        <span class="autocomplete-address">${s.internal_address}</span>
      </div>
    `).join('');
    mailSuggestions.hidden = false;

    mailSuggestions.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        mailToInput.value = item.dataset.address;
        mailSuggestions.hidden = true;
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-row')) {
      mailSuggestions.hidden = true;
    }
  });

  mailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mailSubmit.disabled = true;
    mailSubmit.textContent = 'Sending…';
    mailStatus.textContent = '';
    mailStatus.className = 'form-status';

    const fromName = document.getElementById('mail-from-name').value.trim();
    const fromContact = document.getElementById('mail-from-contact').value.trim();

    const payload = {
      from_address: `client:${fromName} <${fromContact}>`,
      to_address: mailToInput.value.trim(),
      subject: document.getElementById('mail-subject').value.trim() || null,
      body: document.getElementById('mail-body').value.trim(),
      read: false,
    };

    const { error } = await supabaseClient.from('internal_messages').insert([payload]);

    mailSubmit.disabled = false;
    mailSubmit.textContent = 'Send message';

    if (error) {
      mailStatus.textContent = 'Could not send. Please try again.';
      mailStatus.classList.add('form-status--error');
      console.error(error);
      return;
    }

    mailStatus.textContent = 'Message sent.';
    mailStatus.classList.add('form-status--success');
    mailForm.reset();
    setTimeout(() => closeModal(mailOverlay), 1400);
  });
}

// Close either modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (feedbackOverlay && !feedbackOverlay.hidden) closeModal(feedbackOverlay);
    if (mailOverlay && !mailOverlay.hidden) closeModal(mailOverlay);
  }
});
