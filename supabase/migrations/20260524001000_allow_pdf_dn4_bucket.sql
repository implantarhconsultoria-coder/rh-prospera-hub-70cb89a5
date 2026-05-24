-- Allow PDF uploads for DN4 migration attachments.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dn4-migracao',
  'dn4-migracao',
  false,
  52428800,
  ARRAY[
    'text/csv',
    'text/plain',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
