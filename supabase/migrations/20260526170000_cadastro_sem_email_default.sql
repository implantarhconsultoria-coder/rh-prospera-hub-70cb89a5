-- TOPAC RH PRO - cadastro operacional sem depender do envio de e-mail.

CREATE OR REPLACE FUNCTION public.registrar_cadastro_pendente(
  p_email text,
  p_nome text,
  p_telefone text,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_status text;
  v_user_id uuid;
  v_id uuid;
  v_saved_status text;
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  SELECT au.id INTO v_user_id
    FROM auth.users au
   WHERE lower(au.email) = v_email
   ORDER BY au.created_at DESC
   LIMIT 1;

  v_status := CASE
    WHEN lower(COALESCE(p_motivo, '')) LIKE '%sem_envio_email%'
      OR lower(COALESCE(p_motivo, '')) LIKE '%liberacao_manual%' THEN 'aguardando_liberacao'
    WHEN lower(COALESCE(p_motivo, '')) LIKE '%rate%'
      OR lower(COALESCE(p_motivo, '')) LIKE '%limit%' THEN 'email_rate_limit'
    WHEN v_user_id IS NULL THEN 'aguardando_liberacao'
    ELSE 'email_pendente'
  END;

  INSERT INTO public.cadastros_pendentes(
    email,
    nome_completo,
    telefone,
    status,
    auth_user_id,
    motivo,
    ultimo_erro_email
  )
  VALUES (
    v_email,
    COALESCE(NULLIF(trim(p_nome), ''), ''),
    COALESCE(NULLIF(trim(p_telefone), ''), ''),
    v_status,
    v_user_id,
    COALESCE(p_motivo, ''),
    NULLIF(COALESCE(p_motivo, ''), '')
  )
  ON CONFLICT (email) DO UPDATE
     SET nome_completo = COALESCE(NULLIF(EXCLUDED.nome_completo, ''), public.cadastros_pendentes.nome_completo),
         telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), public.cadastros_pendentes.telefone),
         auth_user_id = COALESCE(public.cadastros_pendentes.auth_user_id, EXCLUDED.auth_user_id),
         status = CASE
           WHEN public.cadastros_pendentes.status IN ('aprovado', 'bloqueado') THEN public.cadastros_pendentes.status
           WHEN EXCLUDED.status = 'email_rate_limit' THEN 'email_rate_limit'
           WHEN EXCLUDED.status = 'aguardando_liberacao' THEN 'aguardando_liberacao'
           ELSE COALESCE(NULLIF(public.cadastros_pendentes.status, ''), EXCLUDED.status)
         END,
         motivo = COALESCE(NULLIF(EXCLUDED.motivo, ''), public.cadastros_pendentes.motivo),
         ultimo_erro_email = COALESCE(EXCLUDED.ultimo_erro_email, public.cadastros_pendentes.ultimo_erro_email),
         updated_at = now()
  RETURNING id, status INTO v_id, v_saved_status;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'email', v_email,
    'auth_user_id', v_user_id,
    'status', v_saved_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_cadastro_pendente(text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
