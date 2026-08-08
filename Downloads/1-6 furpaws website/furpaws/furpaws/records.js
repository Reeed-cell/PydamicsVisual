// Records page — pet profiles + visit records, with client-side
// image compression before upload to Supabase Storage.

let currentStaff = null;
let allPets = [];
let selectedPet = null;

const loadingState = document.getElementById('loading-state');
const noAccessView = document.getElementById('no-access-view');
const recordsView = document.getElementById('records-view');
const dashUserLabel = document.getElementById('dash-user-label');
const logoutBtn = document.getElementById('logout-btn');

const petSearch = document.getElementById('pet-search');
const petsList = document.getElementById('pets-list');
const petsEmpty = document.getElementById('pets-empty');
const newPetBtn = document.getElementById('new-pet-btn');
const newPetFormWrap = document.getElementById('new-pet-form-wrap');
const newPetForm = document.getElementById('new-pet-form');
const cancelNewPet = document.getElementById('cancel-new-pet');
const newPetStatus = document.getElementById('new-pet-status');

const petDetail = document.getElementById('pet-detail');
const backToList = document.getElementById('back-to-list');
const detailPetName = document.getElementById('detail-pet-name');
const detailPetMeta = document.getElementById('detail-pet-meta');
const newRecordForm = document.getElementById('new-record-form');
const newRecordStatus = document.getElementById('new-record-status');
const recordImagesInput = document.getElementById('record-images');
const imageCompressStatus = document.getElementById('image-compress-status');
const recordsHistory = document.getElementById('records-history');
const recordsEmpty = document.getElementById('records-empty');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- AUTH ----------

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
    return;
  }

  currentStaff = staffRow;
  dashUserLabel.textContent = `${staffRow.full_name} · ${staffRow.role.replace('_', ' ')}`;

  if (['owner', 'assistant_vet', 'receptionist'].includes(staffRow.role)) {
    recordsView.hidden = false;
    // Only owner + assistant_vet can create — hide creation UI for receptionists
    const canEdit = staffRow.role === 'owner' || staffRow.role === 'assistant_vet';
    if (!canEdit) {
      newPetBtn.style.display = 'none';
    }
    loadPets();
  } else {
    noAccessView.hidden = false;
  }
}

// ---------- PET LIST ----------

