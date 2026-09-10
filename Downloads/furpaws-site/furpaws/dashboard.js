// Dashboard — role-based views.
// Owner: stats, bookings, products editor, staff list, schedule editor.
// Developer: live status, storage usage, error log, feedback inbox.

const loadingState = document.getElementById('loading-state');
const noAccessView = document.getElementById('no-access-view');
const ownerView = document.getElementById('owner-view');
const devView = document.getElementById('dev-view');
const dashUserLabel = document.getElementById('dash-user-label');
const logoutBtn = document.getElementById('logout-btn');

let currentStaff = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}
function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ---------- AUTH + ROUTING ----------

async function checkAuthAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'staff-login.html'; return; }

  // If this account has 2FA enabled, make sure the second factor was
  // actually verified this session — not just the password step.
  // If this check itself fails (network hiccup, etc.), aal would be
  // undefined and aal.nextLevel would throw uncaught — crashing the
  // whole auth check instead of failing safely. Fail toward requiring
  // login again rather than either crashing or silently letting
  // someone through.
  const { data: aal, error: aalError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aal) {
    console.error('Could not determine assurance level:', aalError);
    window.location.href = 'staff-login.html';
    return;
  }
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    window.location.href = 'staff-login.html';
    return;
  }

  const { data: staffRow, error } = await supabaseClient
    .from('staff')
    .select('id, full_name, role, account_disabled')
    .eq('auth_user_id', session.user.id)
    .single();

  loadingState.hidden = true;

  if (error || !staffRow) {
    noAccessView.hidden = false;
    return;
  }

  // Account was disabled (manually, or by an auto-trigger) since this
  // session started — sign out immediately rather than letting an
  // already-open tab keep working.
  if (staffRow.account_disabled) {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  // Site-wide staff shutdown active — kicks everyone EXCEPT the
  // developer account. That exemption is deliberate: the developer
  // needs to be able to get in and resolve the incident that likely
  // caused the shutdown in the first place. Every other role still
  // gets signed out immediately.
  const { data: statusRow } = await supabaseClient
    .from('site_status')
    .select('staff_shutdown')
    .eq('id', 1)
    .single();
  if (statusRow?.staff_shutdown && staffRow.role !== 'developer') {
    await supabaseClient.auth.signOut();
    window.location.href = 'staff-login.html';
    return;
  }

  currentStaff = staffRow;
  dashUserLabel.textContent = `${staffRow.full_name} · ${staffRow.role.replace('_', ' ')}`;

  if (staffRow.role === 'owner') {
    ownerView.hidden = false;
    initTabs('owner-tabs');
    loadOwnerStats();
    initCalendar();
    loadBookings();
    loadProducts();
    loadStaffList();
    loadShifts();
    populateShiftStaffDropdown();
  } else if (staffRow.role === 'developer') {
    devView.hidden = false;
    initTabs('dev-tabs');
    loadDevStats();
    loadFeedback();
    loadErrorLog();
    loadTableCounts();
    loadActivityChart();
  } else {
    // assistant_vet / receptionist — bookings-only view, reusing owner markup minus admin tabs
    ownerView.hidden = false;
    document.querySelectorAll('#owner-tabs .dash-tab:not([data-tab="bookings"])').forEach(t => t.style.display = 'none');
    document.getElementById('stats-grid').style.display = 'none';
    loadBookings();
  }
}

function initTabs(tabGroupId) {
  const group = document.getElementById(tabGroupId);
  const section = group.closest('.dash-view');
  group.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      group.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      section.querySelectorAll('.dash-tab-panel').forEach(p => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    });
  });
}

// ============================================
// OWNER: STATS
// ============================================

async function loadOwnerStats() {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

  const [todayRes, pendingRes, weekRes, petsRes] = await Promise.all([
    supabaseClient.from('bookings').select('id', { count: 'exact', head: true })
      .gte('preferred_datetime', todayStart.toISOString()).lte('preferred_datetime', todayEnd.toISOString()),
    supabaseClient.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseClient.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', weekStart.toISOString()),
    supabaseClient.from('pets').select('id', { count: 'exact', head: true }),
  ]);

  document.getElementById('stat-today').textContent = todayRes.count ?? '0';
  document.getElementById('stat-pending').textContent = pendingRes.count ?? '0';
  document.getElementById('stat-week').textContent = weekRes.count ?? '0';
  document.getElementById('stat-pets').textContent = petsRes.count ?? '0';
}

