# Pilot Consciousness Training Portal

The portal is a separate web application for invited students and instructors. It does not replace the public GitHub Pages marketing site.

## Product model

`Course → Course version → Phase → Lesson → ACS line item → Lesson attempt → OGMUI grade`

- A course version is shared by many student enrollments.
- Student progress belongs to the enrollment, not to the course template.
- Repeated lessons create new attempts and never overwrite prior attempts.
- Grade sheets remain drafts until an instructor publishes them.
- Students can read only published attempts connected to their own enrollments.

## Local design preview

The application uses representative student data when Supabase environment variables are absent.

```bash
npm install
npm run dev
```

## Backend setup

1. Create a Supabase project.
2. Apply `supabase/migrations/202609090001_initial_portal.sql`.
3. Apply `supabase/migrations/202609100001_account_profiles.sql`.
4. Create invited users from the administrative workflow or Supabase dashboard. A matching student profile is created automatically.
5. Promote only the business owner and approved instructors to their corresponding roles.
6. Copy `.env.example` to `.env.local` and provide the project URL and publishable anonymous key.

The login screen uses passwordless email links and explicitly prevents uninvited addresses from creating accounts.

## Security boundaries

- Row-level security is enabled on every application table.
- Students are limited to their own enrollments and published grade sheets.
- Instructors and the owner can manage course and training records.
- Training resources are held in a private storage bucket.
- Service-role credentials must never be placed in the browser application.
