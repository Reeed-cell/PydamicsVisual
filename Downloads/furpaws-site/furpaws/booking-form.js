// Booking form — submits to Supabase 'bookings' table.
// Protected by: a honeypot field (silent bot trap) and Cloudflare
// Turnstile (invisible human check, verified server-side via an
// Edge Function so the secret key never reaches the browser).
// Also shows a confirmation step summarizing what was entered before
// actually sending, so people can catch typos (wrong date, mistyped
// contact info) before it's submitted.

const bookingForm = document.getElementById('booking-form');
const formStatus = document.getElementById('form-status');
const submitBtn = document.getElementById('booking-submit');
const attachmentInput = document.getElementById('booking-attachment');
const attachmentStatus = document.getElementById('booking-attachment-status');

const confirmOverlay = document.getElementById('booking-confirm-overlay');
const confirmSummary = document.getElementById('booking-confirm-summary');
const confirmBackBtn = document.getElementById('booking-confirm-back');
const confirmSendBtn = document.getElementById('booking-confirm-send');
const confirmStatus = document.getElementById('booking-confirm-status');
const closeConfirmBtn = document.getElementById('close-booking-confirm');

const MAX_ATTACHMENT_MB = 25;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatPreferredDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

if (bookingForm) {
  attachmentInput?.addEventListener('change', () => {
    const file = attachmentInput.files[0];
    if (!file) { attachmentStatus.textContent = ''; return; }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_ATTACHMENT_MB) {
      attachmentStatus.textContent = `File is ${sizeMB.toFixed(1)}MB — max is ${MAX_ATTACHMENT_MB}MB. Please choose a smaller file.`;
      attachmentStatus.classList.add('form-status--error');
      attachmentInput.value = '';
      return;
    }
    attachmentStatus.classList.remove('form-status--error');
    attachmentStatus.textContent = `${file.name} (${sizeMB.toFixed(1)}MB) ready to attach.`;
  });

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot check — if this hidden field has anything in it,
    // it was filled by a bot, not a real visitor. Silently pretend
    // success so the bot doesn't learn to adapt.
    const honeypot = document.getElementById('booking-hp').value;
    if (honeypot) {
      formStatus.textContent = "Request sent! We'll confirm your appointment soon.";
      formStatus.classList.add('form-status--success');
      bookingForm.reset();
      return;
    }

    // Check the actual text fields for injection/script-like patterns
    const isSuspicious = await checkSuspiciousInput({
      name: document.getElementById('owner_name').value,
      notes: document.getElementById('notes').value,
      pet_name: document.getElementById('pet_name').value,
    }, window.location.href);

    if (isSuspicious) {
      // Same silent-success treatment as the honeypot — don't tip off
      // whoever's probing that they were caught.
      formStatus.textContent = "Request sent! We'll confirm your appointment soon.";
      formStatus.classList.add('form-status--success');
      bookingForm.reset();
      return;
    }

    // Both checks passed — show a summary and ask for confirmation
    // rather than submitting immediately. The actual Turnstile +
    // database work only happens after "Yes, send it" is clicked.
    showBookingConfirmation();
  });
}

function showBookingConfirmation() {
  const formData = new FormData(bookingForm);
  const rows = [
    ['Your name', formData.get('owner_name')?.trim()],
    ['Phone or email', formData.get('owner_contact')?.trim()],
    ["Pet's name", formData.get('pet_name')?.trim()],
    ['Species', formData.get('pet_species')?.trim()],
    ['Service', formData.get('service')],
    ['Preferred date & time', formatPreferredDateTime(formData.get('preferred_datetime'))],
  ];
  const notes = formData.get('notes')?.trim();
  if (notes) rows.push(['Notes', notes]);

  const file = attachmentInput?.files[0];
  if (file) rows.push(['Attachment', file.name]);

  confirmSummary.innerHTML = rows.map(([label, value]) => `
    <div class="booking-confirm-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || '—')}</dd>
    </div>
  `).join('');

  confirmStatus.textContent = '';
  confirmStatus.className = 'form-status';
  confirmSendBtn.disabled = false;
  confirmSendBtn.textContent = 'Yes, send it';
  confirmOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeBookingConfirmation() {
  confirmOverlay.hidden = true;
  document.body.style.overflow = '';
}

confirmBackBtn?.addEventListener('click', closeBookingConfirmation);
closeConfirmBtn?.addEventListener('click', closeBookingConfirmation);
confirmOverlay?.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeBookingConfirmation();
});

confirmSendBtn?.addEventListener('click', async () => {
  confirmSendBtn.disabled = true;
  confirmSendBtn.textContent = 'Verifying…';
  confirmStatus.textContent = '';
  confirmStatus.className = 'form-status';

  // Get a fresh Turnstile token right now, rather than one fetched
  // when the page first loaded. Turnstile tokens expire after a
  // few minutes — this form (plus the confirmation step) can easily
  // take longer than that to get through, so relying on a page-load
  // token caused real visitors to hit "Verification failed" through
  // no fault of their own.
  let freshToken;
  try {
    freshToken = await getTurnstileToken('booking-turnstile');
  } catch (err) {
    console.error('Turnstile setup failed:', err);
    confirmStatus.textContent = "Could not verify — please try again.";
    confirmStatus.classList.add('form-status--error');
    confirmSendBtn.disabled = false;
    confirmSendBtn.textContent = 'Yes, send it';
    return;
  }

  confirmSendBtn.textContent = 'Sending…';

  const isHuman = await verifyTurnstileToken(freshToken);
  if (!isHuman) {
    confirmStatus.textContent = "Verification failed. Please try again.";
    confirmStatus.classList.add('form-status--error');
    confirmSendBtn.disabled = false;
    confirmSendBtn.textContent = 'Yes, send it';
    return;
  }

  const formData = new FormData(bookingForm);

  // Upload attachment first, if present
  let attachmentPath = null;
  const file = attachmentInput?.files[0];
  if (file) {
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('booking-attachments')
      .upload(safeName, file, { contentType: file.type });

    if (uploadError) {
      console.error('Attachment upload failed:', uploadError);
      confirmStatus.textContent = "Could not upload the attached file. You can still submit without it.";
      confirmStatus.classList.add('form-status--error');
    } else {
      attachmentPath = safeName;
    }
  }

  const booking = {
    owner_name: formData.get('owner_name').trim(),
    owner_contact: formData.get('owner_contact').trim(),
    pet_name: formData.get('pet_name').trim(),
    pet_species: formData.get('pet_species').trim(),
    service: formData.get('service'),
    preferred_datetime: new Date(formData.get('preferred_datetime')).toISOString(),
    notes: formData.get('notes')?.trim() || null,
    attachment_path: attachmentPath,
    status: 'pending'
  };

  const { error } = await supabaseClient.from('bookings').insert([booking]);

  confirmSendBtn.disabled = false;
  confirmSendBtn.textContent = 'Yes, send it';

  if (error) {
    console.error('Booking submission failed:', error);
    // The database itself enforces a rate limit (see
    // sql/17_booking_rate_limit.sql) — show its actual message when
    // that's what happened, rather than a generic failure that would
    // wrongly suggest something's broken.
    const isRateLimit = /too many booking requests/i.test(error.message || '');
    confirmStatus.textContent = isRateLimit
      ? error.message
      : "Something went wrong sending your request. Please call us instead, or try again.";
    confirmStatus.classList.add('form-status--error');
    return;
  }

  closeBookingConfirmation();
  formStatus.textContent = "Request sent! We'll confirm your appointment soon.";
  formStatus.classList.add('form-status--success');
  bookingForm.reset();
  attachmentStatus.textContent = '';
});