// ============================================
// OWNER: BOOKINGS
// ============================================

const STATUS_OPTIONS = ['pending', 'confirmed', 'done', 'cancelled'];

let allBookings = [];
let currentBookingFilter = 'all';

async function loadBookings() {
  const list = document.getElementById('bookings-list');
  const empty = document.getElementById('bookings-empty');

  const { data: bookings, error } = await supabaseClient
    .from('bookings').select('*').order('created_at', { ascending: false });

  if (error) { list.innerHTML = `<p class="dash-empty">Couldn't load bookings.</p>`; return; }

  allBookings = bookings || [];
  empty.hidden = allBookings.length !== 0;
  if (allBookings.length === 0) { list.innerHTML = ''; return; }

  renderFilteredBookings();
}

function renderFilteredBookings() {
  const list = document.getElementById('bookings-list');
  const filterEmpty = document.getElementById('bookings-filter-empty');

  const filtered = currentBookingFilter === 'all'
    ? allBookings
    : allBookings.filter(b => b.status === currentBookingFilter);

  filterEmpty.hidden = filtered.length !== 0 || allBookings.length === 0;

  if (filtered.length === 0) { list.innerHTML = ''; return; }

  list.innerHTML = filtered.map(renderBookingCard).join('');
  list.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const previousValue = e.target.dataset.previousValue || e.target.value;
      const { error } = await supabaseClient.from('bookings').update({ status: e.target.value }).eq('id', e.target.dataset.id);
      if (error) {
        alert('Could not update status. Please try again.');
        console.error('Booking status update failed:', error);
        e.target.value = previousValue;
        return;
      }
      e.target.dataset.previousValue = e.target.value;
      e.target.closest('.booking-card').dataset.status = e.target.value;

      // Keep the cached list in sync so switching filters afterward
      // reflects the change without needing a full re-fetch.
      const cached = allBookings.find(b => b.id === e.target.dataset.id);
      if (cached) cached.status = e.target.value;

      // If we're viewing a specific status filter and this booking no
      // longer matches it, re-render so it drops out of view.
      if (currentBookingFilter !== 'all' && e.target.value !== currentBookingFilter) {
        renderFilteredBookings();
      }
    });
  });
}

const bookingFilterRow = document.getElementById('booking-filter-row');
if (bookingFilterRow) {
  bookingFilterRow.querySelectorAll('.booking-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      bookingFilterRow.querySelectorAll('.booking-filter-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentBookingFilter = chip.dataset.statusFilter;
      renderFilteredBookings();
    });
  });
}

function renderBookingCard(b) {
  const statusOptions = STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`
  ).join('');

  let attachmentHtml = '';
  if (b.attachment_path) {
    const { data } = supabaseClient.storage.from('booking-attachments').getPublicUrl(b.attachment_path);
    const ext = b.attachment_path.split('.').pop().toLowerCase();
    const videoExtensions = ['mp4', 'webm', 'mov', 'ogg'];
    attachmentHtml = videoExtensions.includes(ext)
      ? `<video src="${data.publicUrl}" class="record-thumb" controls muted style="margin-top:10px;"></video>`
      : `<img src="${data.publicUrl}" alt="Booking attachment" class="record-thumb" style="margin-top:10px;">`;
  }

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
        ${attachmentHtml}
      </div>
    </article>`;
}

// ============================================
// OWNER: PRODUCTS
// ============================================

const newProductBtn = document.getElementById('new-product-btn');
const newProductFormWrap = document.getElementById('new-product-form-wrap');
const newProductForm = document.getElementById('new-product-form');

