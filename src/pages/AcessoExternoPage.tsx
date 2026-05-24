import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  clearExternalSession,
  createExternalSession,
  getGreeting,
  maskEmail,
  onlyDigits,
  readLastExternalUser,
  saveExternalSession,
  saveLastExternalUser,
  type PortalExterno,
} from "@/lib/acessoExternoAuth";

type Portal = PortalExterno;

type Usuario = {
  cpf_clean: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
  portais: Portal[];
};

type CadastroPendente = {
  cpf_clean: string;
  nome: string;
  email_corporativo: string;
  telefone: string;
};

type DesafioEmail = {
  cpf_clean: string;
  nome: string;
  email_corporativo: string;
  email_mask: string;
  ultima_validacao_email_em: string | null;
};

type LegacyAcessoRow = {
  id: string;
  nome: string;
  cpf_clean: string;
  pin: string;
  email: string | null;
  empresa: string | null;
  filial: string | null;
  funcao: string | null;
  modulo: string;
  perfil_acesso: string;
  status: string;
  acesso_liberado: boolean;
  ativo: boolean | null;
  observacoes: string | null;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const MODULO_REDIRECT: Record<string, (id: string) => string> = {
  filial: (id) => `/filial-ext/${id}`,
  financeiro: (id) => `/financeiro-ext/${id}`,
  faturamento: (id) => `/faturamento-ext/${id}`,
  almoxarifado: (id) => `/almoxarifado-ext/${id}`,
  operacional: (id) => `/operacional-ext/${id}`,
  campo: (id) => `/campo-ext/${id}`,
  mecanico: (id) => `/app-mecanico/${id}`,
};

const normalizeKey = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const isMissingFunctionError = (error: any, functionName: string) =>
  error?.code === "PGRST202" ||
  String(error?.message || "").toLowerCase().includes(functionName.toLowerCase());

const parseLegacyObservacoes = (value: unknown) => {
  const base = { telefone: "", ultima_validacao_email_em: null as string | null };
  if (!value) return base;

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return {
      telefone: String(obj.telefone || "").trim(),
      ultima_validacao_email_em:
        typeof obj.ultima_validacao_email_em === "string" ? obj.ultima_validacao_email_em : null,
    };
  }

  const text = String(value).trim();
  if (!text) return base;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      telefone: String(parsed.telefone || "").trim(),
      ultima_validacao_email_em:
        typeof parsed.ultima_validacao_email_em === "string"
          ? parsed.ultima_validacao_email_em
          : null,
    };
  } catch {
    return base;
  }
};

const buildLegacyObservacoes = (
  raw: unknown,
  patch: { telefone?: string; ultima_validacao_email_em?: string | null },
) => {
  let base: Record<string, unknown> = {};

  if (typeof raw === "object" && raw) {
    base = { ...(raw as Record<string, unknown>) };
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") base = { ...(parsed as Record<string, unknown>) };
    } catch {
      base.legacy_observacao = raw.trim();
    }
  }

  if (patch.telefone !== undefined) base.telefone = patch.telefone;
  if (patch.ultima_validacao_email_em !== undefined) {
    base.ultima_validacao_email_em = patch.ultima_validacao_email_em;
  }
  base.atualizado_em = new Date().toISOString();
  return JSON.stringify(base);
};

const needsWeeklyValidation = (iso: string | null) => {
  if (!iso) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= ONE_WEEK_MS;
};

const mapLegacyRowsToUsuarios = (rows: LegacyAcessoRow[]): Usuario[] => {
  const users = new Map<string, Usuario>();

  for (const row of rows) {
    const portal: Portal = {
      acesso_id: row.id,
      modulo: row.modulo,
      perfil_acesso: row.perfil_acesso || row.modulo,
      empresa: row.empresa || "",
      filial: row.filial || "",
      funcao: row.funcao || "",
    };
    const key = [
      normalizeKey(row.nome || ""),
      normalizeKey(row.empresa || ""),
      normalizeKey(row.filial || ""),
      normalizeKey(row.funcao || ""),
    ].join("::");
    const existing = users.get(key);

    if (existing) {
      existing.portais = [...existing.portais, portal];
      continue;
    }

    users.set(key, {
      cpf_clean: row.cpf_clean,
      nome: row.nome || "Usuario Externo",
      empresa: row.empresa || "",
      filial: row.filial || "",
      funcao: row.funcao || "",
      portais: [portal],
    });
  }

  return Array.from(users.values()).sort((a, b) => a.nome.localeCompare(b.nome));
};

