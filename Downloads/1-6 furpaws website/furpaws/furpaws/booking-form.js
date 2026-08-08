// Booking form — submits directly to Supabase 'bookings' table

const bookingForm = document.getElementById('booking-form');
const formStatus = document.getElementById('form-status');
const submitBtn = document.getElementById('booking-submit');

if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    formStatus.textContent = '';
    formStatus.className = 'form-status';

    const formData = new FormData(bookingForm);

    const booking = {
      owner_name: formData.get('owner_name').trim(),
      owner_contact: formData.get('owner_contact').trim(),
      pet_name: formData.get('pet_name').trim(),
      pet_species: formData.get('pet_species').trim(),
      service: formData.get('service'),
      preferred_datetime: new Date(formData.get('preferred_datetime')).toISOString(),
      notes: formData.get('notes')?.trim() || null,
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
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request booking';
  });
}
