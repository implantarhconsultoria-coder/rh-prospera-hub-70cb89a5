import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Users, Edit, Eye, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Cliente {
  id: string; razao_social: string; nome_fantasia: string; cnpj_cpf: string;
  email: string; telefone: string; cidade: string; uf: string; status: string;
}

type ClienteImport = {
  key: string; razao_social: string; nome_fantasia: string; cnpj_cpf: string;
  inscricao_estadual: string; email: string; telefone: string; endereco: string;
  cidade: string; uf: string; cep: string; origem: string; duplicado: boolean; erro: string;
};

const empty: Partial<Cliente> = { razao_social: '', nome_fantasia: '', cnpj_cpf: '', email: '', telefone: '', cidade: '', uf: '', status: 'ativo' };
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeHeader = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').trim();
const getValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalized = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
  return normalized.find(([key]) => aliases.includes(key))?.[1];
};
const docFormat = (value: unknown) => {
  const d = digits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return clean(value);
};
const validDoc = (value: unknown) => [11, 14].includes(digits(value).length);

const rowToClient = (row: Record<string, unknown>, origem: string, index: number): ClienteImport => {
  const razao = clean(getValue(row, ['razao social', 'nome razao social', 'nome', 'cliente', 'credor', 'fornecedor']));
  const doc = docFormat(getValue(row, ['cnpj cpf', 'cpf cnpj', 'cnpj', 'cpf', 'documento']));
  return {
    key: `${origem}-${index}-${digits(doc) || razao}`,
    razao_social: razao,
    nome_fantasia: clean(getValue(row, ['nome fantasia', 'fantasia'])),
    cnpj_cpf: doc,
    inscricao_estadual: clean(getValue(row, ['inscricao estadual', 'ie'])),
    email: clean(getValue(row, ['email', 'e mail'])),
    telefone: clean(getValue(row, ['telefone', 'fone', 'celular'])),
    endereco: clean(getValue(row, ['endereco', 'logradouro'])),
    cidade: clean(getValue(row, ['cidade', 'municipio'])),
    uf: clean(getValue(row, ['uf', 'estado'])).slice(0, 2).toUpperCase(),
    cep: clean(getValue(row, ['cep'])),
    origem,
    duplicado: false,
    erro: razao ? '' : 'Razão social não identificada',
  };
};

const parsePdfLines = async (file: File) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as any[]).map(item => ({ text: clean(item.str), x: Number(item.transform?.[4] || 0), y: Math.round(Number(item.transform?.[5] || 0)) })).filter(item => item.text);
    const groups = new Map<number, { text: string; x: number }[]>();
    items.forEach(item => {
      const key = Array.from(groups.keys()).find(y => Math.abs(y - item.y) <= 2) ?? item.y;
      groups.set(key, [...(groups.get(key) || []), { text: item.text, x: item.x }]);
    });
    Array.from(groups.entries()).sort((a, b) => b[0] - a[0]).forEach(([, parts]) => lines.push(parts.sort((a, b) => a.x - b.x).map(part => part.text).join(' | ')));
  }
  return lines;
};