if (newProductBtn) {
  newProductBtn.addEventListener('click', () => { newProductFormWrap.hidden = false; newProductBtn.style.display = 'none'; });
  document.getElementById('cancel-new-product').addEventListener('click', () => {
    newProductFormWrap.hidden = true; newProductBtn.style.display = ''; newProductForm.reset();
  });

  newProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('new-product-status');
    const payload = {
      name: document.getElementById('prod-name').value.trim(),
      brand: document.getElementById('prod-brand').value.trim() || null,
      cost: document.getElementById('prod-cost').value.trim() || null,
      description: document.getElementById('prod-desc').value.trim() || null,
      in_stock: document.getElementById('prod-stock').value === 'true',
    };
    const { error } = await supabaseClient.from('products').insert([payload]);
    if (error) { status.textContent = 'Could not save.'; status.className = 'form-status form-status--error'; return; }
    newProductForm.reset();
    newProductFormWrap.hidden = true;
    newProductBtn.style.display = '';
    loadProducts();
  });
}

async function loadProducts() {
  const list = document.getElementById('products-list');
  if (!list) return;
  const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
  if (error || !data) { list.innerHTML = `<p class="dash-empty">Couldn't load products.</p>`; return; }

  list.innerHTML = data.map(p => `
    <article class="pet-card" style="cursor:default;">
      <div>
        <h3>${escapeHtml(p.name)} ${p.brand ? `<span class="booking-species">— ${escapeHtml(p.brand)}</span>` : ''} ${p.cost ? `<span class="booking-species">· ${escapeHtml(p.cost)}</span>` : ''}</h3>
        ${p.description ? `<p class="booking-meta">${escapeHtml(p.description)}</p>` : ''}
      </div>
      <button class="btn btn-ghost toggle-stock-btn" data-id="${p.id}" data-stock="${p.in_stock}">${p.in_stock ? 'In stock' : 'Out of stock'}</button>
    </article>
  `).join('');

  list.querySelectorAll('.toggle-stock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStock = btn.dataset.stock !== 'true';
      const { error } = await supabaseClient.from('products').update({ in_stock: newStock }).eq('id', btn.dataset.id);
      if (error) {
        alert('Could not update product. Please try again.');
        console.error('Product stock-toggle failed:', error);
        return;
      }
      loadProducts();
    });
  });
}

// ============================================
// OWNER: STAFF LIST (read-only)
// ============================================

async function loadStaffList() {
  const list = document.getElementById('staff-list');
  if (!list) return;
  const { data, error } = await supabaseClient.from('staff').select('full_name, role, internal_address, username').order('role');
  if (error || !data) { list.innerHTML = `<p class="dash-empty">Couldn't load staff.</p>`; return; }

  list.innerHTML = data.map(s => `
    <article class="pet-card" style="cursor:default;">
      <div>
        <h3>${escapeHtml(s.full_name)} <span class="booking-species">(${escapeHtml(s.role.replace('_',' '))})</span></h3>
        <p class="booking-meta">${escapeHtml(s.internal_address)} · @${escapeHtml(s.username)}</p>
      </div>
    </article>
  `).join('');
}

// ============================================
// OWNER: SCHEDULE
// ============================================

async function populateShiftStaffDropdown() {
  const select = document.getElementById('shift-staff');
  if (!select) return;
  const { data } = await supabaseClient.from('staff').select('id, full_name').order('full_name');
  select.innerHTML = (data || []).map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('');
}

const newShiftForm = document.getElementById('new-shift-form');
if (newShiftForm) {
  newShiftForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('new-shift-status');
    const payload = {
      staff_id: document.getElementById('shift-staff').value,
      date: document.getElementById('shift-date').value,
      start_time: document.getElementById('shift-start').value,
      end_time: document.getElementById('shift-end').value,
    };
    const { error } = await supabaseClient.from('shifts').insert([payload]);
    if (error) { status.textContent = 'Could not add shift.'; status.className = 'form-status form-status--error'; return; }
    status.textContent = 'Shift added.';
    status.className = 'form-status form-status--success';
    newShiftForm.reset();
    document.getElementById('shift-start').value = '14:00';
    document.getElementById('shift-end').value = '19:00';
    loadShifts();
  });
}

