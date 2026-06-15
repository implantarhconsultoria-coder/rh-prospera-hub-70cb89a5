import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, Plus, X, Search, Trash2, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

const STATUS_COLORS: Record<string, string> = {
  prevista: 'bg-muted text-muted-foreground', em_aberto: 'bg-warning/20 text-warning',
  enviada: 'bg-primary/20 text-primary', vencida: 'bg-destructive/20 text-destructive',
  paga: 'bg-success/20 text-success', parcial: 'bg-warning/30 text-warning-foreground',
  cancelada: 'bg-muted/50 text-muted-foreground line-through',
};
const STATUS_LABELS: Record<string, string> = {
  prevista: 'Prevista', em_aberto: 'Em aberto', enviada: 'Enviada',
  vencida: 'Vencida', paga: 'Paga', parcial: 'Parcial', cancelada: 'Cancelada',
};

type ImportRow = {
  sourceRow: number;
  contratoId: string;
  contratoNumero: string;
  cliente: string;
  competencia: string;
  vencimento: string;
  subtotal: number;
  descontos: number;
  acrescimos: number;
  total: number;
  observacoes: string;
  valid: boolean;
  duplicate: boolean;
  error: string;
};

const parseMoney = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: unknown, XLSX: any) => {
  if (!value) return '';
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
};

const getValue = (row: Record<string, unknown>, aliases: string[]) => {
  const entries = Object.entries(row);
  const found = entries.find(([key]) => aliases.includes(normalize(key)));
  return found?.[1];
};

const FaturasPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const [faturas, setFaturas] = useState<any[]>([]);
  const [contratos, setContratos] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [arquivoNome, setArquivoNome] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    contrato_id: '', competencia: new Date().toISOString().slice(0, 7),
    data_vencimento: '', subtotal: 0, descontos: 0, acrescimos: 0, observacoes: '',
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;
    const [f, ct] = await Promise.all([
      applyEmp(supabase.from('faturas').select('*, clientes_fat(razao_social), contratos(numero), empresas(nome)').order('data_vencimento', { ascending: false })),
      applyEmp(supabase.from('contratos').select('id, numero, cliente_id, empresa_id, valor_mensal, clientes_fat(razao_social, cnpj_cpf)').eq('status', 'ativo')),
    ]);
    if (f.error) toast.error(`Falha ao carregar faturas: ${f.error.message}`);
    if (ct.error) toast.error(`Falha ao carregar contratos: ${ct.error.message}`);
    setFaturas(f.data || []);
    setContratos(ct.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const nextNumber = (offset = 0) => {
    const ano = new Date().getFullYear();
    const max = faturas.reduce((current, f) => {
      const match = String(f.numero || '').match(new RegExp(`^FAT-${ano}-(\\d+)$`));
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `FAT-${ano}-${String(max + offset + 1).padStart(4, '0')}`;
  };

  const duplicateExists = (contratoId: string, competencia: string) => faturas.some(f =>
    f.contrato_id === contratoId && f.competencia === competencia && f.status !== 'cancelada'
  );

  const createInvoice = async (payload: {
    contrato: any; competencia: string; vencimento: string; subtotal: number;
    descontos: number; acrescimos: number; observacoes: string; numero: string;
  }) => {
    const { contrato, competencia, vencimento, subtotal, descontos, acrescimos, observacoes, numero } = payload;
    const { data: existing } = await supabase.from('faturas').select('id').eq('contrato_id', contrato.id)
      .eq('competencia', competencia).neq('status', 'cancelada').limit(1);
    if (existing?.length) throw new Error(`Já existe fatura para o contrato ${contrato.numero} em ${competencia}.`);

    const total = subtotal + acrescimos - descontos;
    if (total <= 0) throw new Error(`O total do contrato ${contrato.numero} precisa ser maior que zero.`);

    const { data: fatura, error: faturaError } = await supabase.from('faturas').insert({
      numero, cliente_id: contrato.cliente_id, contrato_id: contrato.id, empresa_id: contrato.empresa_id,
      competencia, data_vencimento: vencimento, subtotal, descontos, acrescimos, total,
      observacoes, status: 'em_aberto',
    }).select('id, numero').single();
    if (faturaError || !fatura) throw new Error(faturaError?.message || 'Não foi possível criar a fatura.');

    const { error: tituloError } = await supabase.from('titulos_receber').insert({
      cliente_id: contrato.cliente_id, contrato_id: contrato.id, fatura_id: fatura.id,
      empresa_id: contrato.empresa_id, numero: fatura.numero, competencia,
      data_vencimento: vencimento, valor_original: total, saldo: total, status: 'aberto',
    });
    if (tituloError) {
      await supabase.from('faturas').delete().eq('id', fatura.id);
      throw new Error(`A fatura foi desfeita porque o título financeiro falhou: ${tituloError.message}`);
    }
    return fatura;
  };

  const handleCreate = async () => {
    const contrato = contratos.find(c => c.id === form.contrato_id);
    if (!contrato) return toast.error('Selecione um contrato');
    if (!form.data_vencimento) return toast.error('Informe o vencimento');
    if (duplicateExists(contrato.id, form.competencia)) return toast.error('Já existe fatura desse contrato nesta competência.');
    try {
      await createInvoice({
        contrato, competencia: form.competencia, vencimento: form.data_vencimento,
        subtotal: Number(form.subtotal) || Number(contrato.valor_mensal) || 0,
        descontos: Number(form.descontos) || 0, acrescimos: Number(form.acrescimos) || 0,
        observacoes: form.observacoes, numero: nextNumber(),
      });
      toast.success('Fatura e contas a receber criadas juntas');
      setShowForm(false);
      setForm({ contrato_id: '', competencia: new Date().toISOString().slice(0, 7), data_vencimento: '', subtotal: 0, descontos: 0, acrescimos: 0, observacoes: '' });
      carregar();
    } catch (error: any) { toast.error(error.message); }
  };

  const readSpreadsheet = async (file?: File) => {
    if (!file) return;
    setArquivoNome(file.name);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!raw.length) throw new Error('A planilha está vazia.');

      const parsed = raw.map((row, index): ImportRow => {
        const contractText = String(getValue(row, ['contrato', 'numero contrato', 'n contrato', 'contrato numero']) || '').trim();
        const clientText = String(getValue(row, ['cliente', 'razao social', 'nome cliente', 'cnpj', 'cnpj cpf']) || '').trim();
        const competenciaRaw = String(getValue(row, ['competencia', 'mes referencia', 'referencia', 'mes']) || '').trim();
        const competenciaDate = parseDate(competenciaRaw, XLSX);
        const competencia = /^\d{4}-\d{2}$/.test(competenciaRaw) ? competenciaRaw : competenciaDate.slice(0, 7);
        const vencimento = parseDate(getValue(row, ['vencimento', 'data vencimento', 'data de vencimento']), XLSX);
        const subtotal = parseMoney(getValue(row, ['subtotal', 'valor', 'valor faturar', 'valor da fatura', 'total']));
        const descontos = parseMoney(getValue(row, ['desconto', 'descontos']));
        const acrescimos = parseMoney(getValue(row, ['acrescimo', 'acrescimos', 'adicional']));
        const total = subtotal + acrescimos - descontos;
        const normalizedContract = normalize(contractText);
        const clientDigits = digits(clientText);
        const normalizedClient = normalize(clientText);
        let matches = contratos.filter(c => normalize(c.numero) === normalizedContract && normalizedContract);
        if (!matches.length && clientText) {
          matches = contratos.filter(c => {
            const client = c.clientes_fat;
            return (clientDigits.length >= 11 && digits(client?.cnpj_cpf) === clientDigits)
              || normalize(client?.razao_social) === normalizedClient;
          });
        }
        const contrato = matches.length === 1 ? matches[0] : null;
        let error = '';
        if (!contrato) error = matches.length > 1 ? 'Cliente possui mais de um contrato ativo; informe o número do contrato.' : 'Contrato ativo não encontrado.';
        else if (!competencia) error = 'Competência inválida. Use AAAA-MM.';
        else if (!vencimento) error = 'Vencimento inválido.';
        else if (total <= 0) error = 'Valor total inválido.';
        const duplicate = Boolean(contrato && competencia && duplicateExists(contrato.id, competencia));
        if (duplicate) error = 'Fatura já existente para este contrato e competência.';
        return {
          sourceRow: index + 2, contratoId: contrato?.id || '', contratoNumero: contrato?.numero || contractText,
          cliente: contrato?.clientes_fat?.razao_social || clientText, competencia, vencimento,
          subtotal, descontos, acrescimos, total, observacoes: String(getValue(row, ['observacao', 'observacoes', 'descricao']) || ''),
          valid: !error, duplicate, error,
        };
      });
      setImportRows(parsed);
      toast.success(`${parsed.length} linha(s) lida(s). Confira antes de importar.`);
    } catch (error: any) {
      setImportRows([]);
      toast.error(error.message || 'Não foi possível ler a planilha.');
    }
  };

  const importValidRows = async () => {
    const valid = importRows.filter(r => r.valid);
    if (!valid.length) return toast.error('Não há linhas válidas para importar.');
    if (!confirm(`Importar ${valid.length} fatura(s) conferida(s)?`)) return;
    setImporting(true);
    let success = 0;
    const errors: string[] = [];
    for (let index = 0; index < valid.length; index += 1) {
      const row = valid[index];
      const contrato = contratos.find(c => c.id === row.contratoId);
      if (!contrato) { errors.push(`Linha ${row.sourceRow}: contrato não encontrado.`); continue; }
      try {
        await createInvoice({
          contrato, competencia: row.competencia, vencimento: row.vencimento,
          subtotal: row.subtotal, descontos: row.descontos, acrescimos: row.acrescimos,
          observacoes: row.observacoes || `Importado de ${arquivoNome}, linha ${row.sourceRow}`,
          numero: nextNumber(success),
        });
        success += 1;
      } catch (error: any) { errors.push(`Linha ${row.sourceRow}: ${error.message}`); }
    }
    setImporting(false);
    if (success) toast.success(`${success} fatura(s) importada(s) com contas a receber.`);
    if (errors.length) toast.error(`${errors.length} linha(s) não foram importadas. Revise a conferência.`);
    await carregar();
    if (!errors.length) { setShowImport(false); setImportRows([]); setArquivoNome(''); }
  };

  const cancelar = async (fatura: any) => {
    if (!confirm(`Cancelar a fatura ${fatura.numero}? O título a receber também será cancelado.`)) return;
    const { data: titulo } = await supabase.from('titulos_receber').select('id, status, valor_pago').eq('fatura_id', fatura.id).maybeSingle();
    if (titulo && (titulo.status === 'pago' || Number(titulo.valor_pago || 0) > 0)) {
      return toast.error('Esta fatura possui recebimento. Estorne o recebimento antes de cancelar.');
    }
    const { error: titleError } = await supabase.from('titulos_receber').update({ status: 'cancelado', saldo: 0 }).eq('fatura_id', fatura.id);
    if (titleError) return toast.error(`Não foi possível cancelar o título financeiro: ${titleError.message}`);
    const { error } = await supabase.from('faturas').update({ status: 'cancelada' }).eq('id', fatura.id);
    if (error) return toast.error(error.message);
    toast.success('Fatura e título financeiro cancelados');
    carregar();
  };

  const filtered = faturas.filter(f => {
    if (statusFilter && f.status !== statusFilter) return false;
    return !search || `${f.numero} ${f.clientes_fat?.razao_social} ${f.contratos?.numero}`.toLowerCase().includes(search.toLowerCase());
  });
  const importSummary = useMemo(() => ({
    valid: importRows.filter(r => r.valid).length,
    invalid: importRows.filter(r => !r.valid).length,
    total: importRows.filter(r => r.valid).reduce((sum, r) => sum + r.total, 0),
  }), [importRows]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Receipt className="w-6 h-6 text-primary" /> Faturas / Cobranças</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} fatura(s) {statusFilter && `· filtro: ${STATUS_LABELS[statusFilter]}`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4" /> Importar planilha</button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Fatura</button>
        </div>
      </div>

      <div className="card-premium p-3 flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, cliente ou contrato..." className="bg-transparent flex-1 outline-none text-sm" /></div>
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">Baixas de pagamento são feitas somente em Contas a Receber, com valor, data, forma e conta bancária registrados.</div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : (
        <div className="card-premium overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>
          <th className="text-left p-3">Número</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Contrato</th><th className="text-left p-3">Competência</th><th className="text-left p-3">Vencimento</th><th className="text-right p-3">Total</th><th className="text-center p-3">Status</th><th className="text-center p-3">Ações</th>
        </tr></thead><tbody>
          {filtered.map(f => <tr key={f.id} className="border-t border-border hover:bg-sidebar-accent/10"><td className="p-3 font-mono text-xs">{f.numero}</td><td className="p-3">{f.clientes_fat?.razao_social}</td><td className="p-3 text-xs text-muted-foreground">{f.contratos?.numero}</td><td className="p-3">{f.competencia}</td><td className="p-3">{fmtDate(f.data_vencimento)}</td><td className="p-3 text-right font-semibold">{fmtBRL(f.total)}</td><td className="p-3 text-center"><span className={`text-[10px] px-2 py-1 rounded-full ${STATUS_COLORS[f.status]}`}>{STATUS_LABELS[f.status]}</span></td><td className="p-3 text-center">{f.status !== 'cancelada' && f.status !== 'paga' && <button onClick={() => cancelar(f)} title="Cancelar" className="p-1 hover:bg-destructive/20 rounded text-destructive"><Trash2 className="w-4 h-4" /></button>}</td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma fatura encontrada.</td></tr>}
        </tbody></table></div>
      )}

      {showForm && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between p-5 border-b border-border"><h2 className="text-lg font-bold font-display">Nova Fatura</h2><button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button></div><div className="p-5 space-y-3">
        <div><label className="text-xs text-muted-foreground">Contrato *</label><select value={form.contrato_id} onChange={e => { const c = contratos.find(ct => ct.id === e.target.value); setForm({ ...form, contrato_id: e.target.value, subtotal: c?.valor_mensal || 0 }); }} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"><option value="">Selecione...</option>{contratos.map(c => <option key={c.id} value={c.id}>{c.numero} — {c.clientes_fat?.razao_social || ''}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-muted-foreground">Competência</label><input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div><div><label className="text-xs text-muted-foreground">Vencimento *</label><input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div></div>
        <div className="grid grid-cols-3 gap-3">{[['Subtotal','subtotal'],['Descontos','descontos'],['Acréscimos','acrescimos']].map(([label,key]) => <div key={key}><label className="text-xs text-muted-foreground">{label}</label><input type="number" step="0.01" value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div>)}</div>
        <div className="bg-muted/30 p-3 rounded-md text-right"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold text-primary font-display">{fmtBRL(Number(form.subtotal) + Number(form.acrescimos) - Number(form.descontos))}</p></div>
        <div><label className="text-xs text-muted-foreground">Observações</label><textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2"><button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button><button onClick={handleCreate} className="btn-primary">Gerar Fatura</button></div>
      </div></motion.div></div>}

      {showImport && <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3"><div className="bg-card rounded-xl shadow-premium-lg w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col"><div className="flex items-center justify-between p-4 border-b border-border"><div><h2 className="text-lg font-bold">Importar faturamento</h2><p className="text-xs text-muted-foreground">Planilhas XLSX, XLS ou CSV. Nada é gravado antes da conferência.</p></div><button onClick={() => setShowImport(false)}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3 overflow-y-auto"><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-5 hover:bg-primary/10"><Upload className="w-5 h-5 text-primary" /><span>{arquivoNome || 'Escolher planilha'}</span><input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => readSpreadsheet(e.target.files?.[0])} /></label>
          {importRows.length > 0 && <><div className="grid grid-cols-3 gap-3"><div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Prontas</p><p className="text-lg font-bold text-success">{importSummary.valid}</p></div><div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Com problema</p><p className="text-lg font-bold text-destructive">{importSummary.invalid}</p></div><div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Total válido</p><p className="text-lg font-bold text-primary">{fmtBRL(importSummary.total)}</p></div></div>
            <div className="border border-border rounded-lg overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/50 uppercase text-muted-foreground"><tr><th className="p-2 text-left">Linha</th><th className="p-2 text-left">Contrato</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Competência</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Total</th><th className="p-2 text-left">Validação</th></tr></thead><tbody>{importRows.map(r => <tr key={r.sourceRow} className={`border-t border-border ${r.valid ? 'bg-success/5' : 'bg-destructive/5'}`}><td className="p-2">{r.sourceRow}</td><td className="p-2">{r.contratoNumero || '-'}</td><td className="p-2 max-w-[220px] truncate">{r.cliente || '-'}</td><td className="p-2">{r.competencia || '-'}</td><td className="p-2">{r.vencimento || '-'}</td><td className="p-2 text-right font-semibold">{fmtBRL(r.total)}</td><td className={`p-2 ${r.valid ? 'text-success' : 'text-destructive'}`}>{r.valid ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Pronta</span> : <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {r.error}</span>}</td></tr>)}</tbody></table></div></>}
        </div><div className="p-4 border-t border-border flex justify-end gap-2"><button onClick={() => setShowImport(false)} className="btn-secondary">Fechar</button><button onClick={importValidRows} disabled={importing || !importSummary.valid} className="btn-primary disabled:opacity-50">{importing ? 'Importando...' : `Importar ${importSummary.valid} válida(s)`}</button></div>
      </div></div>}
    </div>
  );
};

export default FaturasPage;
