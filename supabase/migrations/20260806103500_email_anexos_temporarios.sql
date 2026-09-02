-- Transporte temporário de anexos de e-mail sem base64 no payload das Vercel Functions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-anexos-temporarios',
  'email-anexos-temporarios',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "email_anexos_temporarios_insert_own" on storage.objects;
create policy "email_anexos_temporarios_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'email-anexos-temporarios'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "email_anexos_temporarios_select_own" on storage.objects;
create policy "email_anexos_temporarios_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'email-anexos-temporarios'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "email_anexos_temporarios_delete_own" on storage.objects;
create policy "email_anexos_temporarios_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'email-anexos-temporarios'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
