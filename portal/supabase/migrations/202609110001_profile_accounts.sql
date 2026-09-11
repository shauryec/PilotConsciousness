-- Self-managed contact profiles with private profile photos.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text,
  add column if not exists avatar_path text;

create or replace function public.guard_self_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = old.id and not public.is_portal_staff() then
    if new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.active is distinct from old.active
      or new.created_at is distinct from old.created_at then
      raise exception 'Account email, role, and status require staff administration.';
    end if;
    if new.avatar_path is not null and split_part(new.avatar_path, '/', 1) <> auth.uid()::text then
      raise exception 'A profile photo must belong to the signed-in account.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_self_admin_fields on public.profiles;
create trigger profiles_guard_self_admin_fields
before update on public.profiles
for each row execute function public.guard_self_profile_admin_fields();

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

drop policy if exists "profile_photos_read" on storage.objects;
create policy "profile_photos_read" on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (split_part(name, '/', 1) = auth.uid()::text or public.is_portal_staff())
);

drop policy if exists "profile_photos_insert" on storage.objects;
create policy "profile_photos_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
  and name ~* '\.(jpe?g|png|webp)$'
);

drop policy if exists "profile_photos_update" on storage.objects;
create policy "profile_photos_update" on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and split_part(name, '/', 1) = auth.uid()::text)
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
  and name ~* '\.(jpe?g|png|webp)$'
);

drop policy if exists "profile_photos_delete" on storage.objects;
create policy "profile_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and split_part(name, '/', 1) = auth.uid()::text);

