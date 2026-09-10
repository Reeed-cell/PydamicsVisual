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
  openFeedbackBtn.addEventListener('click', () => {
    openModal(feedbackOverlay);
  });
  closeFeedbackBtn.addEventListener('click', () => closeModal(feedbackOverlay));
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) closeModal(feedbackOverlay);
  });

  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot check
    const honeypot = document.getElementById('fb-hp').value;
    if (honeypot) {
      feedbackStatus.textContent = 'Thanks — we got it.';
      feedbackStatus.classList.add('form-status--success');
      feedbackForm.reset();
      setTimeout(() => closeModal(feedbackOverlay), 1400);
      return;
    }

    // Check the free-text fields for injection/script-like patterns —
    // this form's message field is unconstrained free text, so it's
    // at least as exposed as the booking form.
    const isSuspicious = await checkSuspiciousInput({
      message: document.getElementById('fb-message').value,
      name: document.getElementById('fb-name').value,
    }, window.location.href);

    if (isSuspicious) {
      feedbackStatus.textContent = 'Thanks — we got it.';
      feedbackStatus.classList.add('form-status--success');
      feedbackForm.reset();
      setTimeout(() => closeModal(feedbackOverlay), 1400);
      return;
    }

    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = 'Verifying…';
    feedbackStatus.textContent = '';
    feedbackStatus.className = 'form-status';

    // Fetch a fresh token right at submit time, not one from when the
    // modal opened — someone thinking through a bug report can easily
    // take longer than a Turnstile token stays valid.
    let freshToken;
    try {
      freshToken = await getTurnstileToken('feedback-turnstile');
    } catch (err) {
      console.error('Turnstile setup failed:', err);
      feedbackStatus.textContent = "Could not verify — please try again.";
      feedbackStatus.classList.add('form-status--error');
      feedbackSubmit.disabled = false;
      feedbackSubmit.textContent = 'Send';
      return;
    }

    feedbackSubmit.textContent = 'Sending…';

    const isHuman = await verifyTurnstileToken(freshToken);
    if (!isHuman) {
      feedbackStatus.textContent = 'Verification failed. Please try again.';
      feedbackStatus.classList.add('form-status--error');
      feedbackSubmit.disabled = false;
      feedbackSubmit.textContent = 'Send';
      return;
    }

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
const mailToSelect = document.getElementById('mail-to');

let directoryLoaded = false;

async function loadStaffDirectory() {
  if (directoryLoaded) return;

  const { data, error } = await supabaseClient
    .from('public_staff_directory')
    .select('full_name, internal_address');

  if (error || !data) {
    console.error('Could not load staff directory:', error);
    return;
  }

  mailToSelect.innerHTML =
    `<option value="" disabled selected>Choose a staff member</option>` +
    data.map(s => `<option value="${s.internal_address}">${s.full_name}</option>`).join('');

  directoryLoaded = true;
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

  mailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot check
    const honeypot = document.getElementById('mail-hp').value;
    if (honeypot) {
      mailStatus.textContent = 'Message sent.';
      mailStatus.classList.add('form-status--success');
      mailForm.reset();
      setTimeout(() => closeModal(mailOverlay), 1400);
      return;
    }

    // Check the free-text fields — subject and body are both
    // unconstrained, making this form a real target for the same
    // kind of probing the booking form already guards against.
    const isSuspicious = await checkSuspiciousInput({
      subject: document.getElementById('mail-subject').value,
      body: document.getElementById('mail-body').value,
      fromName: document.getElementById('mail-from-name').value,
    }, window.location.href);

    if (isSuspicious) {
      mailStatus.textContent = 'Message sent.';
      mailStatus.classList.add('form-status--success');
      mailForm.reset();
      setTimeout(() => closeModal(mailOverlay), 1400);
      return;
    }

    mailSubmit.disabled = true;
    mailSubmit.textContent = 'Verifying…';
    mailStatus.textContent = '';
    mailStatus.className = 'form-status';

    // Fresh token at submit time — same reasoning as the feedback form.
    let freshToken;
    try {
      freshToken = await getTurnstileToken('mail-turnstile');
    } catch (err) {
      console.error('Turnstile setup failed:', err);
      mailStatus.textContent = "Could not verify — please try again.";
      mailStatus.classList.add('form-status--error');
      mailSubmit.disabled = false;
      mailSubmit.textContent = 'Send message';
      return;
    }

    mailSubmit.textContent = 'Sending…';

    const isHuman = await verifyTurnstileToken(freshToken);
    if (!isHuman) {
      mailStatus.textContent = 'Verification failed. Please try again.';
      mailStatus.classList.add('form-status--error');
      mailSubmit.disabled = false;
      mailSubmit.textContent = 'Send message';
      return;
    }

    const fromName = document.getElementById('mail-from-name').value.trim();
    const fromContact = document.getElementById('mail-from-contact').value.trim();

    const payload = {
      from_address: `client:${fromName} <${fromContact}>`,
      to_address: mailToSelect.value,
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
