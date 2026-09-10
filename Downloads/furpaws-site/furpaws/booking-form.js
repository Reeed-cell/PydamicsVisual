// Booking form — submits to Supabase 'bookings' table.
// Protected by: a honeypot field (silent bot trap) and Cloudflare
// Turnstile (invisible human check, verified server-side via an
// Edge Function so the secret key never reaches the browser).

const bookingForm = document.getElementById('booking-form');
const formStatus = document.getElementById('form-status');
const submitBtn = document.getElementById('booking-submit');
const attachmentInput = document.getElementById('booking-attachment');
const attachmentStatus = document.getElementById('booking-attachment-status');

const MAX_ATTACHMENT_MB = 25;

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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying…';
    formStatus.textContent = '';
    formStatus.className = 'form-status';

    // Get a fresh Turnstile token right now, rather than one fetched
    // when the page first loaded. Turnstile tokens expire after a
    // few minutes — this form can easily take longer than that to
    // fill out (pet details, date picker, notes, an attachment), so
    // relying on a page-load token caused real visitors to hit
    // "Verification failed" through no fault of their own.
    let freshToken;
    try {
      freshToken = await getTurnstileToken('booking-turnstile');
    } catch (err) {
      console.error('Turnstile setup failed:', err);
      formStatus.textContent = "Could not verify — please refresh the page and try again.";
      formStatus.classList.add('form-status--error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request booking';
      return;
    }

    submitBtn.textContent = 'Sending…';

    const isHuman = await verifyTurnstileToken(freshToken);
    if (!isHuman) {
      formStatus.textContent = "Verification failed. Please try again.";
      formStatus.classList.add('form-status--error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request booking';
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
        formStatus.textContent = "Could not upload the attached file. You can still submit without it.";
        formStatus.classList.add('form-status--error');
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

    if (error) {
      console.error('Booking submission failed:', error);
      formStatus.textContent = "Something went wrong sending your request. Please call us instead, or try again.";
      formStatus.classList.add('form-status--error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request booking';
      return;
    }

    formStatus.textContent = "Request sent! We'll confirm your appointment soon.";
    formStatus.classList.add('form-status--success');
    bookingForm.reset();
    attachmentStatus.textContent = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request booking';
  });
}
