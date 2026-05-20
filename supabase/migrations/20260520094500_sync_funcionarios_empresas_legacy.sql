-- TOPAC RH PRO - sincronizacao bidirecional de campos legados/novos.
-- Garante que telas antigas e novas gravem nos mesmos dados reais.

CREATE OR REPLACE FUNCTION public.sync_empresa_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.ativa IS NOT DISTINCT FROM OLD.ativa THEN
      NEW.ativa := NEW.status IS DISTINCT FROM 'inativa';
    ELSIF NEW.ativa IS DISTINCT FROM OLD.ativa AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := CASE WHEN COALESCE(NEW.ativa, true) THEN 'ativa' ELSE 'inativa' END;
    END IF;
  END IF;

  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN COALESCE(NEW.ativa, true) THEN 'ativa' ELSE 'inativa' END;
  END IF;
  IF NEW.ativa IS NULL THEN
    NEW.ativa := NEW.status IS DISTINCT FROM 'inativa';
  END IF;
  IF NEW.observacoes IS NULL THEN
    NEW.observacoes := COALESCE(NEW.tipo, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_empresas_sync_compat ON public.empresas;
CREATE TRIGGER tg_empresas_sync_compat
BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.sync_empresa_compat();

CREATE OR REPLACE FUNCTION public.sync_funcionario_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
      NEW.company_id := NEW.empresa_id;
    ELSIF NEW.company_id IS DISTINCT FROM OLD.company_id AND NEW.empresa_id IS NOT DISTINCT FROM OLD.empresa_id THEN
      NEW.empresa_id := NEW.company_id;
    END IF;

    IF NEW.salario IS DISTINCT FROM OLD.salario AND NEW.salario_base IS NOT DISTINCT FROM OLD.salario_base THEN
      NEW.salario_base := NEW.salario;
    ELSIF NEW.salario_base IS DISTINCT FROM OLD.salario_base AND NEW.salario IS NOT DISTINCT FROM OLD.salario THEN
      NEW.salario := NEW.salario_base;
    END IF;

    IF NEW.ativo IS DISTINCT FROM OLD.ativo AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'desligado' END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.ativo IS NOT DISTINCT FROM OLD.ativo THEN
      NEW.ativo := NEW.status IS DISTINCT FROM 'desligado';
    END IF;

    IF NEW.setor IS DISTINCT FROM OLD.setor AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria THEN
      NEW.categoria := NEW.setor;
    ELSIF NEW.categoria IS DISTINCT FROM OLD.categoria AND NEW.setor IS NOT DISTINCT FROM OLD.setor THEN
      NEW.setor := NEW.categoria;
    END IF;
  END IF;

  IF NEW.company_id IS NULL THEN NEW.company_id := NEW.empresa_id; END IF;
  IF NEW.empresa_id IS NULL THEN NEW.empresa_id := NEW.company_id; END IF;
  IF NEW.salario_base IS NULL THEN NEW.salario_base := COALESCE(NEW.salario, 0); END IF;
  IF NEW.salario IS NULL THEN NEW.salario := COALESCE(NEW.salario_base, 0); END IF;
  IF NEW.status IS NULL THEN NEW.status := CASE WHEN COALESCE(NEW.ativo, true) THEN 'ativo' ELSE 'desligado' END; END IF;
  IF NEW.ativo IS NULL THEN NEW.ativo := NEW.status IS DISTINCT FROM 'desligado'; END IF;
  IF NEW.categoria IS NULL THEN NEW.categoria := COALESCE(NEW.setor, 'operacional'); END IF;
  IF NEW.setor IS NULL THEN NEW.setor := COALESCE(NEW.categoria, 'operacional'); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_funcionarios_sync_compat ON public.funcionarios;
CREATE TRIGGER tg_funcionarios_sync_compat
BEFORE INSERT OR UPDATE ON public.funcionarios
FOR EACH ROW EXECUTE FUNCTION public.sync_funcionario_compat();

UPDATE public.empresas
SET status = CASE WHEN COALESCE(ativa, true) THEN 'ativa' ELSE 'inativa' END
WHERE status IS NULL;

UPDATE public.funcionarios
SET
  company_id = COALESCE(company_id, empresa_id),
  empresa_id = COALESCE(empresa_id, company_id),
  salario_base = COALESCE(salario_base, salario, 0),
  salario = COALESCE(salario, salario_base, 0),
  status = COALESCE(status, CASE WHEN COALESCE(ativo, true) THEN 'ativo' ELSE 'desligado' END),
  ativo = COALESCE(ativo, status IS DISTINCT FROM 'desligado'),
  categoria = COALESCE(categoria, setor, 'operacional'),
  setor = COALESCE(setor, categoria, 'operacional');

NOTIFY pgrst, 'reload schema';