async function loadShifts() {
  const list = document.getElementById('shifts-list');
  const empty = document.getElementById('shifts-empty');
  if (!list) return;

  const { data, error } = await supabaseClient
    .from('shifts').select('*, staff(full_name)')
    .gte('date', toISODate(new Date()))
    .order('date', { ascending: true });

  if (error || !data) { list.innerHTML = `<p class="dash-empty">Couldn't load shifts.</p>`; return; }
  empty.hidden = data.length !== 0;

  list.innerHTML = data.map(s => `
    <article class="booking-card">
      <div class="booking-card-main">
        <div class="booking-card-top">
          <h3>${formatDate(s.date)}</h3>
        </div>
        <p class="booking-service">${escapeHtml(s.staff?.full_name || 'Unknown')}</p>
        <p class="booking-meta">${s.start_time} – ${s.end_time}</p>
      </div>
    </article>
  `).join('');
}

// ============================================
// DEVELOPER: STATS
// ============================================

async function loadDevStats() {
  const dbStatusEl = document.getElementById('stat-db-status');
  const storageEl = document.getElementById('stat-storage-used');
  const errorsEl = document.getElementById('stat-errors-24h');
  const feedbackEl = document.getElementById('stat-open-feedback');

  // DB reachability check
  const { error: dbError } = await supabaseClient.from('staff').select('id', { head: true, count: 'exact' });
  dbStatusEl.textContent = dbError ? 'Down' : 'Online';
  dbStatusEl.parentElement.classList.toggle('stat-card--bad', !!dbError);
  dbStatusEl.parentElement.classList.toggle('stat-card--good', !dbError);

  // Storage usage
  try {
    const { data: files } = await supabaseClient.storage.from('pet-record-images').list('', { limit: 1000 });
    let totalBytes = 0;
    if (files) {
      for (const f of files) {
        if (f.metadata?.size) totalBytes += f.metadata.size;
      }
    }
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    storageEl.textContent = `${mb} MB`;
  } catch {
    storageEl.textContent = '—';
  }

  // Errors in last 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: errorCount } = await supabaseClient
    .from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', yesterday);
  errorsEl.textContent = errorCount ?? '0';
  errorsEl.parentElement.classList.toggle('stat-card--bad', (errorCount ?? 0) > 0);

  // Open feedback
  const { count: feedbackCount } = await supabaseClient
    .from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'open');
  feedbackEl.textContent = feedbackCount ?? '0';
}

// ============================================
// DEVELOPER: FEEDBACK
// ============================================

