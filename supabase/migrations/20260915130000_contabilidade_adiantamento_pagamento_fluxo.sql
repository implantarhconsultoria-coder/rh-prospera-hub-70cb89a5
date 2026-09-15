-- Fluxo mensal da Contabilidade: Adiantamento + Pagamento
-- Estrutura aditiva, sem remover nem alterar o fluxo legado.

alter table public.contabilidade_portal_usuarios
  add column if not exists codigo_inicial_hash text,
  add column if not exists pin_hash text,
  add column if not exists pin_lookup_hash text,
  add column if not exists email_verificado_em timestamptz,
  add column if not exists primeiro_acesso_concluido_em timestamptz;

update public.contabilidade_portal_usuarios
set codigo_inicial_hash = codigo_hash
where codigo_inicial_hash is null;

create unique index if not exists contabilidade_portal_pin_lookup_unique
  on public.contabilidade_portal_usuarios (portal, pin_lookup_hash)
  where pin_lookup_hash is not null and ativo = true;

create table if not exists public.contabilidade_portal_email_verificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.contabilidade_portal_usuarios(id) on delete cascade,
  otp_hash text not null,
  setup_token_hash text,
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  usado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contabilidade_email_verificacoes_usuario_idx
  on public.contabilidade_portal_email_verificacoes (usuario_id, created_at desc);

alter table public.contabilidade_portal_email_verificacoes enable row level security;

create table if not exists public.contabilidade_folha_ciclos (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('principal','goiania')),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  competencia text not null check (competencia ~ '^\\d{4}-\\d{2}$'),
  tipo text not null check (tipo in ('adiantamento','pagamento')),
  status text not null default 'aguardando_envio' check (status in (
    'aguardando_envio','aguardando_apontamento','liberado','recebido',
    'processando','aguardando_conferencia','conferido','pendencia'
  )),
  apontamento_liberado_em timestamptz,
  apontamento_liberado_por uuid references auth.users(id) on delete set null,
  contabilidade_recebeu_em timestamptz,
  enviado_em timestamptz,
  enviado_por_portal_user_id uuid references public.contabilidade_portal_usuarios(id) on delete set null,
  conferido_em timestamptz,
  conferido_por uuid references auth.users(id) on delete set null,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal, empresa_id, competencia, tipo)
);

create index if not exists contabilidade_folha_ciclos_status_idx
  on public.contabilidade_folha_ciclos (portal, competencia, tipo, status, empresa_id);

alter table public.contabilidade_folha_ciclos enable row level security;

alter table public.contabilidade_portal_uploads
  add column if not exists ciclo_id uuid references public.contabilidade_folha_ciclos(id) on delete set null,
  add column if not exists processo_tipo text,
  add column if not exists processamento_status text not null default 'pendente',
  add column if not exists processamento_detalhes jsonb not null default '{}'::jsonb;

create index if not exists contabilidade_portal_uploads_ciclo_idx
  on public.contabilidade_portal_uploads (ciclo_id, created_at desc)
  where ciclo_id is not null;

create table if not exists public.contabilidade_folha_documentos (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references public.contabilidade_folha_ciclos(id) on delete cascade,
  portal_upload_id uuid references public.contabilidade_portal_uploads(id) on delete set null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  payroll_document_id uuid references public.payroll_documents(id) on delete set null,
  pagina integer,
  tipo_documento text,
  nome_detectado text,
  cpf_detectado text,
  classificacao text not null default 'revisao' check (classificacao in ('identificado','revisao','ignorado','duplicado','erro')),
  status text not null default 'pendente',
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contabilidade_folha_documentos_ciclo_idx
  on public.contabilidade_folha_documentos (ciclo_id, classificacao, created_at);

create unique index if not exists contabilidade_folha_documentos_pagina_unique
  on public.contabilidade_folha_documentos (ciclo_id, portal_upload_id, pagina)
  where portal_upload_id is not null and pagina is not null;

alter table public.contabilidade_folha_documentos enable row level security;
