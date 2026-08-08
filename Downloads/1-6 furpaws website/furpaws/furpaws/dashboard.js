// Dashboard — checks auth, loads the staff record, and shows the
// right view depending on role: owner sees bookings, developer sees
// the feedback inbox. Everyone else gets a "no access" message for now.

const loadingState = document.getElementById('loading-state');
const bookingsView = document.getElementById('bookings-view');
const feedbackView = document.getElementById('feedback-view');
const noAccessView = document.getElementById('no-access-view');
const dashUserLabel = document.getElementById('dash-user-label');
const logoutBtn = document.getElementById('logout-btn');

const STATUS_OPTIONS = ['pending', 'confirmed', 'done', 'cancelled'];

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function checkAuthAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'staff-login.html';
    return;
  }

  const { data: staffRow, error } = await supabaseClient
    .from('staff')
    .select('id, full_name, role')
    .eq('auth_user_id', session.user.id)
    .single();

  loadingState.hidden = true;

  if (error || !staffRow) {
    noAccessView.hidden = false;
    dashUserLabel.textContent = 'Unknown user';
    return;
  }

  dashUserLabel.textContent = `${staffRow.full_name} · ${staffRow.role.replace('_', ' ')}`;

  if (staffRow.role === 'owner' || staffRow.role === 'assistant_vet' || staffRow.role === 'receptionist') {
    bookingsView.hidden = false;
    loadBookings();
  } else if (staffRow.role === 'developer') {
    feedbackView.hidden = false;
    loadFeedback();
  } else {
    noAccessView.hidden = false;
  }
}

async function loadBookings() {
  const list = document.getElementById('bookings-list');
  const empty = document.getElementById('bookings-empty');

  const { data: bookings, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="dash-empty">Couldn't load bookings. Try refreshing.</p>`;
    console.error(error);
    return;
  }

  if (!bookings || bookings.length === 0) {
    empty.hidden = false;
    return;
  }

  list.innerHTML = bookings.map(renderBookingCard).join('');

  list.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const bookingId = e.target.dataset.id;
      const newStatus = e.target.value;
      const { error: updateError } = await supabaseClient
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', bookingId);

      if (updateError) {
        alert('Could not update status. Please try again.');
        console.error(updateError);
      } else {
        const card = e.target.closest('.booking-card');
        card.dataset.status = newStatus;
      }
    });
  });
}

function renderBookingCard(b) {
  const statusOptions = STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
  ).join('');

  return `
    <article class="booking-card" data-status="${escapeHtml(b.status)}">
      <div class="booking-card-main">
        <div class="booking-card-top">
          <h3>${escapeHtml(b.pet_name)} <span class="booking-species">(${escapeHtml(b.pet_species)})</span></h3>
          <select class="status-select" data-id="${b.id}">${statusOptions}</select>
        </div>
        <p class="booking-service">${escapeHtml(b.service)}</p>
        <p class="booking-meta">Requested: ${formatDateTime(b.preferred_datetime)}</p>
        <p class="booking-meta">Owner: ${escapeHtml(b.owner_name)} · ${escapeHtml(b.owner_contact)}</p>
        ${b.notes ? `<p class="booking-notes">"${escapeHtml(b.notes)}"</p>` : ''}
      </div>
    </article>
  `;
}

async function loadFeedback() {
  const list = document.getElementById('feedback-list');
  const empty = document.getElementById('feedback-empty');

  const { data: items, error } = await supabaseClient
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="dash-empty">Couldn't load feedback. Try refreshing.</p>`;
    console.error(error);
    return;
  }

  if (!items || items.length === 0) {
    empty.hidden = false;
    return;
  }

  list.innerHTML = items.map(renderFeedbackCard).join('');

  list.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      const { error: updateError } = await supabaseClient
        .from('feedback')
        .update({ status: newStatus })
        .eq('id', id);

      if (updateError) {
        alert('Could not update status. Please try again.');
        console.error(updateError);
      }
    });
  });
}

function renderFeedbackCard(f) {
  const options = ['open', 'resolved'].map(s =>
    `<option value="${s}" ${s === f.status ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
  ).join('');

  return `
    <article class="booking-card" data-status="${escapeHtml(f.status)}">
      <div class="booking-card-main">
        <div class="booking-card-top">
          <h3>${f.category ? escapeHtml(f.category.charAt(0).toUpperCase() + f.category.slice(1)) : 'Feedback'}</h3>
          <select class="status-select" data-id="${f.id}">${options}</select>
        </div>
        <p class="booking-service">${escapeHtml(f.message)}</p>
        <p class="booking-meta">${formatDateTime(f.created_at)}</p>
        ${f.name || f.email ? `<p class="booking-meta">${escapeHtml(f.name || '')} ${f.email ? `· ${escapeHtml(f.email)}` : ''}</p>` : ''}
      </div>
    </article>
  `;
}

checkAuthAndLoad();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