async function loadFeedback() {
  const list = document.getElementById('feedback-list');
  const empty = document.getElementById('feedback-empty');
  if (!list) return;

  const { data: items, error } = await supabaseClient.from('feedback').select('*').order('created_at', { ascending: false });
  if (error) { list.innerHTML = `<p class="dash-empty">Couldn't load feedback.</p>`; return; }
  if (!items || items.length === 0) { empty.hidden = false; return; }

  list.innerHTML = items.map(f => {
    const options = ['open', 'resolved'].map(s => `<option value="${s}" ${s === f.status ? 'selected' : ''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('');
    return `
      <article class="booking-card" data-status="${escapeHtml(f.status)}">
        <div class="booking-card-main">
          <div class="booking-card-top">
            <h3>${f.category ? escapeHtml(f.category[0].toUpperCase() + f.category.slice(1)) : 'Feedback'}</h3>
            <select class="status-select" data-id="${f.id}">${options}</select>
          </div>
          <p class="booking-service">${escapeHtml(f.message)}</p>
          <p class="booking-meta">${formatDateTime(f.created_at)}</p>
          ${f.name || f.email ? `<p class="booking-meta">${escapeHtml(f.name||'')} ${f.email ? '· '+escapeHtml(f.email) : ''}</p>` : ''}
        </div>
      </article>`;
  }).join('');

  list.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const previousValue = e.target.dataset.previousValue || e.target.value;
      const { error } = await supabaseClient
        .from('feedback')
        .update({ status: e.target.value })
        .eq('id', e.target.dataset.id);

      if (error) {
        alert('Could not update status. Please try again.');
        console.error('Feedback status update failed:', error);
        e.target.value = previousValue; // revert the visible selection to match reality
        return;
      }
      e.target.dataset.previousValue = e.target.value;
      const card = e.target.closest('.booking-card');
      if (card) card.dataset.status = e.target.value;
    });
  });
}

// ============================================
// DEVELOPER: ERROR LOG
// ============================================

async function loadErrorLog() {
  const list = document.getElementById('errors-list');
  const empty = document.getElementById('errors-empty');
  if (!list) return;

  const { data, error } = await supabaseClient
    .from('error_logs').select('*').order('created_at', { ascending: false }).limit(50);

  if (error) { list.innerHTML = `<p class="dash-empty">Couldn't load error log.</p>`; return; }
  if (!data || data.length === 0) { empty.hidden = false; return; }

  list.innerHTML = data.map(e => `
    <article class="booking-card" data-status="cancelled">
      <div class="booking-card-main">
        <div class="booking-card-top">
          <h3 class="error-message">${escapeHtml(e.message)}</h3>
        </div>
        <p class="booking-meta">${formatDateTime(e.created_at)} · ${escapeHtml(e.page_url || 'unknown page')}</p>
        ${e.line_number ? `<p class="booking-meta">Line ${e.line_number}${e.column_number ? ':' + e.column_number : ''} · ${escapeHtml(e.source_url || '')}</p>` : ''}
        ${e.stack ? `<details class="error-stack-details"><summary>Stack trace</summary><pre class="error-stack">${escapeHtml(e.stack)}</pre></details>` : ''}
      </div>
    </article>
  `).join('');
}

// ============================================
// DEVELOPER: TABLE COUNTS
// ============================================

async function loadTableCounts() {
  const list = document.getElementById('table-counts-list');
  if (!list) return;

  const tables = ['staff', 'bookings', 'pets', 'pet_records', 'products', 'shifts', 'feedback', 'internal_messages', 'error_logs'];
  const results = await Promise.all(
    tables.map(t => supabaseClient.from(t).select('id', { count: 'exact', head: true }))
  );

  list.innerHTML = tables.map((t, i) => `
    <article class="pet-card" style="cursor:default;">
      <div><h3>${t}</h3></div>
      <span class="booking-species">${results[i].count ?? '—'} rows</span>
    </article>
  `).join('');
}

// ============================================
// OWNER: CALENDAR (shifts + bookings combined)
// ============================================

let calendarWeekStart = getMonday(new Date());

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// Returns YYYY-MM-DD from a Date's LOCAL calendar date — not its UTC
// date. This matters because .toISOString() always converts to UTC
// first: for a Philippines-based viewer (UTC+8), local midnight is
// still the previous day in UTC, so .toISOString().split('T')[0] was
// silently returning yesterday's date for every "today" calculation.
// That bug affected the calendar view (showing bookings/shifts under
// the wrong day) and the activity chart (miscounting entries near
// midnight). This is the single correct helper — used everywhere a
// calendar-day bucket is needed instead of an absolute timestamp.
function toISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initCalendar() {
  const prevBtn = document.getElementById('calendar-prev');
  const nextBtn = document.getElementById('calendar-next');
  if (!prevBtn) return;

  prevBtn.addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() - 7);
    renderCalendar();
  });
  nextBtn.addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() + 7);
    renderCalendar();
  });

  renderCalendar();
}

