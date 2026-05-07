/**
 * AlmoxarifadoCargaTab — Carga / Retirada por Funcionário
 *
 * NÃO desconta estoque automaticamente — apenas registra/confere/arquiva.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Truck, Plus, Trash2, Wand2, Loader2, Save, RefreshCw, FileText, Printer, Paperclip, Search } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeCombobox from '@/components/EmployeeCombobox';
import type { Employee } from '@/types/database';

interface CargaItem { nome: string; quantidade: number; observacao?: string }
interface CargaRow {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  cpf: string;
  matricula: string;
  funcao: string;
  setor: string;
  empresa_nome: string;
  filial: string;
  veiculo: string;
  data_carga: string;
  itens_json: CargaItem[];
  observacao: string;
  status: string;
  tipo: string;
  responsavel_nome: string;
  anexo_url: string;
  anexo_nome: string;
  comprovante_url: string;
  created_at: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'conferido': return <Badge className="bg-primary text-primary-foreground">Conferido</Badge>;
    case 'enviado': return <Badge className="bg-success text-success-foreground">Enviado</Badge>;
    case 'finalizado': return <Badge variant="outline">Finalizado</Badge>;
    case 'arquivado': return <Badge variant="outline">Arquivado</Badge>;
    default: return <Badge variant="secondary">Pendente</Badge>;
  }
};

const parseEmailItens = (texto: string): CargaItem[] => {
  if (!texto.trim()) return [];
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itens: CargaItem[] = [];
  const reA = /^(\d+(?:[.,]\d+)?)\s*(?:x|un|und|unidade|pç|peças?)\s*[-:]?\s*(.+)$/i;
  const reB = /^[-•*]\s*(.+?)\s*[-—–]\s*(\d+(?:[.,]\d+)?)\s*(?:un|und|unidade|pç|x)?\s*$/i;
  const reC = /^(.+?)\s*[-—–:]\s*(\d+(?:[.,]\d+)?)\s*(?:un|und|unidade|pç|x)?\s*$/i;
  const reD = /^(\d+(?:[.,]\d+)?)\s+(.+)$/;
  for (const linha of linhas) {
    let m: RegExpMatchArray | null = null;
    if ((m = linha.match(reA))) itens.push({ nome: m[2].trim(), quantidade: Number(m[1].replace(',', '.')) });
    else if ((m = linha.match(reB))) itens.push({ nome: m[1].trim(), quantidade: Number(m[2].replace(',', '.')) });
    else if ((m = linha.match(reC))) itens.push({ nome: m[1].trim(), quantidade: Number(m[2].replace(',', '.')) });
    else if ((m = linha.match(reD)) && Number(m[1]) <= 999) itens.push({ nome: m[2].trim(), quantidade: Number(m[1].replace(',', '.')) });
  }
  return itens;
};

/** Gera HTML imprimível e abre janela de impressão (PDF nativo do navegador). */
const gerarComprovanteHTML = (c: Partial<CargaRow>): string => {
  const itens = (c.itens_json || []) as CargaItem[];
  const dataFmt = c.data_carga ? new Date(c.data_carga + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const horaFmt = c.created_at ? new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante de ${c.tipo || 'carga'} — ${c.funcionario_nome || ''}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; margin-bottom: 18px; font-size: 11px; }
  .box { border: 1px solid #999; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
  .grid div { padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 11px; }
  th { background: #f0f0f0; }
  .term { font-size: 10.5px; line-height: 1.4; margin: 16px 0; text-align: justify; color: #333; }
  .sigs { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; }
  .sig { flex: 1; text-align: center; }
  .sig .line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 11px; }
</style></head><body>
<h1>COMPROVANTE DE ${(c.tipo || 'CARGA').toUpperCase()} — ALMOXARIFADO</h1>
<div class="sub">Emitido em ${new Date().toLocaleString('pt-BR')}</div>
<div class="box">
  <div class="grid">
    <div><b>Empresa:</b> ${c.empresa_nome || '—'}</div>
    <div><b>Filial:</b> ${c.filial || '—'}</div>
    <div><b>Funcionário:</b> ${c.funcionario_nome || '—'}</div>
    <div><b>CPF:</b> ${c.cpf || '—'}</div>
    <div><b>Matrícula:</b> ${c.matricula || '—'}</div>
    <div><b>Função:</b> ${c.funcao || '—'}</div>
    <div><b>Setor:</b> ${c.setor || '—'}</div>
    <div><b>Veículo:</b> ${c.veiculo || '—'}</div>
    <div><b>Data:</b> ${dataFmt}</div>
    <div><b>Hora do registro:</b> ${horaFmt}</div>
    <div><b>Responsável:</b> ${c.responsavel_nome || '—'}</div>
    <div><b>Tipo:</b> ${c.tipo || 'carga'}</div>
  </div>
</div>
<table>
  <thead><tr><th style="width:8%">#</th><th>Item</th><th style="width:12%">Qtd</th><th>Observação</th></tr></thead>
  <tbody>
  ${itens.map((it, i) => `<tr><td>${i + 1}</td><td>${it.nome || ''}</td><td>${it.quantidade}</td><td>${it.observacao || ''}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#777">Sem itens</td></tr>'}
  </tbody>
</table>
${c.observacao ? `<div class="box" style="margin-top:12px"><b>Observação geral:</b><br>${c.observacao}</div>` : ''}
<p class="term">Declaro que recebi os itens listados acima em perfeito estado e me responsabilizo pela sua conservação e devolução, quando aplicável, conforme normas internas da empresa.</p>
<div class="sigs">
  <div class="sig"><div class="line">Assinatura do funcionário</div></div>
  <div class="sig"><div class="line">Responsável pela entrega</div></div>
</div>
</body></html>`;
};

const AlmoxarifadoCargaTab: React.FC = () => {
  const { session, employees, companies } = useApp();
  const userId = session?.user?.id;

  // form
  const [emailBruto, setEmailBruto] = useState('');
  const [tipo, setTipo] = useState<'carga' | 'retirada'>('carga');
  const [funcionarioId, setFuncionarioId] = useState<string>('');
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState('');
  const [setor, setSetor] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [filial, setFilial] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [dataCarga, setDataCarga] = useState(new Date().toISOString().slice(0, 10));
  const [itens, setItens] = useState<CargaItem[]>([]);
  const [observacao, setObservacao] = useState('');
  const [anexo, setAnexo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  // listagem
  const [cargas, setCargas] = useState<CargaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fEmpresa, setFEmpresa] = useState('');
  const [fFuncionario, setFFuncionario] = useState('');
  const [fDataIni, setFDataIni] = useState('');
  const [fDataFim, setFDataFim] = useState('');
  const [fItem, setFItem] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fResp, setFResp] = useState('');

  const aplicarFuncionario = (emp: Employee | null) => {
    if (!emp) {
      setFuncionarioId(''); setFuncionarioNome(''); setCpf(''); setMatricula('');
      setFuncao(''); setSetor(''); setEmpresaNome(''); setFilial('');
      return;
    }
    const co = companies.find(c => c.id === emp.companyId);
    setFuncionarioId(emp.id);
    setFuncionarioNome(emp.name);
    setCpf(emp.cpf || '');
    setMatricula(emp.matriculaEsocial || emp.registro || '');
    setFuncao(emp.cargo || '');
    setEmpresaNome(co?.name || '');
    // setor/filial não estão no Employee — deixa em branco para preencher manual
  };

  const fetchCargas = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from('almoxarifado_carga') as any)
      .select('*').order('created_at', { ascending: false }).limit(500);
    setLoading(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setCargas((data || []) as CargaRow[]);
  };

  useEffect(() => { fetchCargas(); }, []);

  const preencherAuto = () => {
    if (!emailBruto.trim()) { toast.error('Cole o e-mail antes.'); return; }
    const its = parseEmailItens(emailBruto);
    if (its.length) setItens(its);
    // tenta achar funcionário pelo nome no texto
    if (!funcionarioId) {
      const lc = emailBruto.toLowerCase();
      const emp = employees.find(e => {
        const tokens = e.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        return tokens.length >= 2 && tokens.every(t => lc.includes(t));
      });
      if (emp) aplicarFuncionario(emp);
    }
    toast.success(`${its.length} item(ns) detectado(s).`);
  };

  const limparForm = () => {
    setEmailBruto(''); setFuncionarioId(''); setFuncionarioNome(''); setCpf('');
    setMatricula(''); setFuncao(''); setSetor(''); setEmpresaNome(''); setFilial('');
    setVeiculo(''); setItens([]); setObservacao(''); setAnexo(null);
    setDataCarga(new Date().toISOString().slice(0, 10));
  };

  const uploadAnexo = async (): Promise<{ url: string; nome: string }> => {
    if (!anexo || !userId) return { url: '', nome: '' };
    const path = `cargas/${userId}/${Date.now()}-${anexo.name.replace(/[^\w.\-]/g, '_')}`;
    const up = await supabase.storage.from('documentos-ativos').upload(path, anexo);
    if (up.error) throw new Error('Falha ao subir anexo: ' + up.error.message);
    const { data } = supabase.storage.from('documentos-ativos').getPublicUrl(path);
    return { url: data.publicUrl, nome: anexo.name };
  };

  const salvar = async (gerarPdfDepois = false) => {
    if (!userId) { toast.error('Sessão expirada'); return; }
    if (!funcionarioNome.trim()) { toast.error('Selecione o funcionário.'); return; }
    if (itens.length === 0) { toast.error('Adicione pelo menos um item.'); return; }
    setSalvando(true);
    try {
      const anexoData = await uploadAnexo();
      const responsavelNome = session?.user?.email || 'Sistema';
      const payload = {
        user_id: userId,
        usuario_nome: responsavelNome,
        funcionario_id: funcionarioId || null,
        funcionario_nome: funcionarioNome,
        cpf, matricula, funcao, setor, filial,
        empresa_nome: empresaNome,
        company_id: employees.find(e => e.id === funcionarioId)?.companyId || null,
        veiculo,
        data_carga: dataCarga,
        email_bruto: emailBruto,
        itens_json: itens,
        observacao,
        status: 'pendente',
        tipo,
        responsavel_nome: responsavelNome,
        anexo_url: anexoData.url,
        anexo_nome: anexoData.nome,
      };
      const { data, error } = await (supabase.from('almoxarifado_carga') as any).insert(payload).select().single();
      if (error) throw new Error(error.message);

      // Arquiva no histórico do funcionário
      if (funcionarioId) {
        const co = companies.find(c => c.id === employees.find(e => e.id === funcionarioId)?.companyId);
        await supabase.from('documentos_funcionario').insert({
          funcionario_id: funcionarioId,
          funcionario_nome: funcionarioNome,
          company_id: co?.id,
          empresa_nome: co?.name || empresaNome,
          tipo_documento: tipo === 'carga' ? 'Carga Almoxarifado' : 'Retirada Almoxarifado',
          competencia: dataCarga.slice(0, 7),
          descricao: `${itens.length} item(ns) — ${itens.slice(0, 3).map(i => `${i.quantidade}× ${i.nome}`).join(', ')}${itens.length > 3 ? '…' : ''}`,
          arquivo_url: anexoData.url || '',
          gerado_por_user_id: userId,
          gerado_por_nome: responsavelNome,
          status_envio: 'arquivado',
          unidade: co?.name || empresaNome,
        } as any);
      }

      toast.success('Carga registrada.');
      if (gerarPdfDepois) imprimirComprovante(data as CargaRow);
      limparForm();
      await fetchCargas();
    } catch (e) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const imprimirComprovante = (c: Partial<CargaRow>) => {
    const html = gerarComprovanteHTML(c);
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast.error('Popup bloqueado. Permita popups para imprimir.'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  const atualizarStatus = async (id: string, status: string) => {
    const { error } = await (supabase.from('almoxarifado_carga') as any).update({ status }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Status atualizado.');
    await fetchCargas();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
    const { error } = await (supabase.from('almoxarifado_carga') as any).delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluído.');
    await fetchCargas();
  };

  const empresasUnicas = useMemo(() => Array.from(new Set(companies.map(c => c.name))), [companies]);

  const cargasFiltradas = useMemo(() => {
    return cargas.filter(c => {
      if (fEmpresa && !(c.empresa_nome || '').toLowerCase().includes(fEmpresa.toLowerCase())) return false;
      if (fFuncionario && !(c.funcionario_nome || '').toLowerCase().includes(fFuncionario.toLowerCase())) return false;
      if (fDataIni && c.data_carga < fDataIni) return false;
      if (fDataFim && c.data_carga > fDataFim) return false;
      if (fTipo && c.tipo !== fTipo) return false;
      if (fResp && !(c.responsavel_nome || '').toLowerCase().includes(fResp.toLowerCase())) return false;
      if (fItem) {
        const q = fItem.toLowerCase();
        const found = (c.itens_json || []).some(i => (i.nome || '').toLowerCase().includes(q));
        if (!found) return false;
      }
      return true;
    });
  }, [cargas, fEmpresa, fFuncionario, fDataIni, fDataFim, fItem, fTipo, fResp]);

  return (
    <div className="space-y-5">
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> Nova Carga / Retirada por Funcionário
          </h2>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground">Tipo:</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as 'carga' | 'retirada')}
              className="border rounded-lg px-2 py-1 text-xs bg-background">
              <option value="carga">Carga</option>
              <option value="retirada">Retirada</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">⚠ Esta aba <strong>não desconta do estoque</strong>. Apenas registra/confere/arquiva.</p>

        {/* Busca de funcionário */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><Search className="w-3 h-3" />Funcionário *</label>
          <EmployeeCombobox
            value={funcionarioId}
            onChange={aplicarFuncionario}
            placeholder="Buscar por nome, CPF ou matrícula..."
          />
        </div>

        {/* Dados preenchidos automaticamente */}
        {funcionarioId && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-[10px] uppercase text-muted-foreground">CPF</label>
              <Input value={cpf} onChange={e => setCpf(e.target.value)} className="h-9" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Matrícula</label>
              <Input value={matricula} onChange={e => setMatricula(e.target.value)} className="h-9" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Função</label>
              <Input value={funcao} onChange={e => setFuncao(e.target.value)} className="h-9" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Empresa</label>
              <select value={empresaNome} onChange={e => setEmpresaNome(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background h-9">
                <option value="">—</option>
                {empresasUnicas.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Filial</label>
              <Input value={filial} onChange={e => setFilial(e.target.value)} className="h-9" /></div>
            <div><label className="text-[10px] uppercase text-muted-foreground">Setor</label>
              <Input value={setor} onChange={e => setSetor(e.target.value)} className="h-9" /></div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-[10px] uppercase text-muted-foreground">Data da carga</label>
            <Input type="date" value={dataCarga} onChange={e => setDataCarga(e.target.value)} className="h-9" /></div>
          <div className="md:col-span-2"><label className="text-[10px] uppercase text-muted-foreground">Veículo (placa / modelo) — opcional</label>
            <Input value={veiculo} onChange={e => setVeiculo(e.target.value)} placeholder="Ex.: ABC-1234 / Strada" className="h-9" /></div>
        </div>

        {/* Cole aqui */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cole aqui (e-mail ou lista de materiais)</label>
          <Textarea value={emailBruto} onChange={e => setEmailBruto(e.target.value)}
            placeholder={'Cole o texto da solicitação. Ex.:\n2x parafuso M8\n3 - mangueira 1/2\n10 luvas nitrílicas'}
            rows={4} className="text-sm" />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={preencherAuto}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Identificar itens
            </Button>
            <Button variant="ghost" size="sm" onClick={limparForm}>Limpar tudo</Button>
          </div>
        </div>

        {/* Itens */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">Itens ({itens.length})</h3>
            <Button size="sm" variant="outline" onClick={() => setItens([...itens, { nome: '', quantidade: 1 }])}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar
            </Button>
          </div>
          {itens.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center border rounded-lg">
              Cole o texto acima e clique em "Identificar itens" — ou adicione manualmente.
            </p>
          )}
          {itens.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-6" value={it.nome}
                onChange={e => { const arr = [...itens]; arr[idx].nome = e.target.value; setItens(arr); }}
                placeholder="Nome do item" />
              <Input className="col-span-2" type="number" value={it.quantidade}
                onChange={e => { const arr = [...itens]; arr[idx].quantidade = Number(e.target.value); setItens(arr); }}
                placeholder="Qtd" />
              <Input className="col-span-3" value={it.observacao || ''}
                onChange={e => { const arr = [...itens]; arr[idx].observacao = e.target.value; setItens(arr); }}
                placeholder="Obs (opcional)" />
              <Button size="icon" variant="ghost" className="text-destructive col-span-1"
                onClick={() => setItens(itens.filter((_, i) => i !== idx))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Observação geral</label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Paperclip className="w-3 h-3" />Anexar PDF/documento</label>
            <input type="file" accept=".pdf,image/*" onChange={e => setAnexo(e.target.files?.[0] || null)}
              className="text-xs block w-full border rounded-lg p-2 bg-background" />
            {anexo && <p className="text-[10px] text-muted-foreground mt-1">{anexo.name} ({(anexo.size / 1024).toFixed(0)} KB)</p>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => salvar(false)} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar carga
          </Button>
          <Button onClick={() => salvar(true)} disabled={salvando} variant="secondary">
            <Printer className="w-4 h-4 mr-2" />Salvar e imprimir comprovante
          </Button>
        </div>
      </div>

      {/* Histórico com filtros */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Histórico de cargas / retiradas</h2>
          <Button size="sm" variant="outline" onClick={fetchCargas} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
          <Input placeholder="Funcionário" value={fFuncionario} onChange={e => setFFuncionario(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="Empresa" value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="Item" value={fItem} onChange={e => setFItem(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="Responsável" value={fResp} onChange={e => setFResp(e.target.value)} className="h-8 text-xs" />
          <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="h-8 text-xs border rounded-lg px-2 bg-background">
            <option value="">Todos os tipos</option>
            <option value="carga">Carga</option>
            <option value="retirada">Retirada</option>
          </select>
          <Input type="date" value={fDataIni} onChange={e => setFDataIni(e.target.value)} className="h-8 text-xs" />
          <Input type="date" value={fDataFim} onChange={e => setFDataFim(e.target.value)} className="h-8 text-xs" />
        </div>

        <div className="overflow-x-auto sticky-x-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['Data', 'Tipo', 'Funcionário', 'Empresa', 'Itens', 'Responsável', 'Anexo', 'Status', 'Ações'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargasFiltradas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum registro encontrado.</p>
                </td></tr>
              )}
              {cargasFiltradas.map(c => (
                <tr key={c.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{new Date(c.data_carga + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2 text-xs"><Badge variant="outline">{c.tipo || 'carga'}</Badge></td>
                  <td className="px-3 py-2 text-xs font-medium">{c.funcionario_nome}</td>
                  <td className="px-3 py-2 text-xs">{c.empresa_nome || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {(c.itens_json || []).slice(0, 3).map((i, k) => (
                      <span key={k} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-muted text-[10px]">
                        {i.quantidade}× {i.nome}
                      </span>
                    ))}
                    {(c.itens_json || []).length > 3 && <span className="text-[10px] text-muted-foreground">+{(c.itens_json || []).length - 3}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{c.responsavel_nome || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.anexo_url ? <a href={c.anexo_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver</a> : '—'}
                  </td>
                  <td className="px-3 py-2">{statusBadge(c.status)}</td>
                  <td className="px-3 py-2 text-xs space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => imprimirComprovante(c)} title="Imprimir comprovante">
                      <Printer className="w-3 h-3" />
                    </Button>
                    {c.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'conferido')}>Conferir</Button>}
                    {c.status === 'conferido' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'enviado')}>Enviado</Button>}
                    {c.status === 'enviado' && <Button size="sm" variant="outline" onClick={() => atualizarStatus(c.id, 'finalizado')}>Finalizar</Button>}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluir(c.id)} title="Excluir">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoCargaTab;
