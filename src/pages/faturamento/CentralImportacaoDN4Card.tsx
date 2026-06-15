import React, { useMemo, useState } from 'react';
import { UploadCloud, FileSpreadsheet, FileText, DatabaseBackup, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type ModuloDn4 = 'clientes' | 'contratos' | 'equipamentos' | 'faturamento' | 'financeiro' | 'notas' | 'bancos' | 'apoio';

type ResultadoArquivo = {
  nome: string;
  extensao: string;
  tipo: 'planilha' | 'arquivo_apoio';
  status: 'conferir' | 'apoio';
  linhas: number;
  abas: string[];
  colunas: string[];
  contagens: Record<ModuloDn4, number>;
};

const MODULOS: Array<{ key: ModuloDn4; label: string; ajuda: string }> = [
  { key: 'clientes', label: 'Clientes', ajuda: 'CNPJ, razão social, fantasia, contato e endereço.' },
  { key: 'contratos', label: 'Contratos', ajuda: 'Contrato, locação, período, início/fim e status.' },
  { key: 'equipamentos', label: 'Equipamentos', ajuda: 'Patrimônio, série, equipamento, modelo e item locado.' },
  { key: 'faturamento', label: 'Faturamento', ajuda: 'Competência, valor, medição, fatura e vencimento.' },
  { key: 'financeiro', label: 'Financeiro', ajuda: 'Receber, pagar, baixa, pagamento e pendências.' },
  { key: 'notas', label: 'Notas', ajuda: 'NF, NFS-e, chave, série, XML ou DANFE.' },
  { key: 'bancos', label: 'Banco / Retorno', ajuda: 'Boleto, CNAB, DDA, OFX, remessa e retorno.' },
  { key: 'apoio', label: 'Arquivos de apoio', ajuda: 'PDF, XML, OFX, CNAB ou prints para conferência.' },
];

const KEYWORDS: Record<ModuloDn4, string[]> = {
  clientes: ['cliente', 'razao', 'razão', 'fantasia', 'cnpj', 'cpf', 'inscricao', 'inscrição', 'contato', 'endereco', 'endereço'],
  contratos: ['contrato', 'locacao', 'locação', 'vigencia', 'vigência', 'inicio', 'início', 'fim', 'encerrado', 'ativo', 'periodo', 'período'],
  equipamentos: ['equipamento', 'patrimonio', 'patrimônio', 'serie', 'série', 'serial', 'modelo', 'ativo', 'item', 'maquina', 'máquina'],
  faturamento: ['fatura', 'faturamento', 'competencia', 'competência', 'medicao', 'medição', 'valor', 'total', 'vencimento', 'reajuste'],
  financeiro: ['receber', 'pagar', 'pagamento', 'baixa', 'saldo', 'liquidado', 'em aberto', 'inadimplencia', 'inadimplência'],
  notas: ['nota', 'nf', 'nfs', 'nfs-e', 'danfe', 'xml', 'chave', 'serie', 'série'],
  bancos: ['boleto', 'banco', 'cnab', 'dda', 'ofx', 'remessa', 'retorno', 'linha digitavel', 'linha digitável', 'nosso numero', 'nosso número'],
  apoio: [],
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const emptyCounts = (): Record<ModuloDn4, number> => ({
  clientes: 0,
  contratos: 0,
  equipamentos: 0,
  faturamento: 0,
  financeiro: 0,
  notas: 0,
  bancos: 0,
  apoio: 0,
});

const detectarModulos = (row: Record<string, unknown>, colunas: string[]) => {
  const texto = `${colunas.join(' ')} ${Object.values(row).join(' ')}`;
  const normalizado = normalize(texto);
  const encontrados = new Set<ModuloDn4>();

  (Object.keys(KEYWORDS) as ModuloDn4[]).forEach((modulo) => {
    if (modulo === 'apoio') return;
    if (KEYWORDS[modulo].some((k) => normalizado.includes(normalize(k)))) {
      encontrados.add(modulo);
    }
  });

  return encontrados;
};

const isPlanilha = (ext: string) => ['xlsx', 'xls', 'csv'].includes(ext);
const isApoio = (ext: string) => ['pdf', 'xml', 'ofx', 'txt', 'ret', 'rem', 'cnab'].includes(ext);

const CentralImportacaoDN4Card: React.FC = () => {
  const [resultados, setResultados] = useState<ResultadoArquivo[]>([]);
  const [processando, setProcessando] = useState(false);

  const totais = useMemo(() => {
    const total = emptyCounts();
    resultados.forEach((r) => {
      MODULOS.forEach(({ key }) => {
        total[key] += r.contagens[key] || 0;
      });
    });
    return total;
  }, [resultados]);

  const processarArquivo = async (file: File): Promise<ResultadoArquivo> => {
    const extensao = file.name.split('.').pop()?.toLowerCase() || '';

    if (!isPlanilha(extensao)) {
      return {
        nome: file.name,
        extensao,
        tipo: 'arquivo_apoio',
        status: 'apoio',
        linhas: 0,
        abas: [],
        colunas: [],
        contagens: { ...emptyCounts(), apoio: 1 },
      };
    }

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const contagens = emptyCounts();
    const colunasSet = new Set<string>();
    let linhas = 0;

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      rows.forEach((row) => {
        linhas += 1;
        const colunas = Object.keys(row);
        colunas.forEach((c) => colunasSet.add(c));
        const modulos = detectarModulos(row, colunas);
        if (modulos.size === 0) {
          contagens.apoio += 1;
          return;
        }
        modulos.forEach((m) => {
          contagens[m] += 1;
        });
      });
    });

    return {
      nome: file.name,
      extensao,
      tipo: 'planilha',
      status: 'conferir',
      linhas,
      abas: workbook.SheetNames,
      colunas: Array.from(colunasSet).slice(0, 40),
      contagens,
    };
  };

  const onFiles = async (files?: FileList | null) => {
    if (!files?.length) return;
    setProcessando(true);
    try {
      const lista = Array.from(files);
      const invalidos = lista.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        return !isPlanilha(ext) && !isApoio(ext);
      });

      if (invalidos.length) {
        toast.warning(`${invalidos.length} arquivo(s) ignorado(s): formato ainda não liberado.`);
      }

      const validos = lista.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        return isPlanilha(ext) || isApoio(ext);
      });

      const novos = await Promise.all(validos.map(processarArquivo));
      setResultados((prev) => [...novos, ...prev]);
      toast.success('Arquivo(s) lido(s). Nada foi gravado nos cadastros.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível ler o arquivo.');
    } finally {
      setProcessando(false);
    }
  };

  const baixarConferencia = () => {
    const payload = {
      gerado_em: new Date().toISOString(),
      aviso: 'Arquivo de conferência. Nada foi gravado automaticamente na TOPAC.',
      resultados,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conferencia-dn4-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card-premium overflow-hidden border-primary/20">
      <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-xl bg-primary/15 p-2 text-primary">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display">Central de Importação DN4</h2>
              <p className="text-xs text-muted-foreground">Carga grande sem bagunçar: importa, separa, confere e só depois aprova.</p>
            </div>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:bg-primary/10">
            {processando ? <Loader2 className="mb-3 h-9 w-9 animate-spin text-primary" /> : <UploadCloud className="mb-3 h-9 w-9 text-primary" />}
            <span className="font-semibold">Subir Excel, CSV, PDF, XML, OFX, CNAB ou retorno</span>
            <span className="mt-1 text-xs text-muted-foreground">Planilhas viram conferência estruturada. PDFs e arquivos bancários entram como apoio para rastrear a migração.</span>
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.xml,.ofx,.txt,.ret,.rem,.cnab"
              className="hidden"
              disabled={processando}
              onChange={(event) => onFiles(event.target.files)}
            />
          </label>
        </div>

        <div className="rounded-2xl border border-border bg-background/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Mapa detectado</p>
              <p className="text-sm font-semibold">{resultados.length} arquivo(s) em conferência</p>
            </div>
            <button onClick={baixarConferencia} disabled={!resultados.length} className="btn-secondary flex items-center gap-2 text-xs disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Exportar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MODULOS.map((modulo) => (
              <div key={modulo.key} className="rounded-xl border border-border bg-card/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{modulo.label}</p>
                <p className="text-xl font-bold font-display">{totais[modulo.key]}</p>
                <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{modulo.ajuda}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {resultados.length > 0 && (
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-success" /> Arquivos prontos para conferência. Nada foi gravado automaticamente.
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Arquivo</th>
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-right">Linhas</th>
                  <th className="p-3 text-left">Leitura</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, index) => {
                  const principais = MODULOS.filter((m) => r.contagens[m.key] > 0).map((m) => `${m.label}: ${r.contagens[m.key]}`);
                  return (
                    <tr key={`${r.nome}-${index}`} className="border-t border-border">
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          {r.tipo === 'planilha' ? <FileSpreadsheet className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-warning" />}
                          <span className="max-w-[320px] truncate">{r.nome}</span>
                        </div>
                        {r.abas.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Abas: {r.abas.join(', ')}</p>}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.extensao.toUpperCase()}</td>
                      <td className="p-3 text-right font-semibold">{r.linhas}</td>
                      <td className="p-3 text-muted-foreground">{principais.join(' • ') || 'Arquivo de apoio para análise'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <p>Próxima fase: comparar com clientes, contratos, equipamentos e faturas já cadastrados; depois liberar botão de aprovação por lote. Hoje esta tela é para leitura segura e conferência inicial da migração DN4.</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default CentralImportacaoDN4Card;
