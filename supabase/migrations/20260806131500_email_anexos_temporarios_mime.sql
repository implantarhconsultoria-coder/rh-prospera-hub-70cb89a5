-- Amplia formatos de imagem aceitos pelo fluxo e mantém documentos corporativos permitidos.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/*',
  'text/csv',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
]::text[]
where id = 'email-anexos-temporarios';
