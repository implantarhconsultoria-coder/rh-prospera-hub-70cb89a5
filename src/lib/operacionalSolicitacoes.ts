export type SolicitacaoOperacional = {
  id: string;
  tipo: "galao" | "manutencao_veiculo";
  status: string;
  acesso_externo_id: string | null;
  funcionario_id: string | null;
  solicitante_nome: string;
  empresa: string;
  filial: string | null;
  ativo_id: string | null;
  veiculo_descricao: string | null;
  placa: string | null;
  patrimonio: string | null;
  km: number | null;
  combustivel_tipo: string | null;
  quantidade: number | null;
  finalidade: string | null;
  manutencao_tipo: string | null;
  descricao: string | null;
  urgencia: string | null;
  anexos: Array<{ nome?: string; url?: string; tipo?: string }> | null;
  pdf_url: string | null;
  pdf_nome: string | null;
  autorizado_por: string | null;
  autorizado_por_nome: string | null;
  autorizado_em: string | null;
  data_agendada: string | null;
  hora_agendada: string | null;
  oficina: string | null;
  observacao_admin: string | null;
  diretor_status: string | null;
  created_at: string;
  updated_at: string;
};

export type VeiculoApp = {
  id: string;
  descricao: string | null;
  placa: string | null;
  patrimonio: string | null;
  renavam: string | null;
  chassi: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  empresa: string | null;
  arquivo_url: string | null;
};

export const MANUTENCAO_OPCOES = [
  "troca de oleo",
  "filtro",
  "revisao preventiva",
  "freio",
  "embreagem",
  "pneu",
  "bateria",
  "alinhamento/balanceamento",
  "luz/parte eletrica",
  "vazamento",
  "barulho/anomalia",
  "outro",
];

export const STATUS_SOLICITACAO: Record<string, string> = {
  pendente: "Pendente",
  autorizado: "Autorizado",
  recusado: "Recusado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  solicitando_info: "Solicitando info",
  aguardando_diretor: "Aguardando diretor",
  aprovado_diretor: "Aprovado diretor",
  agendado: "Agendado",
  concluido: "Concluido",
};

export const COMBUSTIVEL_LABEL: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
  etanol: "Etanol",
};

export const statusClass = (status: string) => {
  if (["autorizado", "aprovado_diretor", "agendado", "entregue", "concluido"].includes(status)) {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  }
  if (["recusado", "cancelado"].includes(status)) {
    return "bg-red-500/10 text-red-700 border-red-500/30";
  }
  if (["aguardando_diretor", "solicitando_info"].includes(status)) {
    return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  }
  return "bg-sky-500/10 text-sky-700 border-sky-500/30";
};

export const brDateTime = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

export const brDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
};

export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const line = (label: string, value: unknown) =>
  `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "-")}</td></tr>`;

export const buildSolicitacaoPdfHtml = (sol: SolicitacaoOperacional) => {
  const title =
    sol.tipo === "galao"
      ? "SOLICITACAO / AUTORIZACAO DE COMBUSTIVEL POR GALAO"
      : "SOLICITACAO / AUTORIZACAO DE MANUTENCAO DE VEICULO";

  const typeRows =
    sol.tipo === "galao"
      ? [
          line("Tipo de combustivel", COMBUSTIVEL_LABEL[sol.combustivel_tipo || ""] || sol.combustivel_tipo),
          line("Quantidade", sol.quantidade ? `${Number(sol.quantidade).toLocaleString("pt-BR")} L` : "-"),
          line("Finalidade", sol.finalidade),
        ].join("")
      : [
          line("Veiculo", sol.veiculo_descricao),
          line("Placa", sol.placa),
          line("Patrimonio", sol.patrimonio),
          line("KM", sol.km ? Number(sol.km).toLocaleString("pt-BR") : "-"),
          line("Tipo de manutencao", sol.manutencao_tipo),
          line("Descricao", sol.descricao),
          line("Urgencia", sol.urgencia),
          line("Aprovacao diretor", STATUS_SOLICITACAO[sol.diretor_status || ""] || sol.diretor_status || "-"),
          line("Data agendada", brDate(sol.data_agendada)),
          line("Horario", sol.hora_agendada || "-"),
          line("Oficina / concessionaria", sol.oficina),
        ].join("");

  const anexos = (sol.anexos || [])
    .filter((a) => a?.url)
    .map((a) => `<li>${escapeHtml(a.nome || a.url)} - ${escapeHtml(a.url)}</li>`)
    .join("");

  return `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
  <style>
    @page{size:A4;margin:12mm}
    body{font-family:Arial,sans-serif;color:#000;font-size:12px}
    h1{font-size:16px;text-align:center;margin:0 0 12px}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
    th{width:32%;background:#eee}
    .sign{display:flex;gap:28px;margin-top:50px}
    .sig{flex:1;text-align:center}.sig div{border-top:1px solid #000;padding-top:5px}
    .small{font-size:10px;color:#333}
  </style></head><body>
    <div class="head">
      <div><strong>TOPAC RH PRO</strong><br/>${escapeHtml(sol.empresa || "-")} ${escapeHtml(sol.filial || "")}</div>
      <div class="small">Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <table>
      ${line("Protocolo", sol.id)}
      ${line("Status", STATUS_SOLICITACAO[sol.status] || sol.status)}
      ${line("Solicitante", sol.solicitante_nome)}
      ${line("Data da solicitacao", brDateTime(sol.created_at))}
      ${typeRows}
      ${line("Responsavel pela autorizacao", sol.autorizado_por_nome)}
      ${line("Data/hora da autorizacao", brDateTime(sol.autorizado_em))}
      ${line("Observacao admin", sol.observacao_admin)}
    </table>
    ${anexos ? `<p><strong>Anexos vinculados:</strong></p><ul>${anexos}</ul>` : ""}
    <div class="sign">
      <div class="sig"><div>Solicitante</div></div>
      <div class="sig"><div>Responsavel / Autorizacao</div></div>
    </div>
  </body></html>`;
};
