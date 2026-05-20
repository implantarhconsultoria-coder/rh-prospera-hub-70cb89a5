import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Copy,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { extractPdfText } from "@/lib/pdf";

const fmt = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Importacao = {
  id: string;
  arquivo: string;
  storage_path: string;
  tipo: string | null;
  status: string;
  total_lidos: number;
  total_confirmados: number;
  total_pendentes: number;
  total_erros: number;
  iniciado_em: string;
  finalizado_em: string | null;
  mensagem?: string | null;
  texto_extraido?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Processando...",
  aguardando_conferencia: "Lido com sucesso",
  concluida: "Concluida",
  pdf_sem_texto: "PDF sem texto legivel",
  tipo_nao_identificado: "Tipo nao identificado",
  sem_registros: "Sem registros validos",
  erro: "Erro tecnico",
};

const STATUS_COLOR: Record<string, string> = {
  em_andamento: "text-muted-foreground",
  aguardando_conferencia: "text-success",
  concluida: "text-success",
  pdf_sem_texto: "text-warning",
  tipo_nao_identificado: "text-warning",
  sem_registros: "text-warning",
  erro: "text-destructive",
};

const TIPO_LABEL: Record<string, string> = {
  cliente: "Clientes",
  representante: "Representantes",
  equipamento: "Equipamentos / Patrimonios",
  historico: "Historico de Locacao",
  desconhecido: "Nao identificado",
};

const detectarTipoArquivo = (nome: string): string => {
  const ext = nome.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return ext === 'csv' ? 'csv' : 'excel';
  return 'pdf';
};