async function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const rangeLabel = document.getElementById('calendar-range-label');
  if (!grid) return;

  // Guards against a real race condition: clicking "next/previous
  // week" rapidly fires overlapping fetches, and if they resolve out
  // of order, the header label could end up showing one week while
  // the grid below actually displays a different week's data — a
  // confusing, persistent mismatch rather than a harmless flicker.
  // Each call gets a token; only the most recent call is allowed to
  // actually paint the DOM.
  const requestToken = Symbol();
  renderCalendar._latestToken = requestToken;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(calendarWeekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const weekStartISO = toISODate(days[0]);
  const weekEndISO = toISODate(days[6]);
  const weekEndExclusive = new Date(days[6]); weekEndExclusive.setDate(weekEndExclusive.getDate() + 1);

  grid.innerHTML = `<p class="dash-empty">Loading…</p>`;
  rangeLabel.textContent = `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;

  const [shiftsRes, bookingsRes] = await Promise.all([
    supabaseClient.from('shifts').select('*, staff(full_name, role)').gte('date', weekStartISO).lte('date', weekEndISO),
    supabaseClient.from('bookings').select('*').gte('preferred_datetime', days[0].toISOString()).lt('preferred_datetime', weekEndExclusive.toISOString()),
  ]);

  // A newer click already came in while we were waiting — let that
  // one own the final render instead of overwriting it with our
  // now-stale result.
  if (renderCalendar._latestToken !== requestToken) return;

  const shifts = shiftsRes.data || [];
  const bookings = bookingsRes.data || [];

  const todayISO = toISODate(new Date());

  grid.innerHTML = days.map(d => {
    const dISO = toISODate(d);
    const dayShifts = shifts.filter(s => s.date === dISO);
    const dayBookings = bookings.filter(b => toISODate(new Date(b.preferred_datetime)) === dISO);
    const isToday = dISO === todayISO;

    return `
      <div class="calendar-day ${isToday ? 'calendar-day--today' : ''}">
        <div class="calendar-day-head">
          <span class="calendar-day-name">${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
          <span class="calendar-day-date">${d.getDate()}</span>
        </div>
        <div class="calendar-day-shifts">
          ${dayShifts.length === 0
            ? `<span class="calendar-empty-note">No one scheduled</span>`
            : dayShifts.map(s => `<span class="calendar-shift-chip">${escapeHtml(s.staff?.full_name || '?')}</span>`).join('')}
        </div>
        <div class="calendar-day-bookings">
          ${dayBookings.length === 0
            ? ''
            : dayBookings.map(b => `
                <div class="calendar-booking-chip" data-status="${escapeHtml(b.status)}">
                  <span class="calendar-booking-time">${new Date(b.preferred_datetime).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                  <span class="calendar-booking-pet">${escapeHtml(b.pet_name)}</span>
                </div>
              `).join('')}
        </div>
      </div>
    `;
  }).join('');
}



// ============================================
// DEVELOPER: ACTIVITY (real 14-day booking + error trend)
// ============================================

async function loadActivityChart() {
  const container = document.getElementById('activity-chart');
  if (!container) return;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  const rangeStart = days[0].toISOString();

  const [bookingsRes, errorsRes] = await Promise.all([
    supabaseClient.from('bookings').select('created_at').gte('created_at', rangeStart),
    supabaseClient.from('error_logs').select('created_at').gte('created_at', rangeStart),
  ]);

  const bookings = bookingsRes.data || [];
  const errors = errorsRes.data || [];

  const dayKey = (iso) => toISODate(new Date(iso));
  const bookingCounts = {};
  const errorCounts = {};
  bookings.forEach(b => { const k = dayKey(b.created_at); bookingCounts[k] = (bookingCounts[k] || 0) + 1; });
  errors.forEach(e => { const k = dayKey(e.created_at); errorCounts[k] = (errorCounts[k] || 0) + 1; });

  const maxVal = Math.max(1, ...days.map(d => {
    const k = toISODate(d);
    return Math.max(bookingCounts[k] || 0, errorCounts[k] || 0);
  }));

  container.innerHTML = `
    <div class="activity-legend">
      <span class="activity-legend-item"><span class="activity-dot activity-dot--bookings"></span>Bookings</span>
      <span class="activity-legend-item"><span class="activity-dot activity-dot--errors"></span>Errors</span>
    </div>
    <div class="activity-bars">
      ${days.map(d => {
        const k = toISODate(d);
        const bCount = bookingCounts[k] || 0;
        const eCount = errorCounts[k] || 0;
        const bHeight = Math.round((bCount / maxVal) * 100);
        const eHeight = Math.round((eCount / maxVal) * 100);
        const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        return `
          <div class="activity-col" title="${label}: ${bCount} bookings, ${eCount} errors">
            <div class="activity-bar-pair">
              <div class="activity-bar activity-bar--bookings" style="height:${bHeight}%"></div>
              <div class="activity-bar activity-bar--errors" style="height:${eHeight}%"></div>
            </div>
            <span class="activity-col-label">${d.getDate()}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

checkAuthAndLoad();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
