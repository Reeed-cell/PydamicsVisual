// Service cards — click to open a modal with more detail per service.

const SERVICE_DETAILS = {
  checkups: {
    eyebrow: 'Wellness',
    title: 'Check-ups',
    body: "Routine exams to catch small issues before they become big ones — weight, heart, teeth, skin, the basics. Good for a new pet's first visit or a yearly check. Nothing wrong is a fine reason to come in.",
  },
  urgent: {
    eyebrow: 'Urgent',
    title: 'Urgent visits',
    body: "Limping, vomiting, not eating, acting off, or anything that doesn't feel right — bring them in. We'll assess what's going on and figure out next steps together.",
  },
  surgery: {
    eyebrow: 'Surgical',
    title: 'Basic Surgery',
    body: "We handle common, lower-risk procedures on-site, starting with a proper pre-op check and ending with a recovery plan you'll actually understand. For cases outside what we're licensed to perform here, we'll be upfront and point you toward the right specialist.",
  },
  lab: {
    eyebrow: 'Testing',
    title: 'Lab work',
    body: "On-site lab testing means more questions get answered the same day, instead of waiting on results from somewhere else. Useful on its own or alongside a check-up.",
  },
  diagnostics: {
    eyebrow: 'Imaging',
    title: 'Diagnostics',
    body: "When a check-up alone doesn't give the full picture, diagnostics help us look closer and figure out what's actually going on before deciding on treatment.",
  },
  pharmacy: {
    eyebrow: 'Pharmacy',
    title: 'Basic Pharmacy',
    body: "Common prescriptions are available right at the counter. Not everything is stocked on-site — if something you need isn't, we'll tell you exactly where to get it.",
  },
};

const serviceModalOverlay = document.getElementById('service-modal-overlay');
const closeServiceModalBtn = document.getElementById('close-service-modal');
const serviceModalEyebrow = document.getElementById('service-modal-eyebrow');
const serviceModalTitle = document.getElementById('service-modal-title');
const serviceModalBody = document.getElementById('service-modal-body');

document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('click', () => {
    const key = card.dataset.service;
    const detail = SERVICE_DETAILS[key];
    if (!detail) return;

    serviceModalEyebrow.textContent = detail.eyebrow;
    serviceModalTitle.textContent = detail.title;
    serviceModalBody.textContent = detail.body;

    serviceModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  });
});

if (closeServiceModalBtn) {
  closeServiceModalBtn.addEventListener('click', closeServiceModal);
  serviceModalOverlay.addEventListener('click', (e) => {
    if (e.target === serviceModalOverlay) closeServiceModal();
  });
  document.getElementById('service-modal-book').addEventListener('click', closeServiceModal);
}

function closeServiceModal() {
  serviceModalOverlay.hidden = true;
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && serviceModalOverlay && !serviceModalOverlay.hidden) {
    closeServiceModal();
  }
});