const clientsFromPdf = async (file: File): Promise<ClienteImport[]> => {
  const lines = await parsePdfLines(file);
  const results: ClienteImport[] = [];
  const docRegex = /(?:\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/;
  lines.forEach((line, index) => {
    const match = line.match(docRegex);
    if (!match) return;
    const document = docFormat(match[0]);
    const before = line.slice(0, match.index).replace(/[|;]+$/g, '').trim();
    const after = line.slice((match.index || 0) + match[0].length).replace(/^[|;]+/g, '').trim();
    const fragments = before.split('|').map(clean).filter(Boolean);
    let name = fragments.reverse().find(fragment => /[A-Za-zÀ-ÿ]{2}/.test(fragment) && !/^(codigo|cod|cliente|credor|cnpj|cpf|documento)$/i.test(fragment)) || '';
    name = name.replace(/^\d+\s*[-–|]\s*/, '').replace(/^\d+\s+(?=[A-Za-zÀ-ÿ])/, '').trim();
    if (!name && index > 0) name = clean(lines[index - 1].split('|').pop());
    if (!name || name.length < 3) return;
    const email = after.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || '';
    results.push({ key: `${file.name}-${index}-${digits(document)}`, razao_social: name, nome_fantasia: '', cnpj_cpf: document, inscricao_estadual: '', email, telefone: '', endereco: '', cidade: '', uf: '', cep: '', origem: file.name, duplicado: false, erro: '' });
  });
  const unique = new Map<string, ClienteImport>();
  results.forEach(row => unique.set(digits(row.cnpj_cpf) || row.razao_social.toLowerCase(), row));
  return Array.from(unique.values());
};

const ClientesFatPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<ClienteImport[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [form, setForm] = useState<Partial<Cliente> & { observacoes?: string; endereco?: string; cep?: string; contato_responsavel?: string; inscricao_estadual?: string }>(empty);
  const [editId, setEditId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('clientes_fat').select('*').order('razao_social');
    if (error) toast.error('Não foi possível carregar os clientes.');
    setClientes((data || []) as Cliente[]);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const filtrados = clientes.filter(c => c.razao_social?.toLowerCase().includes(busca.toLowerCase()) || c.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) || c.cnpj_cpf?.includes(busca));
  const abrirNovo = () => { setForm(empty); setEditId(null); setOpen(true); };
  const abrirEdicao = (c: Cliente) => { setForm(c); setEditId(c.id); setOpen(true); };

  const salvar = async () => {
    if (!form.razao_social?.trim()) return toast.error('Razão social é obrigatória');
    const payload = { ...form, razao_social: form.razao_social.trim(), cnpj_cpf: form.cnpj_cpf ? docFormat(form.cnpj_cpf) : null };
    const result = editId ? await supabase.from('clientes_fat').update(payload as any).eq('id', editId) : await supabase.from('clientes_fat').insert(payload as any);
    if (result.error) return toast.error(result.error.message);
    toast.success(editId ? 'Cliente atualizado' : 'Cliente cadastrado'); setOpen(false); carregar();
  };

  const marcarDuplicados = (rows: ClienteImport[]) => {
    const existentesDoc = new Set(clientes.map(c => digits(c.cnpj_cpf)).filter(Boolean));
    const existentesNome = new Set(clientes.map(c => clean(c.razao_social).toLowerCase()));
    const vistos = new Set<string>();
    return rows.map(row => {
      const key = digits(row.cnpj_cpf) || row.razao_social.toLowerCase();
      const duplicado = (digits(row.cnpj_cpf) ? existentesDoc.has(digits(row.cnpj_cpf)) : existentesNome.has(row.razao_social.toLowerCase())) || vistos.has(key);
      vistos.add(key);
      return { ...row, duplicado, erro: row.erro || (!row.razao_social.trim() ? 'Razão social obrigatória' : '') };
    });
  };

  const carregarArquivos = async (files: FileList | null) => {
    if (!files?.length) return;
    setLendo(true);
    const all: ClienteImport[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'pdf') {
          const rows = await clientsFromPdf(file);
          if (!rows.length) failures.push(`${file.name}: PDF sem texto estruturado identificável`);
          all.push(...rows);
        } else {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
          workbook.SheetNames.forEach(sheetName => {
            const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
            all.push(...raw.map((row, index) => rowToClient(row, `${file.name} / ${sheetName}`, index)));
          });
        }
      } catch {
        failures.push(`${file.name}: arquivo não pôde ser lido`);
      }
    }
    setBulkRows(previous => marcarDuplicados([...previous, ...all]));
    setLendo(false);
    if (fileRef.current) fileRef.current.value = '';
    if (failures.length) toast.warning(failures.join('\n'));
    if (all.length) toast.success(`${all.length} registro(s) encontrados para conferência.`);
  };

  const updateBulk = (key: string, field: keyof ClienteImport, value: string) => setBulkRows(rows => marcarDuplicados(rows.map(row => row.key === key ? { ...row, [field]: field === 'cnpj_cpf' ? docFormat(value) : value } : row)));
  const removeBulk = (key: string) => setBulkRows(rows => marcarDuplicados(rows.filter(row => row.key !== key)));

  const importarTodos = async () => {
    if (importando) return;
    const validos = bulkRows.filter(row => !row.duplicado && !row.erro && row.razao_social.trim());
    if (!validos.length) return toast.error('Não há clientes novos e válidos para importar.');
    setImportando(true);
    const payload = validos.map(row => ({ razao_social: row.razao_social.trim(), nome_fantasia: row.nome_fantasia.trim() || null, cnpj_cpf: row.cnpj_cpf || null, inscricao_estadual: row.inscricao_estadual || null, email: row.email || null, telefone: row.telefone || null, endereco: row.endereco || null, cidade: row.cidade || null, uf: row.uf || null, cep: row.cep || null, status: 'ativo', observacoes: `Importado coletivamente de ${row.origem}` }));
    const { error } = await supabase.from('clientes_fat').insert(payload as any);
    setImportando(false);
    if (error) return toast.error(`Importação não concluída: ${error.message}`);
    toast.success(`${payload.length} cliente(s) importado(s) de uma vez.`);
    setBulkOpen(false); setBulkRows([]); carregar();
  };

  const detailPrefix = location.pathname.startsWith('/faturamento') ? '/faturamento' : '/admin/faturamento';
  const novos = bulkRows.filter(row => !row.duplicado && !row.erro).length;
  const duplicados = bulkRows.filter(row => row.duplicado).length;
  const erros = bulkRows.filter(row => !!row.erro).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold font-display flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Clientes</h1><p className="text-sm text-muted-foreground">{clientes.length} clientes cadastrados</p></div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setBulkRows([]); setBulkOpen(true); }} className="btn-secondary flex items-center gap-2 border-primary/40 text-primary"><FileSpreadsheet className="w-4 h-4" /> Importar clientes em lote</button>
          <button onClick={abrirNovo} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Cliente</button>
        </div>
      </div>

      <div className="card-premium p-3 flex items-center gap-2"><Search className="w-4 h-4 text-muted-foreground" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, fantasia ou CNPJ..." className="bg-transparent outline-none flex-1 text-sm" /></div>
      <div className="card-premium overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Razão Social</th><th className="text-left p-3">Fantasia</th><th className="text-left p-3">CNPJ/CPF</th><th className="text-left p-3">Cidade/UF</th><th className="text-left p-3">Status</th><th className="text-right p-3">Ações</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr> : filtrados.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr> : filtrados.map(c => <tr key={c.id} className="border-t border-border hover:bg-sidebar-accent/10"><td className="p-3 font-medium">{c.razao_social}</td><td className="p-3 text-muted-foreground">{c.nome_fantasia || '—'}</td><td className="p-3 text-muted-foreground">{c.cnpj_cpf || '—'}</td><td className="p-3 text-muted-foreground">{c.cidade ? `${c.cidade}/${c.uf}` : '—'}</td><td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{c.status}</span></td><td className="p-3 text-right"><button onClick={() => navigate(`${detailPrefix}/clientes/${c.id}`)} className="p-1.5 hover:bg-sidebar-accent rounded mr-1" title="Ver detalhe"><Eye className="w-4 h-4" /></button><button onClick={() => abrirEdicao(c)} className="p-1.5 hover:bg-sidebar-accent rounded" title="Editar"><Edit className="w-4 h-4" /></button></td></tr>)}</tbody></table></div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3 py-2"><div className="col-span-2"><Label>Razão Social *</Label><Input value={form.razao_social || ''} onChange={e => setForm({ ...form, razao_social: e.target.value })} /></div><div><Label>Nome Fantasia</Label><Input value={form.nome_fantasia || ''} onChange={e => setForm({ ...form, nome_fantasia: e.target.value })} /></div><div><Label>CNPJ/CPF</Label><Input value={form.cnpj_cpf || ''} onChange={e => setForm({ ...form, cnpj_cpf: e.target.value })} /></div><div><Label>Inscrição Estadual</Label><Input value={form.inscricao_estadual || ''} onChange={e => setForm({ ...form, inscricao_estadual: e.target.value })} /></div><div><Label>Contato Responsável</Label><Input value={form.contato_responsavel || ''} onChange={e => setForm({ ...form, contato_responsavel: e.target.value })} /></div><div><Label>E-mail</Label><Input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div><div><Label>Telefone</Label><Input value={form.telefone || ''} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div><div className="col-span-2"><Label>Endereço</Label><Input value={form.endereco || ''} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div><div><Label>Cidade</Label><Input value={form.cidade || ''} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><div><Label>UF</Label><Input maxLength={2} value={form.uf || ''} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div><div><Label>CEP</Label><Input value={form.cep || ''} onChange={e => setForm({ ...form, cep: e.target.value })} /></div></div><div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ''} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div></div><DialogFooter><button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button><button onClick={salvar} className="btn-primary">Salvar</button></DialogFooter></DialogContent></Dialog>

      {bulkOpen && <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-3"><div className="bg-card border border-border rounded-xl shadow-premium-lg w-full max-w-7xl max-h-[94vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border"><div><h2 className="text-lg font-bold">Importação coletiva de clientes</h2><p className="text-sm text-muted-foreground">Envie um PDF ou planilha com vários clientes. Você pode selecionar vários arquivos juntos.</p></div><button onClick={() => setBulkOpen(false)}><X className="w-5 h-5" /></button></div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <input ref={fileRef} type="file" multiple accept=".pdf,.csv,.xls,.xlsx" className="hidden" onChange={e => carregarArquivos(e.target.files)} />
          <button disabled={lendo} onClick={() => fileRef.current?.click()} className="w-full rounded-xl border border-dashed border-primary/40 bg-primary/5 p-6 hover:bg-primary/10 disabled:opacity-50"><UploadCloud className="mx-auto mb-2 h-8 w-8 text-primary" /><span className="font-semibold">{lendo ? 'Lendo todos os arquivos...' : 'Selecionar PDFs ou planilhas'}</span><span className="block text-xs text-muted-foreground mt-1">PDF com texto, CSV, XLS ou XLSX. Selecione quantos arquivos precisar.</span></button>
          {bulkRows.length > 0 && <><div className="grid grid-cols-3 gap-3"><div className="rounded-lg bg-success/10 border border-success/20 p-3"><p className="text-xs text-muted-foreground">Novos válidos</p><p className="text-xl font-bold text-success">{novos}</p></div><div className="rounded-lg bg-warning/10 border border-warning/20 p-3"><p className="text-xs text-muted-foreground">Já cadastrados</p><p className="text-xl font-bold text-warning">{duplicados}</p></div><div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3"><p className="text-xs text-muted-foreground">Precisam correção</p><p className="text-xl font-bold text-destructive">{erros}</p></div></div>
          <div className="border border-border rounded-lg overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead className="bg-muted/60 uppercase text-muted-foreground sticky top-0"><tr><th className="text-left p-2">Situação</th><th className="text-left p-2">Razão Social</th><th className="text-left p-2">CNPJ/CPF</th><th className="text-left p-2">Fantasia</th><th className="text-left p-2">Cidade</th><th className="text-left p-2">UF</th><th className="text-left p-2">Origem</th><th className="p-2"></th></tr></thead><tbody>{bulkRows.map(row => <tr key={row.key} className="border-t border-border"><td className="p-2">{row.erro ? <span className="text-destructive inline-flex gap-1"><AlertTriangle className="w-3 h-3" /> Corrigir</span> : row.duplicado ? <span className="text-warning">Já existe</span> : <span className="text-success inline-flex gap-1"><CheckCircle2 className="w-3 h-3" /> Novo</span>}</td><td className="p-2"><Input value={row.razao_social} onChange={e => updateBulk(row.key, 'razao_social', e.target.value)} className="h-8 min-w-64 text-xs" /></td><td className="p-2"><Input value={row.cnpj_cpf} onChange={e => updateBulk(row.key, 'cnpj_cpf', e.target.value)} className="h-8 min-w-40 text-xs" /></td><td className="p-2"><Input value={row.nome_fantasia} onChange={e => updateBulk(row.key, 'nome_fantasia', e.target.value)} className="h-8 min-w-44 text-xs" /></td><td className="p-2"><Input value={row.cidade} onChange={e => updateBulk(row.key, 'cidade', e.target.value)} className="h-8 min-w-36 text-xs" /></td><td className="p-2"><Input maxLength={2} value={row.uf} onChange={e => updateBulk(row.key, 'uf', e.target.value.toUpperCase())} className="h-8 w-16 text-xs" /></td><td className="p-2 max-w-44 truncate" title={row.origem}>{row.origem}</td><td className="p-2"><button onClick={() => removeBulk(row.key)} className="text-destructive">Remover</button></td></tr>)}</tbody></table></div></>}
        </div>
        <div className="p-4 border-t border-border flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Duplicados ficam fora automaticamente. Nada é salvo antes da confirmação.</p><div className="flex gap-2"><button onClick={() => setBulkOpen(false)} className="btn-secondary">Cancelar</button><button disabled={!novos || importando || lendo} onClick={importarTodos} className="btn-primary disabled:opacity-50">{importando ? 'Importando...' : `Importar ${novos} cliente(s)`}</button></div></div>
      </div></div>}
    </div>
  );
};

export default ClientesFatPage;