const parseBrNumber = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBrDate = (value: string | null | undefined) => {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

const parseHistoricoLocacaoLocal = (text: string) => {
  const normalized = cleanText(text);
  const blocks = normalized.split(/Patrim[oô]nio:/i).slice(1);
  const rows: any[] = [];

  for (const block of blocks) {
    const patrimonioMatch = block.match(/\b(\d{5,8})\b/);
    const patrimonio = patrimonioMatch?.[1] || null;
    const equipamentoDescricao = cleanText(block.slice(0, Math.min(block.length, 500))).replace(/^Tipo do Equipamento:/i, "");

    const rowRegex = /(\d{3,8})\s+(\d{1,8})\s+(\d{1,4})\s+(.+?)\s+(LMT|TOPAC|MATRIZ|PRAIA\s+GRANDE|GOI[ÂA]NIA|GOIANIA)\s+(\d{2}\/\d{2}\/\d{2,4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{2,4})\s+[\d.,]+\s+[\d.,]+\s*\/\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d{1,6})\s+(\d{1,12})/gi;
    let match: RegExpExecArray | null;

    while ((match = rowRegex.exec(block))) {
      rows.push({
        numero_os: match[1],
        pedido: match[2],
        item: match[3],
        cliente_nome: cleanText(match[4]),
        filial: cleanText(match[5]),
        data_inicio: parseBrDate(match[6]),
        data_fim: parseBrDate(match[7]),
        periodo_texto: `${match[6]} a ${match[7]}`,
        valor_pedido_periodo: parseBrNumber(match[8]),
        valor_diaria_periodo: parseBrNumber(match[9]),
        valor_faturado_periodo: parseBrNumber(match[10]),
        quantidade: parseBrNumber(match[11]),
        numero_nf: match[12],
        patrimonio,
        descricao_equipamento: equipamentoDescricao || null,
        status: match[1] && patrimonio ? "pendente_conferencia" : "erro_leitura",
        mensagem_erro: match[1] && patrimonio ? null : "OS ou patrimonio nao identificado",
      });
    }
  }

  return rows;
};

const ImportacoesDN4Page: React.FC = () => {
  const [imports, setImports] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tipoForcado, setTipoForcado] = useState<string>("auto");
  const [aberta, setAberta] = useState<Importacao | null>(null);
  const [baseDn4Pendente, setBaseDn4Pendente] = useState(false);

  const isTabelaAusente = (error: any) => {
    const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
    return error?.code === "PGRST205" || msg.includes("importacoes_dn4") || msg.includes("schema cache");
  };

  const processarPdfLocal = async (file: File, importacaoId: string, tipoArquivo: string, tipoPreferido?: string | null) => {
    if (tipoArquivo !== "pdf") throw new Error("Fallback local disponivel apenas para PDF");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const texto = await extractPdfText(bytes);
    const textoNormalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const tipo =
      tipoPreferido && tipoPreferido !== "auto"
        ? tipoPreferido
        : textoNormalizado.includes("HISTORICO DE LOCACAO")
          ? "historico"
          : "desconhecido";

    if (tipo !== "historico") {
      await supabase
        .from("importacoes_dn4" as any)
        .update({
          tipo,
          status: "tipo_nao_identificado",
          total_lidos: 0,
          total_pendentes: 0,
          total_erros: 0,
          mensagem: "Edge Function indisponivel e fallback local nao reconheceu este layout.",
          texto_extraido: texto.slice(0, 4000),
          finalizado_em: new Date().toISOString(),
        } as any)
        .eq("id", importacaoId);
      return { status: "tipo_nao_identificado", total_lidos: 0, total_pendentes: 0, total_erros: 0 };
    }

    const registros = parseHistoricoLocacaoLocal(texto);
    await supabase.from("staging_historico_locacao_dn4" as any).delete().eq("importacao_id", importacaoId);

    let errosGravacao = 0;
    for (let i = 0; i < registros.length; i += 200) {
      const chunk = registros.slice(i, i + 200).map((registro) => ({
        ...registro,
        importacao_id: importacaoId,
      }));
      const { error } = await supabase.from("staging_historico_locacao_dn4" as any).insert(chunk as any);
      if (error) {
        console.error("fallback DN4 historico insert", error);
        errosGravacao += chunk.length;
      }
    }

    const totalErros = registros.filter((registro) => registro.status === "erro_leitura").length + errosGravacao;
    const totalPendentes = Math.max(registros.length - totalErros, 0);
    const status = registros.length > 0 && totalPendentes > 0 ? "aguardando_conferencia" : "sem_registros";

    await supabase
      .from("importacoes_dn4" as any)
      .update({
        tipo: "historico",
        status,
        total_lidos: registros.length,
        total_pendentes: totalPendentes,
        total_erros: totalErros,
        mensagem: `Processado localmente porque a Edge Function nao respondeu. ${registros.length} registro(s) extraido(s) do historico DN4.`,
        texto_extraido: texto.slice(0, 4000),
        finalizado_em: new Date().toISOString(),
      } as any)
      .eq("id", importacaoId);

    return { status, total_lidos: registros.length, total_pendentes: totalPendentes, total_erros: totalErros };
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    setBaseDn4Pendente(false);
    const { data, error } = await supabase
      .from("importacoes_dn4" as any)
      .select("*")
      .eq("excluido", false)
      .order("iniciado_em", { ascending: false })
      .limit(50);

    if (error) {
      if (isTabelaAusente(error)) {
        setBaseDn4Pendente(true);
      } else {
        toast.error(error.message);
      }
      setImports([]);
      setLoading(false);
      return;
    }

    const baseImports = ((data as any[]) || []) as Importacao[];
    const enrichedImports = await Promise.all(
      baseImports.map(async (item) => {
        if (!item.tipo || item.tipo === "desconhecido") return item;

        const { data: resumo } = await supabase.rpc(
          "dn4_resumo_importacao" as any,
          {
            p_importacao_id: item.id,
          } as any,
        );

        if (!resumo || typeof resumo !== "object") return item;

        return {
          ...item,
          total_lidos: Number((resumo as any).total ?? item.total_lidos ?? 0),
          total_confirmados: Number((resumo as any).confirmados ?? item.total_confirmados ?? 0),
          total_pendentes: Number((resumo as any).pendentes_conferencia ?? item.total_pendentes ?? 0),
          total_erros: Number((resumo as any).erros ?? item.total_erros ?? 0),
        } satisfies Importacao;
      }),
    );

    setImports(enrichedImports);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (baseDn4Pendente) {
      toast.error("A base de importacao DN4 ainda precisa ser preparada no Supabase.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const path = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const tipoArquivo = detectarTipoArquivo(file.name);

        const { error: upErr } = await supabase.storage
          .from("dn4-imports")
          .upload(path, file);

        if (upErr) {
          toast.error(`Upload ${file.name}: ${upErr.message}`);
          continue;
        }

        const { data: ses } = await supabase.auth.getUser();

        const { data: imp, error: insErr } = await supabase
          .from("importacoes_dn4" as any)
          .insert({
            arquivo: file.name,
            storage_path: path,
            arquivo_path: path,
            tipo_arquivo: tipoArquivo,
            usuario_id: ses?.user?.id,
            usuario_nome: ses?.user?.email,
            status: "em_andamento",
          } as any)
          .select()
          .single();

        if (insErr || !imp) {
          toast.error(insErr?.message || "Erro ao criar importacao");
          continue;
        }

        const funcaoImportacao =
          tipoArquivo === "excel" || tipoArquivo === "csv" ? "parse-planilha-faturamento" : "parse-dn4";

        const { data: parseData, error: fnErr } = await supabase.functions.invoke(funcaoImportacao, {
          body: {
            importacao_id: (imp as any).id,
            storage_path: path,
            tipo_forcado: tipoForcado === "auto" ? null : tipoForcado,
          },
        });

        if (fnErr) {
          if (tipoArquivo === "pdf") {
            try {
              const fallback = await processarPdfLocal(
                file,
                (imp as any).id,
                tipoArquivo,
                tipoForcado === "auto" ? null : tipoForcado,
              );

              if (fallback.status === "aguardando_conferencia") {
                toast.success(
                  `${file.name}: ${fallback.total_lidos || 0} registro(s) lido(s) pelo processamento local`,
                );
              } else {
                toast.warning(`${file.name}: funcao indisponivel; processamento local nao encontrou registros`);
              }
            } catch (fallbackError: any) {
              const msg = fallbackError?.message || fnErr.message || "Falha no processamento da importacao";
              toast.error(`Importacao ${file.name}: ${msg}`);
              await supabase
                .from("importacoes_dn4" as any)
                .update({ status: "erro", mensagem: msg } as any)
                .eq("id", (imp as any).id);
            }
          } else {
            await supabase
              .from("importacoes_dn4" as any)
              .update({ status: "erro", mensagem: fnErr.message } as any)
              .eq("id", (imp as any).id);
          }
        } else {
          const detalhes = parseData as { total_lidos?: number; status?: string; total_erros?: number } | null;
          if (detalhes?.status === "aguardando_conferencia") {
            toast.success(`${file.name}: ${detalhes.total_lidos || 0} registro(s) lido(s)`);
          } else if (detalhes?.status === "pdf_sem_texto") {
            toast.warning(`${file.name}: PDF sem texto legivel`);
          } else if (detalhes?.status === "tipo_nao_identificado") {
            toast.warning(`${file.name}: tipo nao identificado automaticamente`);
          } else if (detalhes?.status === "sem_registros") {
            toast.warning(`${file.name}: nenhum registro encontrado no layout atual`);
          } else {
            toast.success(`${file.name} processado`);
          }
        }
      }
      await carregar();
    } catch (err: any) {
      toast.error("Erro no upload: " + (err?.message || err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  const abrirImportacao = (i: any) => {
    setAberta(i);
  };

  const verErroImportacao = (i: any) => {
    const msg =
      i.mensagem || i.mensagem_erro || i.erro || i.status || "Nenhum erro detalhado foi salvo para esta importacao.";

    alert(`Erro da importacao:\n\n${msg}`);
  };

  const baixarArquivo = (i: any) => {
    const url = i.arquivo_url || i.url || i.file_url || i.arquivo_path;

    if (!url) {
      toast.error("Arquivo original nao encontrado.");
      return;
    }

    window.open(url, "_blank");
  };

  const excluirImportacao = async (i: any) => {
    const confirmar = window.confirm(`Tem certeza que deseja excluir a importacao "${i.arquivo}"?`);

    if (!confirmar) return;

    const { error } = await supabase
      .from("importacoes_dn4")
      .update({
        excluido: true,
        excluido_em: new Date().toISOString(),
        motivo_exclusao: "Excluido manualmente pela tela de importacao",
      })
      .eq("id", i.id);

    if (error) {
      toast.error(error.message || "Erro ao excluir importacao.");
      return;
    }

    toast.success("Importacao excluida.");
    await carregar();
  };

  const reprocessarImportacao = async (i: any) => {
    toast.message("Reprocessamento iniciado...");

    const { error } = await supabase.functions.invoke("parse-dn4", {
      body: {
        importacao_id: i.id,
        arquivo_nome: i.arquivo,
        tipo_forcado: i.tipo || null,
      },
    });

    if (error) {
      toast.error(
        "A funcao de processamento ainda nao respondeu. Para PDF DN4, envie o arquivo novamente para usar o processamento local.",
      );
      await supabase
        .from("importacoes_dn4" as any)
        .update({
          status: "erro",
          mensagem: error.message || "Falha ao chamar a Edge Function no reprocessamento.",
        } as any)
        .eq("id", i.id);
      await carregar();
      return;
    }

    toast.success("Importacao enviada para reprocessamento.");
    await carregar();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> Importacao de Dados
          </h1>
          <p className="text-sm text-muted-foreground">
            Suba os PDFs do sistema anterior. Os dados ficam em conferencia antes de gravar na base oficial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tipoForcado}
            onChange={(e) => setTipoForcado(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-sm"
          >
            <option value="auto">Detectar tipo automaticamente</option>
            <option value="cliente">Clientes</option>
            <option value="representante">Representantes</option>
            <option value="equipamento">Equipamentos</option>
            <option value="historico">Historico de Locacao</option>
          </select>
          <label className="inline-flex">
            <input
              type="file"
accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={uploading || baseDn4Pendente}
            />
            <Button asChild disabled={uploading || baseDn4Pendente}>
              <span className="cursor-pointer">
                {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}{" "}
                Nova importacao
              </span>
            </Button>
          </label>
          <Button variant="outline" size="icon" onClick={carregar}>
            <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = window.confirm(
                "Mesclar registros duplicados nas tabelas oficiais? Clientes sem CPF/CNPJ com mesmo nome+cidade+UF e representantes com mesmo nome+CPF serao unificados, mantendo o registro mais completo.",
              );
              if (!ok) return;
              const { data, error } = await supabase.rpc("dn4_limpar_duplicados_oficial" as any);
              if (error) toast.error(error.message);
              else
                toast.success(
                  `Duplicados mesclados: ${(data as any)?.clientes_mesclados || 0} clientes, ${(data as any)?.representantes_mesclados || 0} representantes`,
                );
            }}
          >
            <Sparkles className="w-4 h-4 mr-1" /> Limpar duplicados
          </Button>
        </div>
      </div>

      {baseDn4Pendente && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <div className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Base de importacao ainda nao preparada
          </div>
          <p className="mt-1 text-muted-foreground">
            O Supabase atual ainda nao tem a tabela <strong>importacoes_dn4</strong>. A tela foi protegida para nao quebrar;
            falta aplicar a migracao DN4 no banco antes de iniciar os uploads.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Arquivo</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Iniciado</th>
              <th className="text-center p-3">Lidos</th>
              <th className="text-center p-3">Confirmados</th>
              <th className="text-center p-3">Pendentes</th>
              <th className="text-center p-3">Erros</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : imports.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  Nenhuma importacao ainda. Clique em <strong>Nova importacao</strong>.
                </td>
              </tr>
            ) : (
              imports.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 font-medium truncate max-w-[260px]">{i.arquivo}</td>
                  <td className="p-3 text-xs">{TIPO_LABEL[i.tipo || "desconhecido"] || i.tipo}</td>
                  <td className="p-3 text-xs">{new Date(i.iniciado_em).toLocaleString("pt-BR")}</td>
                  <td className="p-3 text-center">{i.total_lidos}</td>
                  <td className="p-3 text-center text-success">{i.total_confirmados}</td>
                  <td className="p-3 text-center text-warning">{i.total_pendentes}</td>
                  <td className="p-3 text-center text-destructive">{i.total_erros}</td>
                  <td className={`p-3 text-xs ${STATUS_COLOR[i.status] || ""}`} title={i.mensagem || ""}>
                    {STATUS_LABEL[i.status] || i.status}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => abrirImportacao(i)}>
                        Abrir
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => setAberta(i)}>
                        Conferir
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => verErroImportacao(i)}>
                        Ver erro
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => reprocessarImportacao(i)}>
                        Reprocessar
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => baixarArquivo(i)}>
                        Baixar
                      </Button>

                      <Button size="sm" variant="destructive" onClick={() => excluirImportacao(i)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {aberta && (
        <ConferenciaDrawer
          importacao={aberta}
          onClose={() => {
            setAberta(null);
            carregar();
          }}
        />
      )}
    </div>
  );
};