async function loadPets() {
  const { data, error } = await supabaseClient
    .from('pets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    petsList.innerHTML = `<p class="dash-empty">Couldn't load pets. Try refreshing.</p>`;
    console.error(error);
    return;
  }

  allPets = data || [];
  renderPetsList(allPets);
}

function renderPetsList(pets) {
  petsEmpty.hidden = pets.length !== 0;
  petsList.innerHTML = pets.map(p => `
    <article class="pet-card" data-id="${p.id}">
      <div>
        <h3>${escapeHtml(p.name)} <span class="booking-species">(${escapeHtml(p.species)})</span></h3>
        <p class="booking-meta">Owner: ${escapeHtml(p.owner_name)} · ${escapeHtml(p.owner_contact)}</p>
      </div>
      <span class="pet-card-arrow">→</span>
    </article>
  `).join('');

  petsList.querySelectorAll('.pet-card').forEach(card => {
    card.addEventListener('click', () => openPetDetail(card.dataset.id));
  });
}

petSearch.addEventListener('input', () => {
  const q = petSearch.value.trim().toLowerCase();
  const filtered = allPets.filter(p =>
    p.name.toLowerCase().includes(q) || p.owner_name.toLowerCase().includes(q)
  );
  renderPetsList(filtered);
});

// ---------- NEW PET ----------

newPetBtn.addEventListener('click', () => {
  newPetFormWrap.hidden = false;
  newPetBtn.style.display = 'none';
});
cancelNewPet.addEventListener('click', () => {
  newPetFormWrap.hidden = true;
  newPetBtn.style.display = '';
  newPetForm.reset();
});

newPetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  newPetStatus.textContent = '';

  const newPet = {
    name: document.getElementById('pet-name').value.trim(),
    species: document.getElementById('pet-species').value.trim(),
    breed: document.getElementById('pet-breed').value.trim() || null,
    birthdate: document.getElementById('pet-birthdate').value || null,
    weight_kg: document.getElementById('pet-weight').value || null,
    owner_name: document.getElementById('owner-name').value.trim(),
    owner_contact: document.getElementById('owner-contact').value.trim(),
    general_notes: document.getElementById('general-notes').value.trim() || null,
  };

  const { data, error } = await supabaseClient.from('pets').insert([newPet]).select().single();

  if (error) {
    newPetStatus.textContent = 'Could not create profile. Please try again.';
    newPetStatus.className = 'form-status form-status--error';
    console.error(error);
    return;
  }

  newPetForm.reset();
  newPetFormWrap.hidden = true;
  newPetBtn.style.display = '';
  await loadPets();
  openPetDetail(data.id);
});

// ---------- PET DETAIL ----------

async function openPetDetail(petId) {
  const pet = allPets.find(p => p.id === petId) || (await fetchPetById(petId));
  if (!pet) return;

  selectedPet = pet;
  detailPetName.textContent = pet.name;
  detailPetMeta.textContent = `${pet.species}${pet.breed ? ' · ' + pet.breed : ''} · Owner: ${pet.owner_name}`;

  document.querySelector('.records-search-row').style.display = 'none';
  petsList.style.display = 'none';
  petsEmpty.style.display = 'none';
  newPetFormWrap.hidden = true;
  petDetail.hidden = false;

  document.getElementById('visit-date').valueAsDate = new Date();

  loadRecordsForPet(petId);
}

async function fetchPetById(id) {
  const { data } = await supabaseClient.from('pets').select('*').eq('id', id).single();
  return data;
}

backToList.addEventListener('click', () => {
  petDetail.hidden = true;
  document.querySelector('.records-search-row').style.display = '';
  petsList.style.display = '';
  petsEmpty.style.display = '';
  selectedPet = null;
});

// ---------- IMAGE COMPRESSION ----------

function compressImage(file, maxDimension = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) {
        height = Math.round(height * (maxDimension / width));
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round(width * (maxDimension / height));
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;

    reader.readAsDataURL(file);
  });
}

// ---------- NEW RECORD ----------

newRecordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPet || !currentStaff) return;

  newRecordStatus.textContent = '';
  const submitBtn = document.getElementById('record-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  const imagePaths = [];
  const files = recordImagesInput.files;

  if (files.length > 0) {
    imageCompressStatus.textContent = `Compressing ${files.length} image(s)…`;

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBlob = await compressImage(files[i]);
        const fileName = `${selectedPet.id}/${Date.now()}-${i}.jpg`;

        const { error: uploadError } = await supabaseClient.storage
          .from('pet-record-images')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

        if (uploadError) {
          console.error('Upload failed:', uploadError);
          continue;
        }
        imagePaths.push(fileName);
      } catch (err) {
        console.error('Compression failed:', err);
      }
    }
    imageCompressStatus.textContent = imagePaths.length > 0
      ? `${imagePaths.length} image(s) uploaded.`
      : 'Image upload failed — record will save without photos.';
  }

  const newRecord = {
    pet_id: selectedPet.id,
    written_by: currentStaff.id,
    visit_date: document.getElementById('visit-date').value,
    diagnosis: document.getElementById('diagnosis').value.trim() || null,
    treatment: document.getElementById('treatment').value.trim() || null,
    medications: document.getElementById('medications').value.trim() || null,
    image_paths: imagePaths.length > 0 ? imagePaths : null,
  };

  const { error } = await supabaseClient.from('pet_records').insert([newRecord]);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Save record';

  if (error) {
    newRecordStatus.textContent = 'Could not save record. Please try again.';
    newRecordStatus.className = 'form-status form-status--error';
    console.error(error);
    return;
  }

  newRecordStatus.textContent = 'Record saved.';
  newRecordStatus.className = 'form-status form-status--success';
  newRecordForm.reset();
  document.getElementById('visit-date').valueAsDate = new Date();
  imageCompressStatus.textContent = '';
  loadRecordsForPet(selectedPet.id);
});

// ---------- RECORD HISTORY ----------

async function loadRecordsForPet(petId) {
  const { data, error } = await supabaseClient
    .from('pet_records')
    .select('*, staff(full_name)')
    .eq('pet_id', petId)
    .order('visit_date', { ascending: false });

  if (error) {
    recordsHistory.innerHTML = `<p class="dash-empty">Couldn't load records.</p>`;
    console.error(error);
    return;
  }

  recordsEmpty.hidden = data.length !== 0;
  recordsHistory.innerHTML = data.map(renderRecordCard).join('');
}

function renderRecordCard(r) {
  const images = (r.image_paths || []).map(path => {
    const { data } = supabaseClient.storage.from('pet-record-images').getPublicUrl(path);
    return `<img src="${data.publicUrl}" alt="Record photo" class="record-thumb">`;
  }).join('');

  return `
    <article class="booking-card">
      <div class="booking-card-main">
        <div class="booking-card-top">
          <h3>${new Date(r.visit_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</h3>
          <span class="booking-meta">${r.staff?.full_name ? 'by ' + escapeHtml(r.staff.full_name) : ''}</span>
        </div>
        ${r.diagnosis ? `<p class="booking-service">Diagnosis: ${escapeHtml(r.diagnosis)}</p>` : ''}
        ${r.treatment ? `<p class="booking-meta">Treatment: ${escapeHtml(r.treatment)}</p>` : ''}
        ${r.medications ? `<p class="booking-meta">Medications: ${escapeHtml(r.medications)}</p>` : ''}
        ${images ? `<div class="record-images">${images}</div>` : ''}
      </div>
    </article>
  `;
}

checkAuthAndLoad();

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'staff-login.html';
});
