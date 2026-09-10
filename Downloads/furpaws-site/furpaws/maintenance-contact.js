// Maintenance page contact form — sends an internal message (via the
// same internal_messages system the main site's "Message the clinic"
// modal uses) directly to the developer's inbox. Not a real email —
// this shows up in the developer dashboard's Feedback/Inbox area.
//
// Works even while site_shutdown is active: that flag only controls
// whether index.html redirects visitors here — it doesn't disable
// Supabase itself, so this insert goes through normally.

const TO_ADDRESS = 'franzmembrerejr@furpawsclinic.support';

const toggleBtn = document.getElementById('contact-toggle');
const form = document.getElementById('contact-form');
const status = document.getElementById('mnt-status');
const submitBtn = document.getElementById('mnt-submit');

toggleBtn.addEventListener('click', () => {
  const isOpen = form.classList.toggle('is-open');
  toggleBtn.style.display = isOpen ? 'none' : '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Honeypot check
  const honeypot = document.getElementById('mnt-hp').value;
  if (honeypot) {
    status.textContent = 'Message sent.';
    status.className = 'form-status form-status--success';
    form.reset();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying…';
  status.textContent = '';
  status.className = 'form-status';

  let freshToken;
  try {
    freshToken = await getTurnstileToken('mnt-turnstile');
  } catch (err) {
    status.textContent = 'Could not verify — please try again.';
    status.className = 'form-status form-status--error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send message';
    return;
  }

  const isHuman = await verifyTurnstileToken(freshToken);
  if (!isHuman) {
    status.textContent = 'Verification failed. Please try again.';
    status.className = 'form-status form-status--error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send message';
    return;
  }

  submitBtn.textContent = 'Sending…';

  const fromName = document.getElementById('mnt-name').value.trim();
  const fromContact = document.getElementById('mnt-contact').value.trim();

  const payload = {
    from_address: `client:${fromName} <${fromContact}>`,
    to_address: TO_ADDRESS,
    subject: 'Message from maintenance page',
    body: document.getElementById('mnt-message').value.trim(),
    read: false,
  };

  const { error } = await supabaseClient.from('internal_messages').insert([payload]);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send message';

  if (error) {
    status.textContent = 'Could not send. Please try again.';
    status.className = 'form-status form-status--error';
    console.error('Maintenance contact form failed:', error);
    return;
  }

  status.textContent = 'Message sent — it will show up in the inbox.';
  status.className = 'form-status form-status--success';
  form.reset();
});
