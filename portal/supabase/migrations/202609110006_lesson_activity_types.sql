-- Lesson records retain their original stored titles for audit history.
-- The operational UI presents the activity type instead: Flight, Ground, Sim, or Solo.
alter type public.lesson_kind add value if not exists 'solo';
