import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Landmark, Plus, X, Eye, ArrowDownCircle, ArrowUpCircle, Upload, FileCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type ExtratoRow = { data: string; descricao: string; tipo: 'entrada' | 'saida'; valor: number; duplicado?: boolean };

const normalizarData = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
};

const normalizarValor = (value: unknown) => {
  if (typeof value === 'number') return value;
  let raw = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  return Number(raw);
};

const parseOfx = (text: string): ExtratoRow[] => {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>)/gi) || [];
  const tag = (block: string, name: string) => {
    const match = block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, 'i'));
    return match?.[1]?.trim() || '';
  };
  return blocks.map(block => {
    const signed = normalizarValor(tag(block, 'TRNAMT'));
    const dataRaw = tag(block, 'DTPOSTED');
    const data = dataRaw.length >= 8 ? `${dataRaw.slice(0, 4)}-${dataRaw.slice(4, 6)}-${dataRaw.slice(6, 8)}` : '';
    return {
      data,
      descricao: tag(block, 'MEMO') || tag(block, 'NAME') || 'Movimentação bancária',
      tipo: signed >= 0 ? 'entrada' : 'saida',
      valor: Math.abs(signed),
    } as ExtratoRow;
  }).filter(row => row.data && Number.isFinite(row.valor) && row.valor > 0);
};

const rowValue = (row: Record<string, unknown>, aliases: string[]) => {
  const entry = Object.entries(row).find(([key]) => aliases.includes(key.toLowerCase().trim().replace(/[áàãâ]/g, 'a').replace(/[éê]/g, 'e').replace(/[í]/g, 'i').replace(/[óôõ]/g, 'o').replace(/[ú]/g, 'u')));
  return entry?.[1];
};

const BancosPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contas, setContas] = useState<any[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [movs, setMovs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [vendoConta, setVendoConta] = useState<any | null>(null);
  const [preview, setPreview] = useState<ExtratoRow[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [importando, setImportando] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    empresa_id: '', nome: '', banco: '', agencia: '', conta: '',
    tipo: 'corrente', saldo_inicial: 0,
  });

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const cQ = safeIds ? supabase.from('contas_bancarias').select('*, empresas(nome)').in('empresa_id', safeIds).order('nome') : supabase.from('contas_bancarias').select('*, empresas(nome)').order('nome');
    const eQ = safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome');
    const [c, e] = await Promise.all([cQ, eQ]);
    setContas(c.data || []);
    setEmpresas(e.data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const verExtrato = async (conta: any) => {
    setVendoConta(conta);
    setPreview([]);
    setArquivoNome('');
    const { data, error } = await supabase.from('movimentacoes_bancarias').select('*').eq('conta_bancaria_id', conta.id).order('data', { ascending: false }).limit(500);
    if (error) toast.error('Não foi possível carregar o extrato desta conta.');
    setMovs(data || []);
  };

  const salvar = async () => {
    if (!form.nome || !form.empresa_id) return toast.error('Preencha nome e empresa');
    const { error } = await supabase.from('contas_bancarias').insert({
      ...form, saldo_atual: form.saldo_inicial,
    });
    if (error) return toast.error(error.message);
    toast.success('Conta criada');
    setShowForm(false);
    setForm({ empresa_id: '', nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: 0 });
    carregar();
  };

  const lerArquivo = async (file?: File) => {
    if (!file) return;
    try {
      setArquivoNome(file.name);
      let rows: ExtratoRow[] = [];
      if (file.name.toLowerCase().endsWith('.ofx')) {
        rows = parseOfx(await file.text());
      } else {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        rows = rawRows.map(row => {
          const entrada = normalizarValor(rowValue(row, ['entrada', 'credito', 'credit']));
          const saida = normalizarValor(rowValue(row, ['saida', 'debito', 'debit']));
          const valorDireto = normalizarValor(rowValue(row, ['valor', 'amount', 'valor lancamento']));
          const signed = Number.isFinite(entrada) && entrada !== 0 ? Math.abs(entrada) : Number.isFinite(saida) && saida !== 0 ? -Math.abs(saida) : valorDireto;
          return {
            data: normalizarData(rowValue(row, ['data', 'date', 'data lancamento', 'data movimento'])),
            descricao: String(rowValue(row, ['descricao', 'historico', 'memo', 'lancamento', 'description']) || 'Movimentação bancária').trim(),
            tipo: signed >= 0 ? 'entrada' : 'saida',
            valor: Math.abs(signed),
          } as ExtratoRow;
        }).filter(row => row.data && Number.isFinite(row.valor) && row.valor > 0);
      }
      if (!rows.length) {
        setPreview([]);
        return toast.error('Nenhuma movimentação válida foi encontrada. Use OFX, CSV, XLS ou XLSX com data, descrição e valor.');
      }
      const chave = (row: { data: string; descricao?: string | null; tipo: string; valor: number }) => `${row.data}|${row.tipo}|${Number(row.valor).toFixed(2)}|${String(row.descricao || '').trim().toLowerCase()}`;
      const existentes = new Set(movs.map(chave));
      const vistos = new Set<string>();
      setPreview(rows.map(row => {
        const key = chave(row);
        const duplicado = existentes.has(key) || vistos.has(key);
        vistos.add(key);
        return { ...row, duplicado };
      }));
    } catch {
      setPreview([]);
      toast.error('Não foi possível ler esse arquivo. Exporte novamente o extrato em OFX, CSV, XLS ou XLSX.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importarExtrato = async () => {
    if (!vendoConta) return;
    const validos = preview.filter(row => !row.duplicado);
    if (!validos.length) return toast.error('Não há movimentações novas para importar.');
    setImportando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('movimentacoes_bancarias').insert(validos.map(row => ({
      conta_bancaria_id: vendoConta.id,
      data: row.data,
      descricao: row.descricao,
      tipo: row.tipo,
      valor: row.valor,
      origem: `extrato_importado:${arquivoNome}`,
      conciliado: false,
      user_id: user?.id || null,
    })));
    setImportando(false);
    if (error) return toast.error(`Importação não concluída: ${error.message}`);
    toast.success(`${validos.length} movimentação(ões) importada(s).`);
    setPreview([]);
    setArquivoNome('');
    await verExtrato(vendoConta);
    await carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Landmark className="w-6 h-6 text-primary" /> Caixa e Bancos</h1>
          <p className="text-sm text-muted-foreground">{contas.length} conta(s) bancária(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova Conta</button>
      </div>

      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando...</p> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {contas.map(c => (
            <div key={c.id} className="card-premium p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">{c.empresas?.nome}</p>
                  <h3 className="font-bold font-display">{c.nome}</h3>
                  <p className="text-xs">{c.banco} · Ag {c.agencia} · CC {c.conta}</p>
                </div>
                <button onClick={() => verExtrato(c)} title="Ver e importar extrato" className="p-1.5 hover:bg-primary/20 rounded text-primary"><Eye className="w-4 h-4" /></button>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-[10px] uppercase text-muted-foreground">Saldo atual</p>
                <p className={`text-2xl font-bold ${Number(c.saldo_atual) >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtBRL(c.saldo_atual)}</p>
              </div>
            </div>
          ))}
          {contas.length === 0 && <p className="col-span-full text-center text-muted-foreground p-8">Nenhuma conta cadastrada.</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-border"><h2 className="text-lg font-bold">Nova Conta Bancária</h2><button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-3">
              <select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"><option value="">Empresa *</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
              <input placeholder="Nome da conta *" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2"><input placeholder="Banco" value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" /><input placeholder="Agência" value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" /><input placeholder="Conta" value={form.conta} onChange={e => setForm({ ...form, conta: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm" /></div>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"><option value="corrente">Conta Corrente</option><option value="poupanca">Poupança</option><option value="caixa">Caixa</option></select>
              <div><label className="text-xs text-muted-foreground">Saldo inicial</label><input type="number" step="0.01" value={form.saldo_inicial} onChange={e => setForm({ ...form, saldo_inicial: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" /></div>
              <div className="flex justify-end gap-2 pt-2"><button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button><button onClick={salvar} className="btn-primary">Criar</button></div>
            </div>
          </motion.div>
        </div>
      )}

      {vendoConta && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-5xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div><h2 className="text-lg font-bold font-display">Extrato — {vendoConta.nome}</h2><p className="text-sm text-muted-foreground">Importe o arquivo do banco. Duplicados não entram.</p></div>
              <button onClick={() => setVendoConta(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept=".ofx,.csv,.xls,.xlsx" className="hidden" onChange={e => lerArquivo(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} className="btn-primary flex items-center gap-2"><Upload className="w-4 h-4" /> Importar OFX/planilha</button>
                <span className="text-xs text-muted-foreground">{arquivoNome || 'OFX, CSV, XLS ou XLSX'}</span>
              </div>

              {preview.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="p-3 bg-muted/30 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm"><FileCheck2 className="w-4 h-4 text-primary" /><strong>{preview.filter(r => !r.duplicado).length}</strong> nova(s) · <span className="text-muted-foreground">{preview.filter(r => r.duplicado).length} duplicada(s)</span></div><button disabled={importando || preview.every(r => r.duplicado)} onClick={importarExtrato} className="btn-primary disabled:opacity-50">{importando ? 'Importando...' : 'Confirmar importação'}</button></div>
                  <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0"><tr><th className="text-left p-2">Data</th><th className="text-left p-2">Descrição</th><th className="text-left p-2">Tipo</th><th className="text-right p-2">Valor</th><th className="text-center p-2">Situação</th></tr></thead><tbody>{preview.map((row, index) => <tr key={`${row.data}-${index}`} className="border-t border-border"><td className="p-2">{row.data}</td><td className="p-2">{row.descricao}</td><td className="p-2">{row.tipo}</td><td className="p-2 text-right">{fmtBRL(row.valor)}</td><td className={`p-2 text-center text-xs ${row.duplicado ? 'text-warning' : 'text-success'}`}>{row.duplicado ? 'Já existe' : 'Nova'}</td></tr>)}</tbody></table></div>
                </div>
              )}

              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-2">Data</th><th className="text-left p-2">Descrição</th><th className="text-center p-2">Tipo</th><th className="text-right p-2">Valor</th><th className="text-center p-2">Conciliação</th></tr></thead>
                <tbody>
                  {movs.map(m => <tr key={m.id} className="border-t border-border"><td className="p-2 text-xs">{m.data}</td><td className="p-2 text-xs">{m.descricao}</td><td className="p-2 text-center">{m.tipo === 'entrada' ? <ArrowDownCircle className="w-4 h-4 text-success inline" /> : <ArrowUpCircle className="w-4 h-4 text-destructive inline" />}</td><td className={`p-2 text-right font-semibold ${m.tipo === 'entrada' ? 'text-success' : 'text-destructive'}`}>{m.tipo === 'entrada' ? '+' : '-'}{fmtBRL(m.valor)}</td><td className={`p-2 text-center text-xs ${m.conciliado ? 'text-success' : 'text-warning'}`}>{m.conciliado ? 'Conciliado' : 'Pendente'}</td></tr>)}
                  {movs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sem movimentações.</td></tr>}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BancosPage;
