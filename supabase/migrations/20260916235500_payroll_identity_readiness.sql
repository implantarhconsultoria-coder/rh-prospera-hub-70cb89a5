create or replace view public.payroll_identity_readiness_v as
select f.id as funcionario_id,f.nome,e.id as company_id,e.nome as empresa,e.codigo as empresa_codigo,
(length(regexp_replace(coalesce(f.cpf,''),'\D','','g'))=11) as cpf_ok,
(f.data_nascimento is not null) as nascimento_ok,
(length(coalesce(nullif(regexp_replace(coalesce(f.celular,''),'\D','','g'),''),nullif(regexp_replace(coalesce(f.telefone,''),'\D','','g'),''),'')) between 10 and 11) as telefone_ok,
(length(regexp_replace(coalesce(f.cpf,''),'\D','','g'))=11 and f.data_nascimento is not null and length(coalesce(nullif(regexp_replace(coalesce(f.celular,''),'\D','','g'),''),nullif(regexp_replace(coalesce(f.telefone,''),'\D','','g'),''),'')) between 10 and 11) as pronto_para_acesso
from public.funcionarios f left join public.empresas e on e.id=coalesce(f.company_id,f.empresa_id)
where f.ativo=true and coalesce(f.status,'ativo')<>'demitido';