const isOnlyMecanicoRows = (rows: LegacyAcessoRow[]) =>
  rows.length > 0 && rows.every((row) => String(row.modulo || "").toLowerCase() === "mecanico");

const mergeUsuariosLegacy = (adminUsuarios: Usuario[], mecanicos: any[], pin: string): Usuario[] => {
  const usuarios = [...adminUsuarios];

  for (const m of mecanicos) {
    const portal: Portal = {
      acesso_id: m.id,
      modulo: "mecanico",
      perfil_acesso: m.perfil_acesso || "mecanico_externo",
      empresa: m.empresa || "",
      filial: m.filial || "",
      funcao: m.funcao || "",
    };

    const nomeKey = normalizeKey(m.nome || "");
    const empresaKey = normalizeKey(m.empresa || "");
    const existing = usuarios.find((u) => {
      if (u.portais.some((p) => p.acesso_id === m.id)) return true;
      return normalizeKey(u.nome || "") === nomeKey && normalizeKey(u.empresa || "") === empresaKey;
    });

    if (existing) {
      existing.portais = [...existing.portais, portal];
    } else {
      usuarios.push({
        cpf_clean: `pin:${pin}:${m.id}`,
        nome: m.nome || "Mecanico",
        empresa: m.empresa || "",
        filial: m.filial || "",
        funcao: m.funcao || "",
        portais: [portal],
      });
    }
  }

  return usuarios;
};

