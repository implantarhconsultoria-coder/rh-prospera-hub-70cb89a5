import { supabase } from "@/lib/supabase";
import {
  type MechanicSession,
  saveMechanicSession,
} from "@/session/mechanicSession";

export interface MechanicPinOption {
  id: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
}

interface PinValidationResult {
  ok?: boolean;
  error?: string;
  usuarios?: unknown;
}

interface AccessValidationResult {
  ok?: boolean;
  error?: string;
  mecanico?: {
    acesso_id?: string;
    nome?: string;
    empresa?: string;
    filial?: string;
    funcao?: string;
    funcionario_id?: string | null;
  };
}

function normalizeOptions(input: unknown): MechanicPinOption[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => item as Partial<MechanicPinOption>)
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      nome: String(item.nome || "Mecânico"),
      empresa: String(item.empresa || ""),
      filial: String(item.filial || ""),
      funcao: String(item.funcao || ""),
    }));
}

function pinErrorMessage(error?: string): string {
  if (error === "bloqueado") return "Acesso bloqueado pelo administrador.";
  if (error === "pin_nao_encontrado") return "PIN não encontrado.";
  if (error === "sem_permissao_modulo") {
    return "Seu acesso ainda não está liberado para o TOPAC Field.";
  }
  return "PIN inválido ou acesso não autorizado.";
}

export async function validateMechanicPin(
  pin: string,
): Promise<MechanicPinOption[]> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("Digite os quatro últimos números do CPF.");
  }

  const { data, error } = await supabase.rpc("acesso_externo_validar_pin", {
    p_pin: pin,
    p_modulo: "mecanico",
  });

  if (error) throw error;

  const result = (data ?? {}) as PinValidationResult;
  if (!result.ok) throw new Error(pinErrorMessage(result.error));

  const options = normalizeOptions(result.usuarios);
  if (options.length === 0) {
    throw new Error("Nenhum mecânico foi localizado para este PIN.");
  }
  return options;
}

export async function enterMechanicSession(
  accessId: string,
): Promise<MechanicSession> {
  const { data, error } = await supabase.rpc("app_mecanico_validar_acesso", {
    p_acesso_id: accessId,
  });

  if (error) throw error;

  const result = (data ?? {}) as AccessValidationResult;
  const mechanic = result.mecanico;
  if (!result.ok || !mechanic?.acesso_id) {
    throw new Error(
      result.error === "bloqueado"
        ? "Acesso bloqueado pelo administrador."
        : "Acesso do mecânico inválido ou incompleto.",
    );
  }

  const session: MechanicSession = {
    acessoId: String(mechanic.acesso_id),
    nome: String(mechanic.nome || "Mecânico"),
    empresa: String(mechanic.empresa || ""),
    filial: String(mechanic.filial || ""),
    funcao: String(mechanic.funcao || ""),
    funcionarioId: mechanic.funcionario_id
      ? String(mechanic.funcionario_id)
      : null,
  };

  await saveMechanicSession(session);
  return session;
}
