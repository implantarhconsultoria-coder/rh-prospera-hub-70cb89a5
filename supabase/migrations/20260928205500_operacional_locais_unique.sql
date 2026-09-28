create unique index if not exists idx_cliente_locais_operacionais_nome_unique
  on public.cliente_locais_operacionais(cliente_id, lower(nome))
  where ativo = true;
