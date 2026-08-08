# Furpaws Veterinary Clinic — Website

Public site + booking system for Furpaws Veterinary Clinic, Malabon.

## Structure

- `index.html` — main site (Home, Services, About, Booking, Contact)
- `styles.css` — design system and page styles
- `script.js` — hours status + mobile nav
- `booking-form.js` — booking form submission (writes to Supabase `bookings` table)
- `supabase-config.js` — Supabase project connection (uses the public anon key — safe to expose, protected by Row Level Security)
- `logo.png` — clinic logo
- `sql/` — database schema scripts (run these in the Supabase SQL Editor, in order)

## Local development

No build step — just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8080
```

## Deployment

Deployed via Vercel, connected to this GitHub repo. Every push to `main` redeploys automatically.

## Database

Supabase project — schema defined in `sql/`. Tables: `staff`, `shifts`, `services`, `bookings`, `patient_notes`, `internal_messages`, `feedback`. Row Level Security is enabled on all tables.

**Never commit a `service_role` key.** Only the public anon/publishable key belongs in this repo.