const ConferenciaDrawer: React.FC<{ importacao: Importacao; onClose: () => void }> = ({ importacao, onClose }) => {
  const tipo = importacao.tipo || "cliente";
  const tabela =
    tipo === "cliente"
      ? "staging_clientes_dn4"
      : tipo === "equipamento"
        ? "staging_equipamentos_dn4"
        : tipo === "representante"
          ? "staging_representantes_dn4"
          : "staging_historico_locacao_dn4";

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>("pendente_conferencia");
  const [resumo, setResumo] = useState<any>(null);

  const carregarResumo = useCallback(async () => {
    const { data } = await supabase.rpc("dn4_resumo_importacao" as any, { p_importacao_id: importacao.id } as any);
    setResumo(data);
  }, [importacao.id]);

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from(tabela as any)
      .select("*")
      .eq("importacao_id", importacao.id)
      .order("created_at");
    if (filtro !== "todos") q = q.eq("status", filtro);
    const { data } = await q;
    setRows((data as any[]) || []);
    setLoading(false);
    carregarResumo();
  }, [tabela, importacao.id, filtro, carregarResumo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const marcarDuplicados = async () => {
    const { data, error } = await supabase.rpc(
      "dn4_marcar_duplicados" as any,
      { p_importacao_id: importacao.id } as any,
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    const d = data as any;
    toast.success(
      `Duplicados marcados: ${(d?.clientes_ignorados || 0) + (d?.representantes_ignorados || 0) + (d?.equipamentos_ignorados || 0) + (d?.historico_ignorados || 0)} registros`,
    );
    carregar();
  };

  const acao = async (acao: "confirmar" | "ignorar", ids: string[]) => {
    if (ids.length === 0) return;
    const fn = acao === "confirmar" ? "dn4_confirmar_registros" : "dn4_ignorar_registros";
    const { data, error } = await supabase.rpc(fn as any, { p_tipo: tipo, p_ids: ids } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${acao === "confirmar" ? "Confirmados" : "Ignorados"}: ${JSON.stringify(data as any)}`);
    carregar();
  };

  const colunas = (() => {
    switch (tipo) {
      case "cliente":
        return [
          ["codigo_dn4", "Codigo"],
          ["nome_razao_social", "Razao Social"],
          ["cpf_cnpj", "CPF/CNPJ"],
          ["cidade", "Cidade"],
          ["uf", "UF"],
        ];
      case "equipamento":
        return [
          ["codigo_equipamento", "Codigo"],
          ["numero_patrimonio", "Patrimonio"],
          ["descricao", "Descricao"],
          ["situacao", "Situacao"],
          ["valor_compra", "V. Compra"],
        ];
      case "representante":
        return [
          ["codigo_dn4", "Codigo"],
          ["nome", "Nome"],
          ["cpf_cnpj", "CPF/CNPJ"],
          ["email", "E-mail"],
          ["telefone", "Telefone"],
        ];
      case "historico":
        return [
          ["numero_os", "OS"],
          ["pedido", "Pedido"],
          ["patrimonio", "Patrimonio"],
          ["periodo_texto", "Periodo"],
          ["valor_diaria_periodo", "V. Diaria"],
          ["valor_faturado_periodo", "V. Faturado"],
        ];
      default:
        return [["id", "ID"]];
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-5xl bg-background border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold">{importacao.arquivo}</div>
            <div className="text-xs text-muted-foreground">
              {TIPO_LABEL[tipo]} - {STATUS_LABEL[importacao.status]}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="pendente_conferencia">Pendentes</option>
              <option value="confirmado">Confirmados</option>
              <option value="duplicado_ignorado">Duplicados ignorados</option>
              <option value="erro_leitura">Erros</option>
              <option value="ignorado">Ignorados</option>
            </select>
            <Button variant="outline" onClick={marcarDuplicados}>
              <Copy className="w-4 h-4 mr-1" /> Marcar duplicados
            </Button>
            <Button
              onClick={() =>
                acao(
                  "confirmar",
                  rows.filter((r) => r.status === "pendente_conferencia").map((r) => r.id),
                )
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar todos validos
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </header>

        <div className="px-4 py-3 border-b border-border bg-muted/10 space-y-2">
          {importacao.mensagem && (
            <div className={`text-sm ${STATUS_COLOR[importacao.status] || ""}`}>
              <strong>Detalhe:</strong> {importacao.mensagem}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Reprocessar como:</span>
            <ReprocessarBox importacao={importacao} onDone={onClose} />
          </div>
          {importacao.texto_extraido && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Ver previa do texto extraido ({importacao.texto_extraido.length} chars)
              </summary>
              <pre className="mt-2 p-2 bg-muted/30 rounded max-h-48 overflow-auto whitespace-pre-wrap">
                {importacao.texto_extraido}
              </pre>
            </details>
          )}
        </div>

        {resumo && (
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs flex flex-wrap gap-3">
            <span>
              <strong>Total:</strong> {resumo.total ?? 0}
            </span>
            <span className="text-success">
              <strong>Confirmados:</strong> {resumo.confirmados ?? 0}
            </span>
            <span className="text-warning">
              <strong>Pendentes:</strong> {resumo.pendentes_conferencia ?? 0}
            </span>
            <span className="text-muted-foreground">
              <strong>Duplicados ignorados:</strong> {resumo.duplicados_ignorados ?? 0}
            </span>
            <span className="text-destructive">
              <strong>Erros:</strong> {resumo.erros ?? 0}
            </span>
            <span>
              <strong>Ignorados manualmente:</strong> {resumo.ignorados ?? 0}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin inline" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum registro neste filtro.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  {colunas.map(([k, l]) => (
                    <th key={k} className="text-left p-2">
                      {l}
                    </th>
                  ))}
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    {colunas.map(([k]) => (
                      <td key={k} className="p-2 text-xs">
                        {typeof r[k] === "number" && k.startsWith("valor") ? fmt(r[k]) : (r[k] ?? "-")}
                      </td>
                    ))}
                    <td className="p-2 text-xs">
                      {r.status === "confirmado" && <span className="text-success">confirmado</span>}
                      {r.status === "pendente_conferencia" && (
                        <span className="text-warning" title={r.mensagem_erro || ""}>
                          pendente {r.mensagem_erro ? `- ${r.mensagem_erro}` : ""}
                        </span>
                      )}
                      {r.status === "duplicado_ignorado" && (
                        <span className="text-muted-foreground" title={r.mensagem_erro || ""}>
                          duplicado
                        </span>
                      )}
                      {r.status === "erro_leitura" && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {r.mensagem_erro || "erro"}
                        </span>
                      )}
                      {r.status === "ignorado" && <span className="text-muted-foreground">ignorado</span>}
                    </td>
                    <td className="p-2 text-right">
                      {r.status !== "confirmado" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => acao("confirmar", [r.id])}>
                            <CheckCircle2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => acao("ignorar", [r.id])}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
};

const ReprocessarBox: React.FC<{ importacao: Importacao; onDone: () => void }> = ({ importacao, onDone }) => {
  const [tipo, setTipo] = useState<string>(
    importacao.tipo && importacao.tipo !== "desconhecido" ? importacao.tipo : "auto",
  );
  const [busy, setBusy] = useState(false);
  const reprocessar = async () => {
    setBusy(true);
    try {
      await supabase
        .from("importacoes_dn4" as any)
        .update({
          status: "em_andamento",
          mensagem: null,
          total_lidos: 0,
          total_confirmados: 0,
          total_pendentes: 0,
          total_erros: 0,
        } as any)
        .eq("id", importacao.id);
      const { data, error } = await supabase.functions.invoke("parse-dn4", {
        body: {
          importacao_id: importacao.id,
          storage_path: importacao.storage_path,
          tipo_forcado: tipo === "auto" ? null : tipo,
        },
      });
      if (error) toast.error("A funcao de processamento ainda nao respondeu. Envie o PDF novamente para usar o processamento local.");
      else {
        const detalhes = data as { total_lidos?: number; status?: string } | null;
        if (detalhes?.status === "aguardando_conferencia")
          toast.success(`Reprocessado com ${detalhes.total_lidos || 0} registro(s)`);
        else toast.success("Reprocessado");
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1 text-sm"
      >
        <option value="auto">Detectar automaticamente</option>
        <option value="cliente">Clientes</option>
        <option value="representante">Representantes</option>
        <option value="equipamento">Equipamentos / Patrimonios</option>
        <option value="historico">Historico de Locacao</option>
      </select>
      <Button size="sm" variant="outline" onClick={reprocessar} disabled={busy}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} Reprocessar
      </Button>
    </>
  );
};

export default ImportacoesDN4Page;