export default function AcessoExternoPage() {
  const navigate = useNavigate();
  const ultimoUsuario = useMemo(() => readLastExternalUser(), []);

  const [cpf, setCpf] = useState("");
  const [legacyFallback, setLegacyFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [cadastro, setCadastro] = useState<CadastroPendente | null>(null);
  const [desafio, setDesafio] = useState<DesafioEmail | null>(null);
  const [validandoRetorno, setValidandoRetorno] = useState(false);

  useEffect(() => {
    clearExternalSession();
  }, []);

  const escolherUsuario = (u: Usuario) => {
    const session = createExternalSession({
      cpf_clean: u.cpf_clean,
      nome: u.nome,
      portais: u.portais,
    });
    saveExternalSession(session);
    saveLastExternalUser({ nome: u.nome, cpf_clean: u.cpf_clean });

    if (u.portais.length === 1) {
      entrarPortal(u.portais[0]);
    } else {
      navigate("/portais");
    }
  };

  const entrarPortal = async (p: Portal) => {
    setLoading(true);

    if (p.modulo === "mecanico") {
      localStorage.setItem("app_mecanico_acesso_id", p.acesso_id);
      setLoading(false);
      navigate(MODULO_REDIRECT.mecanico(p.acesso_id));
      return;
    }

    const { data, error } = await supabase.rpc("acesso_externo_obter" as any, {
      p_id: p.acesso_id,
      p_modulo: p.modulo,
    });

    if (error || !(data as any)?.ok) {
      setLoading(false);
      toast.error("Nao foi possivel abrir o portal.");
      return;
    }

    const acesso = (data as any).acesso;
    localStorage.setItem("acesso_externo", JSON.stringify({ ...acesso, ts: Date.now() }));
    setLoading(false);

    const goto = MODULO_REDIRECT[p.modulo];
    if (!goto) {
      toast.error(`Modulo desconhecido: ${p.modulo}`);
      return;
    }
    navigate(goto(acesso.id));
  };

  const validarLegacyPin = async (pinAcesso: string) => {
    const [{ data: portData, error: portError }, { data: mecData, error: mecError }] = await Promise.all([
      supabase.rpc("acesso_externo_listar_portais" as any, { p_pin: pinAcesso }),
      supabase.rpc("acesso_externo_validar_pin" as any, { p_pin: pinAcesso, p_modulo: "mecanico" }),
    ]);

    if (portError && mecError) {
      setErro("Erro ao validar acesso. Tente novamente.");
      return;
    }

    const portRes = portData as any;
    const mecRes = mecData as any;
    const adminUsuarios: Usuario[] = portRes?.ok ? portRes.usuarios || [] : [];
    const mecanicos = mecRes?.ok && Array.isArray(mecRes.usuarios) ? mecRes.usuarios : [];
    const lista = mergeUsuariosLegacy(adminUsuarios, mecanicos, pinAcesso);

    if (lista.length === 0) {
      if (portRes?.error === "bloqueado" || mecRes?.error === "bloqueado") {
        setErro("Acesso bloqueado pelo administrador.");
      } else {
        setErro("Acesso nao liberado.");
      }
      return;
    }

    if (lista.length === 1) escolherUsuario(lista[0]);
    else setUsuarios(lista);
  };

  const validarCpfLegacy = async (cpfDigits: string) => {
    const { data, error } = await supabase
      .from("acessos_externos" as any)
      .select(
        "id,nome,cpf_clean,pin,email,empresa,filial,funcao,modulo,perfil_acesso,status,acesso_liberado,ativo,observacoes",
      )
      .eq("cpf_clean", cpfDigits);

    if (error) {
      setErro("Erro ao validar acesso. Tente novamente.");
      return;
    }

    const allRows = ((data as any[]) || []) as LegacyAcessoRow[];
    if (!allRows.length) {
      setErro("CPF nao encontrado para acesso externo.");
      return;
    }

    const ativos = allRows.filter(
      (r) =>
        r.status === "ativo" &&
        r.acesso_liberado === true &&
        (r.ativo === true || r.ativo === null || r.ativo === undefined),
    );

    if (!ativos.length) {
      setErro("Acesso bloqueado pelo administrador.");
      return;
    }

    if (isOnlyMecanicoRows(ativos)) {
      const listaMecanico = mapLegacyRowsToUsuarios(ativos);
      if (!listaMecanico.length) {
        setErro("Nenhum modulo liberado para este CPF.");
        return;
      }
      if (listaMecanico.length === 1) escolherUsuario(listaMecanico[0]);
      else setUsuarios(listaMecanico);
      return;
    }

    const nome = ativos[0]?.nome || "";
    const email =
      ativos
        .map((r) => String(r.email || "").trim().toLowerCase())
        .find(Boolean) || "";
    const metas = ativos.map((r) => parseLegacyObservacoes(r.observacoes));
    const telefone = metas.map((m) => String(m.telefone || "").trim()).find(Boolean) || "";
    const ultimaValidacao = metas.map((m) => m.ultima_validacao_email_em).find(Boolean) || null;

    if (!email || !telefone) {
      setCadastro({
        cpf_clean: cpfDigits,
        nome,
        email_corporativo: email,
        telefone,
      });
      return;
    }

    if (needsWeeklyValidation(ultimaValidacao)) {
      setDesafio({
        cpf_clean: cpfDigits,
        nome,
        email_corporativo: email,
        email_mask: maskEmail(email),
        ultima_validacao_email_em: ultimaValidacao,
      });
      return;
    }

    const lista = mapLegacyRowsToUsuarios(ativos);
    if (!lista.length) {
      setErro("Nenhum modulo liberado para este CPF.");
      return;
    }

    if (lista.length === 1) escolherUsuario(lista[0]);
    else setUsuarios(lista);
  };

  const tentarAcessoDiretoMecanico = async (cpfDigits: string) => {
    const { data, error } = await supabase
      .from("acessos_externos" as any)
      .select(
        "id,nome,cpf_clean,pin,email,empresa,filial,funcao,modulo,perfil_acesso,status,acesso_liberado,ativo,observacoes",
      )
      .eq("cpf_clean", cpfDigits);

    if (error) return false;

    const rows = ((data as any[]) || []) as LegacyAcessoRow[];
    const ativos = rows.filter(
      (r) =>
        r.status === "ativo" &&
        r.acesso_liberado === true &&
        (r.ativo === true || r.ativo === null || r.ativo === undefined),
    );

    if (rows.length > 0 && !isOnlyMecanicoRows(ativos)) return false;

    if (isOnlyMecanicoRows(ativos)) {
      const lista = mapLegacyRowsToUsuarios(ativos);
      if (!lista.length) return false;

      if (lista.length === 1) escolherUsuario(lista[0]);
      else setUsuarios(lista);
      return true;
    }

    const pinAcesso = cpfDigits.slice(-4);
    if (pinAcesso.length !== 4) return false;

    const { data: mecData, error: mecError } = await supabase.rpc("acesso_externo_validar_pin" as any, {
      p_pin: pinAcesso,
      p_modulo: "mecanico",
    });
    if (mecError) return false;

    const mecRes = mecData as any;
    const mecanicos = mecRes?.ok && Array.isArray(mecRes.usuarios) ? mecRes.usuarios : [];
    if (!mecanicos.length) return false;

    const lista = mergeUsuariosLegacy([], mecanicos, pinAcesso);
    if (!lista.length) return false;

    if (lista.length === 1) escolherUsuario(lista[0]);
    else setUsuarios(lista);
    return true;
  };

  const salvarCadastroLegacy = async (input: {
    cpf_clean: string;
    nome: string;
    email_corporativo: string;
    telefone: string;
  }) => {
    const { data: rows, error: rowsError } = await supabase
      .from("acessos_externos" as any)
      .select("id,observacoes")
      .eq("cpf_clean", input.cpf_clean)
      .limit(1);

    if (rowsError) return { ok: false, error: rowsError.message };

    const row = (rows as any[])?.[0];
    const observacoes = buildLegacyObservacoes(row?.observacoes || null, {
      telefone: input.telefone,
      ultima_validacao_email_em: null,
    });

    const { error } = await supabase
      .from("acessos_externos" as any)
      .update({
        nome: input.nome,
        cpf: input.cpf_clean,
        pin: input.cpf_clean.slice(-4),
        email: input.email_corporativo,
        observacoes,
      })
      .eq("cpf_clean", input.cpf_clean);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const marcarValidacaoLegacy = async (cpfClean: string, emailDaSessao: string) => {
    const { data: rows, error: rowsError } = await supabase
      .from("acessos_externos" as any)
      .select("id,email,observacoes")
      .eq("cpf_clean", cpfClean);

    if (rowsError) return { ok: false, error: rowsError.message };
    const list = ((rows as any[]) || []) as Array<{ email: string | null; observacoes: unknown }>;
    if (!list.length) return { ok: false, error: "registro_nao_encontrado" };

    const emailSalvo =
      list
        .map((r) => String(r.email || "").trim().toLowerCase())
        .find(Boolean) || "";

    if (emailSalvo && emailSalvo !== emailDaSessao) {
      return { ok: false, error: "email_nao_confere" };
    }

    const observacoes = buildLegacyObservacoes(list[0]?.observacoes || null, {
      ultima_validacao_email_em: new Date().toISOString(),
    });

    const { error } = await supabase
      .from("acessos_externos" as any)
      .update({
        email: emailSalvo || emailDaSessao,
        observacoes,
      })
      .eq("cpf_clean", cpfClean);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const validarCpf = async (cpfDigitsRaw?: string) => {
    const cpfDigits = onlyDigits(cpfDigitsRaw ?? cpf);
    setErro(null);
    setUsuarios(null);
    setCadastro(null);
    setDesafio(null);

    if (cpfDigits.length !== 11 && cpfDigits.length !== 4) {
      setErro("Digite o CPF completo (11 digitos).");
      return;
    }

    setLoading(true);
    try {
      // Compatibilidade temporaria para quem ainda usar PIN antigo.
      if (cpfDigits.length === 4) {
        await validarLegacyPin(cpfDigits);
        return;
      }

      const mecanicoDireto = await tentarAcessoDiretoMecanico(cpfDigits);
      if (mecanicoDireto) return;

      if (legacyFallback) {
        await validarCpfLegacy(cpfDigits);
        return;
      }

      const { data, error } = await supabase.rpc("acesso_externo_listar_por_cpf" as any, {
        p_cpf: cpfDigits,
      });

      if (error) {
        if (isMissingFunctionError(error, "acesso_externo_listar_por_cpf")) {
          setLegacyFallback(true);
          await validarCpfLegacy(cpfDigits);
          return;
        }
        setErro("Erro ao validar acesso. Tente novamente.");
        return;
      }

      const res = data as any;
      if (!res?.ok) {
        if (res?.error === "cadastro_incompleto") {
          setCadastro({
            cpf_clean: res?.cadastro?.cpf_clean || cpfDigits,
            nome: res?.cadastro?.nome || "",
            email_corporativo: res?.cadastro?.email_corporativo || "",
            telefone: res?.cadastro?.telefone || "",
          });
          return;
        }

        if (res?.error === "validacao_email_obrigatoria") {
          setDesafio({
            cpf_clean: res?.desafio?.cpf_clean || cpfDigits,
            nome: res?.desafio?.nome || "",
            email_corporativo: res?.desafio?.email_corporativo || "",
            email_mask: res?.desafio?.email_mask || maskEmail(res?.desafio?.email_corporativo || ""),
            ultima_validacao_email_em: res?.desafio?.ultima_validacao_email_em || null,
          });
          return;
        }

        if (res?.error === "bloqueado") {
          setErro("Acesso bloqueado pelo administrador.");
          return;
        }

        if (res?.error === "cpf_nao_encontrado") {
          setErro("CPF nao encontrado para acesso externo.");
          return;
        }

        setErro("Acesso nao liberado.");
        return;
      }

      const lista = (res?.usuarios || []) as Usuario[];
      if (!lista.length) {
        setErro("Nenhum modulo liberado para este CPF.");
        return;
      }

      if (lista.length === 1) escolherUsuario(lista[0]);
      else setUsuarios(lista);
    } finally {
      setLoading(false);
    }
  };

  const concluirCadastro = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!cadastro) return;

    const nome = cadastro.nome.trim();
    const email = cadastro.email_corporativo.trim().toLowerCase();
    const telefone = cadastro.telefone.trim();

    if (nome.length < 3) {
      toast.error("Informe o nome completo.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("E-mail corporativo invalido.");
      return;
    }
    if (onlyDigits(telefone).length < 10) {
      toast.error("Telefone invalido.");
      return;
    }

    setLoading(true);
    try {
      if (legacyFallback) {
        const saveLegacy = await salvarCadastroLegacy({
          cpf_clean: cadastro.cpf_clean,
          nome,
          email_corporativo: email,
          telefone,
        });

        if (!saveLegacy.ok) {
          toast.error(saveLegacy.error || "Nao foi possivel salvar cadastro.");
          return;
        }
      } else {
        const { data, error } = await supabase.rpc("acesso_externo_completar_cadastro" as any, {
          p_cpf: cadastro.cpf_clean,
          p_nome: nome,
          p_email: email,
          p_telefone: telefone,
        });

        if (error) {
          if (isMissingFunctionError(error, "acesso_externo_completar_cadastro")) {
            setLegacyFallback(true);
            const saveLegacy = await salvarCadastroLegacy({
              cpf_clean: cadastro.cpf_clean,
              nome,
              email_corporativo: email,
              telefone,
            });
            if (!saveLegacy.ok) {
              toast.error(saveLegacy.error || "Nao foi possivel salvar cadastro.");
              return;
            }
          } else {
            toast.error(error.message || "Nao foi possivel salvar cadastro.");
            return;
          }
        } else if (!(data as any)?.ok) {
          toast.error((data as any)?.error || "Nao foi possivel salvar cadastro.");
          return;
        }
      }

      toast.success("Cadastro atualizado. Agora confirme seu e-mail.");
      setCadastro(null);
      setCpf(cadastro.cpf_clean);
      await validarCpf(cadastro.cpf_clean);
    } finally {
      setLoading(false);
    }
  };

  const enviarDesafioEmail = async () => {
    if (!desafio?.email_corporativo) {
      toast.error("E-mail corporativo nao encontrado.");
      return;
    }

    const redirect = `${window.location.origin}/modulos?cpf=${desafio.cpf_clean}&verified=1`;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: desafio.email_corporativo,
      options: {
        emailRedirectTo: redirect,
        shouldCreateUser: true,
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || "Falha ao enviar e-mail de confirmacao.");
      return;
    }

    toast.success(`Link enviado para ${desafio.email_mask || desafio.email_corporativo}.`);
  };

  const processarRetornoValidacao = async () => {
    const url = new URL(window.location.href);
    const cpfParam = onlyDigits(url.searchParams.get("cpf") || "");
    const isVerifiedAttempt = url.searchParams.get("verified") === "1";
    if (!isVerifiedAttempt || cpfParam.length !== 11) return;

    setValidandoRetorno(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const emailDaSessao = authData?.session?.user?.email?.toLowerCase() || "";

      if (!emailDaSessao) {
        return;
      }

      const { data, error } = await supabase.rpc("acesso_externo_marcar_validacao_email" as any, {
        p_cpf: cpfParam,
        p_email: emailDaSessao,
      });

      if (error) {
        if (isMissingFunctionError(error, "acesso_externo_marcar_validacao_email")) {
          setLegacyFallback(true);
          const legacyValidation = await marcarValidacaoLegacy(cpfParam, emailDaSessao);
          if (!legacyValidation.ok) {
            toast.error("Nao consegui confirmar sua validacao por e-mail.");
            return;
          }
        } else {
          toast.error("Nao consegui confirmar sua validacao por e-mail.");
          return;
        }
      } else if (!(data as any)?.ok) {
        toast.error("Nao consegui confirmar sua validacao por e-mail.");
        return;
      }

      await supabase.auth.signOut();
      window.history.replaceState({}, document.title, "/modulos");
      toast.success("Identidade confirmada. Acesso liberado.");
      setCpf(cpfParam);
      await validarCpf(cpfParam);
    } finally {
      setValidandoRetorno(false);
    }
  };

  useEffect(() => {
    processarRetornoValidacao();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) processarRetornoValidacao();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Acesso aos Modulos</CardTitle>
          {ultimoUsuario ? (
            <p className="text-sm text-muted-foreground">
              {getGreeting()}, {ultimoUsuario.nome.split(" ")[0]}. Entre com seu CPF.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Informe seu CPF para abrir os modulos liberados.
            </p>
          )}
        </CardHeader>

        <CardContent>
          {validandoRetorno ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirmando validacao do e-mail...
            </div>
          ) : cadastro ? (
            <form onSubmit={concluirCadastro} className="space-y-4">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                Complete seu cadastro para continuar.
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nome completo</label>
                <Input value={cadastro.nome} onChange={(e) => setCadastro({ ...cadastro, nome: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">E-mail corporativo</label>
                <Input type="email" value={cadastro.email_corporativo} onChange={(e) => setCadastro({ ...cadastro, email_corporativo: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Telefone</label>
                <Input value={cadastro.telefone} onChange={(e) => setCadastro({ ...cadastro, telefone: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Salvar cadastro
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setCadastro(null)}>
                Voltar
              </Button>
            </form>
          ) : desafio ? (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                Confirmacao de identidade semanal obrigatoria.
              </div>
              <div className="text-sm text-muted-foreground">
                Enviaremos um link para <strong>{desafio.email_mask || maskEmail(desafio.email_corporativo)}</strong>. Depois de clicar no e-mail, o acesso sera liberado automaticamente.
              </div>
              <Button onClick={enviarDesafioEmail} className="w-full h-11" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Enviar link de confirmacao
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => validarCpf(desafio.cpf_clean)}>
                Ja confirmei no e-mail
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setDesafio(null)}>
                Voltar
              </Button>
            </div>
          ) : !usuarios ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await validarCpf();
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium mb-2 block">CPF</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={cpf}
                  onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
                  placeholder="Digite os 11 digitos do CPF"
                  className="text-center h-14 text-xl tracking-[0.15em]"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Primeiro acesso: complete nome, e-mail corporativo e telefone.
                </p>
              </div>

              {erro && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading || cpf.length < 4}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecione seu nome:</p>
              {usuarios.map((u) => (
                <button
                  key={u.cpf_clean + u.nome}
                  onClick={() => escolherUsuario(u)}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="font-medium flex items-center gap-2">
                    <UserRound className="w-4 h-4 text-muted-foreground" />
                    {u.nome}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {[u.empresa, u.filial, u.funcao].filter(Boolean).join(" - ")}
                  </div>
                  <div className="text-xs text-primary mt-1">
                    {u.portais.length} modulo(s) liberado(s)
                  </div>
                </button>
              ))}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setUsuarios(null);
                  setCpf("");
                }}
              >
                Voltar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
