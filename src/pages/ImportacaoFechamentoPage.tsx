import React, { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, User, Calendar, Clock, ShieldAlert, Wand2, ClipboardCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';
import {
  cruzarCartaoComAtestados,
  type CartaoPonto,
  type AtestadoLite,
  type ResultadoCruzamento,
  TOLERANCIA_MIN,
} from '@/lib/pontoFechamento';
import { entryToRow } from '@/types/database';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

interface AtestadoStaging {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  status: 'subindo' | 'processando' | 'ok' | 'erro';
  erro?: string;
  funcionarioId?: string;
  funcionarioNome?: string;
  empresaNome?: string;
  cpf?: string;
  dataInicio?: string;
  dataFim?: string;
  diasCobertos?: number;
  cid?: string;
  medico?: string;
  crm?: string;
  textoBruto?: string;
  confianca?: number;
  aplicarVR: boolean;
  aplicarVT: boolean;
}

interface CartaoStaging {
  fileName: string;
  fileUrl: string;
  status: 'subindo' | 'processando' | 'ok' | 'erro';
  erro?: string;
  funcionarioId?: string;
  funcionarioNome?: string;
  competencia?: string;
  cartao?: CartaoPonto;
  confianca?: number;
}

const ImportacaoFechamentoPage: React.FC = () => {
  const { employees, companies, session, entries, getOrCreateEntries, updateEntry } = useApp();
  const [tab, setTab] = useState('atestados');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [atestadosStaging, setAtestadosStaging] = useState<AtestadoStaging[]>([]);
  const [cartoesStaging, setCartoesStaging] = useState<CartaoStaging[]>([]);
  const [resultados, setResultados] = useState<ResultadoCruzamento[]>([]);
  const [salvandoAtest, setSalvandoAtest] = useState(false);
  const [aplicandoFechamento, setAplicandoFechamento] = useState(false);
  const inputAtestRef = useRef<HTMLInputElement>(null);
  const inputCartaoRef = useRef<HTMLInputElement>(null);

  // Atestados confirmados (no banco) na competência selecionada — usados no cruzamento
  const [atestadosBanco, setAtestadosBanco] = useState<AtestadoLite[]>([]);

  // === Helpers ===
  const matchFuncionario = (data: { funcionario_nome?: string; cpf?: string }) => {
    const cpf = onlyDigits(data.cpf || '');
    if (cpf) {
      const byCpf = employees.find((e) => onlyDigits(e.cpf) === cpf);
      if (byCpf) return byCpf;
    }
    const nome = (data.funcionario_nome || '').trim().toLowerCase();
    if (!nome) return undefined;
    let m = employees.find((e) => e.name.trim().toLowerCase() === nome);
    if (m) return m;
    const tokens = nome.split(/\s+/).filter((t) => t.length > 2);
    m = employees.find((e) => {
      const en = e.name.toLowerCase();
      return tokens.every((t) => en.includes(t));
    });
    return m;
  };

  // === BLOCO 1: Atestados ===
  const handleAtestados = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const userId = session?.user?.id;
    if (!userId) { toast.error('Sessão expirada'); return; }

    for (const file of Array.from(files)) {
      const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const path = `${userId}/${safeName}`;

      setAtestadosStaging((p) => [...p, {
        fileName: file.name, fileUrl: '', fileSize: file.size,
        status: 'subindo', aplicarVR: true, aplicarVT: true,
      }]);

      const up = await supabase.storage.from('atestados').upload(path, file, { upsert: false });
      if (up.error) {
        setAtestadosStaging((p) => p.map((s) => s.fileName === file.name && s.status === 'subindo'
          ? { ...s, status: 'erro', erro: up.error.message } : s));
        continue;
      }
      const { data: signed } = await supabase.storage.from('atestados').createSignedUrl(path, 3600);
      const fileUrl = signed?.signedUrl || '';

      setAtestadosStaging((p) => p.map((s) => s.fileName === file.name && s.status === 'subindo'
        ? { ...s, status: 'processando', fileUrl } : s));

      try {
        let dataUrl: string;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const { pageUrls } = await renderPdfPagesToDataUrls(fileUrl, 1.6, 1);
          if (!pageUrls.length) throw new Error('PDF sem páginas legíveis');
          dataUrl = pageUrls[0];
        } else {
          dataUrl = await fileToDataUrl(file);
        }
        const { data, error } = await supabase.functions.invoke('ocr-atestado', { body: { dataUrl } });
        if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Falha OCR');
        const ext = data.data;
        const emp = matchFuncionario({ funcionario_nome: ext.funcionario_nome, cpf: ext.cpf });
        const empresa = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
        setAtestadosStaging((p) => p.map((s) => s.fileUrl === fileUrl ? {
          ...s, status: 'ok',
          funcionarioId: emp?.id,
          funcionarioNome: ext.funcionario_nome || emp?.name || '',
          empresaNome: empresa?.name || '',
          cpf: ext.cpf || '',
          dataInicio: ext.data_inicio || '',
          dataFim: ext.data_fim || ext.data_inicio || '',
          diasCobertos: Number(ext.dias_cobertos) || 1,
          cid: ext.cid || '', medico: ext.medico || '', crm: ext.crm || '',
          textoBruto: ext.texto_bruto || '',
          confianca: Number(ext.confianca) || 0,
        } : s));
      } catch (e: any) {
        setAtestadosStaging((p) => p.map((s) => s.fileUrl === fileUrl
          ? { ...s, status: 'erro', erro: e.message } : s));
      }
    }
  };

  const updateAtest = (i: number, patch: Partial<AtestadoStaging>) => {
    setAtestadosStaging((p) => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const removeAtest = (i: number) => setAtestadosStaging((p) => p.filter((_, idx) => idx !== i));

  const salvarAtestados = async () => {
    const validos = atestadosStaging.filter((s) => s.status === 'ok' && s.funcionarioId);
    if (!validos.length) { toast.error('Vincule o funcionário antes de salvar.'); return; }
    setSalvandoAtest(true);
    try {
      const userId = session!.user!.id;
      const userName = session!.user!.email || 'Sistema';
      const rowsAt = validos.map((v) => {
        const emp = employees.find((e) => e.id === v.funcionarioId);
        const company = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
        const comp = (v.dataInicio || new Date().toISOString().slice(0, 10)).slice(0, 7);
        return {
          funcionario_id: v.funcionarioId!,
          funcionario_nome: emp?.name || v.funcionarioNome || '',
          company_id: emp?.companyId,
          empresa_nome: company?.name || '',
          competencia: comp,
          data_inicio: v.dataInicio || null,
          data_fim: v.dataFim || v.dataInicio || null,
          dias_cobertos: v.diasCobertos || 1,
          cid: v.cid || '', medico: v.medico || '', crm: v.crm || '',
          arquivo_url: v.fileUrl, arquivo_nome: v.fileName,
          ocr_texto_bruto: v.textoBruto || '', ocr_confianca: v.confianca || 0,
          status: 'confirmado',
          aplicado_vr: v.aplicarVR, aplicado_vt: v.aplicarVT,
          importado_por_user_id: userId, importado_por_nome: userName,
        };
      });
      const { error: errA } = await supabase.from('atestados').insert(rowsAt);
      if (errA) throw errA;

      const rowsDocs = validos.map((v) => {
        const emp = employees.find((e) => e.id === v.funcionarioId);
        const company = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
        const comp = (v.dataInicio || new Date().toISOString().slice(0, 10)).slice(0, 7);
        return {
          funcionario_id: v.funcionarioId!,
          funcionario_nome: emp?.name || '',
          company_id: emp?.companyId,
          empresa_nome: company?.name || '',
          tipo_documento: 'Atestado Médico',
          competencia: comp,
          descricao: `Atestado ${v.diasCobertos || 1} dia(s)${v.cid ? ` — CID ${v.cid}` : ''}`,
          arquivo_url: v.fileUrl,
          gerado_por_user_id: userId, gerado_por_nome: userName,
          status_envio: 'arquivado',
          unidade: company?.name || '',
        };
      });
      await supabase.from('documentos_funcionario').insert(rowsDocs);

      toast.success(`${validos.length} atestado(s) arquivado(s).`);
      setAtestadosStaging((p) => p.filter((s) => !validos.includes(s)));
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSalvandoAtest(false);
    }
  };

  // === BLOCO 2: Cartões de Ponto ===
  const handleCartoes = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const userId = session?.user?.id;
    if (!userId) { toast.error('Sessão expirada'); return; }
    const userName = session?.user?.email || 'Sistema';

    for (const file of Array.from(files)) {
      const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const path = `cartoes/${userId}/${safeName}`;
      setCartoesStaging((p) => [...p, { fileName: file.name, fileUrl: '', status: 'subindo' }]);

      const up = await supabase.storage.from('atestados').upload(path, file, { upsert: false });
      if (up.error) {
        setCartoesStaging((p) => p.map((s) => s.fileName === file.name && s.status === 'subindo'
          ? { ...s, status: 'erro', erro: up.error.message } : s));
        continue;
      }
      const { data: signed2 } = await supabase.storage.from('atestados').createSignedUrl(path, 3600);
      const fileUrl = signed2?.signedUrl || '';

      setCartoesStaging((p) => p.map((s) => s.fileName === file.name && s.status === 'subindo'
        ? { ...s, status: 'processando', fileUrl } : s));

      try {
        let dataUrl: string;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const { pageUrls } = await renderPdfPagesToDataUrls(fileUrl, 1.8, 1);
          if (!pageUrls.length) throw new Error('PDF sem páginas legíveis');
          dataUrl = pageUrls[0];
        } else {
          dataUrl = await fileToDataUrl(file);
        }
        const { data, error } = await supabase.functions.invoke('ocr-cartao-ponto', { body: { dataUrl } });
        if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Falha OCR');
        const ext = data.data as CartaoPonto;
        const emp = matchFuncionario({ funcionario_nome: ext.funcionario_nome, cpf: ext.cpf });
        const empresa = emp ? companies.find((c) => c.id === emp.companyId) : undefined;
        const compCartao = ext.competencia || competencia;

        // Persiste o cartão no banco para sobreviver a refresh / aparecer na conferência
        const { error: errIns } = await (supabase.from('cartoes_ponto') as unknown as { insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }).insert({
          funcionario_id: emp?.id || null,
          funcionario_nome: ext.funcionario_nome || emp?.name || '',
          company_id: emp?.companyId || null,
          empresa_nome: empresa?.name || '',
          competencia: compCartao,
          arquivo_nome: file.name,
          arquivo_url: fileUrl,
          origem: 'ocr',
          ocr_confianca: Number(ext.confianca) || 0,
          dias_json: ext.dias || [],
          status_conferencia: 'pendente',
          importado_por_user_id: userId,
          importado_por_nome: userName,
        });
        if (errIns) {
          // Não bloqueia o staging — apenas avisa
          // eslint-disable-next-line no-console
          console.warn('Falha ao persistir cartão:', errIns.message);
        }

        setCartoesStaging((p) => p.map((s) => s.fileUrl === fileUrl ? {
          ...s, status: 'ok',
          funcionarioId: emp?.id,
          funcionarioNome: ext.funcionario_nome || emp?.name || '',
          competencia: compCartao,
          cartao: ext,
          confianca: Number(ext.confianca) || 0,
        } : s));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        setCartoesStaging((p) => p.map((s) => s.fileUrl === fileUrl
          ? { ...s, status: 'erro', erro: msg } : s));
      }
    }
  };

  const updateCartao = (i: number, patch: Partial<CartaoStaging>) => {
    setCartoesStaging((p) => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const removeCartao = (i: number) => setCartoesStaging((p) => p.filter((_, idx) => idx !== i));

  // === BLOCO 3: Cruzamento ===
  const carregarAtestadosBanco = async () => {
    const { data, error } = await supabase
      .from('atestados')
      .select('funcionario_id, funcionario_nome, data_inicio, data_fim')
      .eq('competencia', competencia);
    if (error) { toast.error('Erro ao buscar atestados: ' + error.message); return []; }
    const lite: AtestadoLite[] = (data || []).map((a: any) => ({
      funcionario_id: a.funcionario_id,
      funcionario_nome: a.funcionario_nome,
      data_inicio: a.data_inicio,
      data_fim: a.data_fim || a.data_inicio,
    }));
    setAtestadosBanco(lite);
    return lite;
  };

  const cruzar = async () => {
    const cartoesProntos = cartoesStaging.filter((c) => c.status === 'ok' && c.cartao);
    if (!cartoesProntos.length) { toast.error('Nenhum cartão lido para cruzar.'); return; }
    const atestados = await carregarAtestadosBanco();
    const res: ResultadoCruzamento[] = cartoesProntos.map((c) => {
      const emp = employees.find((e) => e.id === c.funcionarioId);
      const cargo = emp?.cargo || '';
      const atsDoFunc = atestados.filter((a) =>
        (c.funcionarioId && a.funcionario_id === c.funcionarioId) ||
        a.funcionario_nome.toLowerCase().includes((c.funcionarioNome || '').toLowerCase().split(' ')[0]),
      );
      const r = cruzarCartaoComAtestados(c.cartao!, cargo, atsDoFunc, competencia);
      r.funcionario_id = c.funcionarioId;
      return r;
    });
    setResultados(res);
    setTab('cruzamento');
    toast.success(`Cruzamento gerado: ${res.length} colaboradores.`);
  };

  const aplicarNoFechamento = async () => {
    if (!resultados.length) { toast.error('Cruze primeiro.'); return; }
    setAplicandoFechamento(true);
    try {
      let aplicados = 0;
      let pulados = 0;
      for (const r of resultados) {
        if (r.ignorado || !r.funcionario_id) { pulados += 1; continue; }
        const emp = employees.find((e) => e.id === r.funcionario_id);
        if (!emp) { pulados += 1; continue; }

        // Garante que o lançamento existe
        getOrCreateEntries(emp.companyId, competencia);
        // Aguarda o estado atualizar — busca direto do array atual
        let entry = entries.find((e) => e.employeeId === emp.id && e.competencia === competencia);

        // Atualiza somente os campos vindos do cartão (preserva manuais).
        const obs = `Importado do cartão de ponto em ${new Date().toLocaleString('pt-BR')}. ` +
          `${r.diasAtestado} dia(s) cobertos por atestado; ${r.faltasDias} falta(s); ` +
          `${r.atrasosMinutos} min de atraso; HE50 ${r.he50Horas}h; HE100 ${r.he100Horas}h.`;

        await supabase
          .from('lancamentos_mensais')
          .upsert({
            ...entryToRow({
              employeeId: emp.id,
              companyId: emp.companyId,
              competencia,
              faltasDias: r.faltasDias,
              atrasos: Math.round((r.atrasosMinutos / 60) * 100) / 100, // horas
              he50: r.he50Horas,
              he100: r.he100Horas,
              observacoes: obs,
            }),
          }, { onConflict: 'funcionario_id,competencia' });
        aplicados += 1;
      }
      toast.success(`Fechamento alimentado: ${aplicados} aplicados, ${pulados} pulados.`);
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setAplicandoFechamento(false);
    }
  };

  const totaisCruz = useMemo(() => {
    return resultados.reduce((acc, r) => ({
      faltas: acc.faltas + r.faltasDias,
      atest: acc.atest + r.diasAtestado,
      he50: acc.he50 + r.he50Horas,
      he100: acc.he100 + r.he100Horas,
      atrasos: acc.atrasos + r.atrasosMinutos,
      ignorados: acc.ignorados + (r.ignorado ? 1 : 0),
    }), { faltas: 0, atest: 0, he50: 0, he100: 0, atrasos: 0, ignorados: 0 });
  }, [resultados]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Importação para o Fechamento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suba <strong>Atestados</strong> e <strong>Cartões de Ponto</strong>. O sistema cruza automaticamente:
            atestado válido cobre falta (só desconta VR/VT); sem atestado vira falta + DSR + VR/VT.
            Tolerância de {TOLERANCIA_MIN} min. Exceções: Jerri, mecânicos de rua, Rodrigo Sabino, Rodrigo Medrado e regra HE 50% do Marcelo.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência</label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-44" />
          </div>
          <Link to="/admin/conferencia-ponto" className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium">
            <ClipboardCheck className="w-4 h-4" /> Conferência de Ponto
            <ExternalLink className="w-3 h-3 opacity-70" />
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="atestados">1. Atestados ({atestadosStaging.length})</TabsTrigger>
          <TabsTrigger value="cartoes">2. Cartões de Ponto ({cartoesStaging.length})</TabsTrigger>
          <TabsTrigger value="cruzamento">3. Cruzamento & Aplicar ({resultados.length})</TabsTrigger>
        </TabsList>

        {/* === ATESTADOS === */}
        <TabsContent value="atestados" className="space-y-4 mt-4">
          <Card className="p-6 border-2 border-dashed border-primary/30 bg-primary/5">
            <input ref={inputAtestRef} type="file" multiple accept="application/pdf,image/*"
              onChange={(e) => handleAtestados(e.target.files)} className="hidden" />
            <button onClick={() => inputAtestRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-primary/5 rounded-lg transition">
              <Upload className="w-10 h-10 text-primary" />
              <div className="text-center">
                <p className="font-semibold">Subir Atestados (PDF ou imagem)</p>
                <p className="text-xs text-muted-foreground">Pode selecionar vários ao mesmo tempo</p>
              </div>
            </button>
          </Card>

          {atestadosStaging.length > 0 && (
            <div className="space-y-3">
              {atestadosStaging.map((s, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{s.fileName}</p>
                        <p className="text-xs text-muted-foreground">{(s.fileSize / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === 'subindo' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Subindo</Badge>}
                      {s.status === 'processando' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Lendo…</Badge>}
                      {s.status === 'ok' && <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>}
                      {s.status === 'erro' && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>}
                      <Button size="sm" variant="ghost" onClick={() => removeAtest(i)}>×</Button>
                    </div>
                  </div>
                  {s.status === 'erro' && <p className="text-xs text-destructive">{s.erro}</p>}
                  {s.status === 'ok' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                      <div className="md:col-span-2">
                        <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />Funcionário</label>
                        <select value={s.funcionarioId || ''} onChange={(e) => updateAtest(i, { funcionarioId: e.target.value || undefined })}
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${!s.funcionarioId ? 'border-destructive' : ''}`}>
                          <option value="">— Selecione —</option>
                          {employees.filter((e) => e.status === 'ativo').map((emp) => {
                            const c = companies.find((cc) => cc.id === emp.companyId);
                            return <option key={emp.id} value={emp.id}>{emp.name} • {c?.name || ''}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Início</label>
                        <Input type="date" value={s.dataInicio || ''} onChange={(e) => updateAtest(i, { dataInicio: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Fim</label>
                        <Input type="date" value={s.dataFim || ''} onChange={(e) => updateAtest(i, { dataFim: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Dias</label>
                        <Input type="number" min="1" value={s.diasCobertos || 1} onChange={(e) => updateAtest(i, { diasCobertos: Number(e.target.value) })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">CID</label>
                        <Input value={s.cid || ''} onChange={(e) => updateAtest(i, { cid: e.target.value })} className="h-9" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] uppercase text-muted-foreground">Médico</label>
                        <Input value={s.medico || ''} onChange={(e) => updateAtest(i, { medico: e.target.value })} className="h-9" />
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setAtestadosStaging([])} disabled={salvandoAtest}>Limpar</Button>
                <Button onClick={salvarAtestados} disabled={salvandoAtest} className="gradient-primary text-primary-foreground">
                  {salvandoAtest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Confirmar e arquivar
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* === CARTÕES === */}
        <TabsContent value="cartoes" className="space-y-4 mt-4">
          <Card className="p-6 border-2 border-dashed border-primary/30 bg-primary/5">
            <input ref={inputCartaoRef} type="file" multiple accept="application/pdf,image/*"
              onChange={(e) => handleCartoes(e.target.files)} className="hidden" />
            <button onClick={() => inputCartaoRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-primary/5 rounded-lg transition">
              <Clock className="w-10 h-10 text-primary" />
              <div className="text-center">
                <p className="font-semibold">Subir Cartões de Ponto (PDF ou imagem)</p>
                <p className="text-xs text-muted-foreground">Espelho mensal de cada funcionário — pode mandar vários</p>
              </div>
            </button>
          </Card>

          {cartoesStaging.length > 0 && (
            <div className="space-y-3">
              {cartoesStaging.map((s, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Clock className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{s.fileName}</p>
                        {s.cartao && (
                          <p className="text-xs text-muted-foreground">
                            {s.cartao.dias?.length || 0} dia(s) lidos
                            {s.competencia && ` • Comp. ${s.competencia}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === 'subindo' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Subindo</Badge>}
                      {s.status === 'processando' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Lendo…</Badge>}
                      {s.status === 'ok' && <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>}
                      {s.status === 'erro' && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>}
                      <Button size="sm" variant="ghost" onClick={() => removeCartao(i)}>×</Button>
                    </div>
                  </div>
                  {s.status === 'erro' && <p className="text-xs text-destructive mt-2">{s.erro}</p>}
                  {s.status === 'ok' && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="md:col-span-2">
                        <label className="text-[10px] uppercase text-muted-foreground">Funcionário</label>
                        <select value={s.funcionarioId || ''} onChange={(e) => updateCartao(i, { funcionarioId: e.target.value || undefined })}
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${!s.funcionarioId ? 'border-destructive' : ''}`}>
                          <option value="">— Selecione —</option>
                          {employees.filter((e) => e.status === 'ativo').map((emp) => {
                            const c = companies.find((cc) => cc.id === emp.companyId);
                            return <option key={emp.id} value={emp.id}>{emp.name} • {c?.name || ''}</option>;
                          })}
                        </select>
                        {s.funcionarioNome && !s.funcionarioId && (
                          <p className="text-[10px] text-warning mt-1">Sugerido: "{s.funcionarioNome}" — selecione manual</p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Competência</label>
                        <Input type="month" value={s.competencia || competencia} onChange={(e) => updateCartao(i, { competencia: e.target.value })} className="h-9" />
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setCartoesStaging([])}>Limpar</Button>
                <Button onClick={cruzar} className="gradient-primary text-primary-foreground">
                  <Wand2 className="w-4 h-4 mr-2" />
                  Cruzar com Atestados
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* === CRUZAMENTO === */}
        <TabsContent value="cruzamento" className="space-y-4 mt-4">
          {resultados.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Suba atestados, depois cartões e clique em <strong>Cruzar com Atestados</strong>.</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Faltas</p><p className="text-2xl font-bold text-destructive">{totaisCruz.faltas}</p></Card>
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Dias atestado</p><p className="text-2xl font-bold text-warning">{totaisCruz.atest}</p></Card>
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">HE 50%</p><p className="text-2xl font-bold text-success">{totaisCruz.he50.toFixed(1)}h</p></Card>
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">HE 100%</p><p className="text-2xl font-bold text-success">{totaisCruz.he100.toFixed(1)}h</p></Card>
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Atraso (min)</p><p className="text-2xl font-bold text-warning">{totaisCruz.atrasos}</p></Card>
                <Card className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Ignorados</p><p className="text-2xl font-bold">{totaisCruz.ignorados}</p></Card>
              </div>

              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {['Colaborador', 'Status', 'Faltas', 'Atestado', 'Atraso', 'HE 50%', 'HE 100%', 'Observações'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium text-xs">{r.funcionario_nome}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.ignorado ? <Badge variant="outline">Ignorado</Badge> : <Badge className="bg-success text-success-foreground">OK</Badge>}
                        </td>
                        <td className="px-3 py-2 text-xs text-destructive">{r.faltasDias || '—'}</td>
                        <td className="px-3 py-2 text-xs text-warning">{r.diasAtestado || '—'}</td>
                        <td className="px-3 py-2 text-xs">{r.atrasosMinutos > 0 ? `${r.atrasosMinutos}min` : '—'}</td>
                        <td className="px-3 py-2 text-xs text-success">{r.he50Horas > 0 ? `${r.he50Horas}h` : '—'}</td>
                        <td className="px-3 py-2 text-xs text-success">{r.he100Horas > 0 ? `${r.he100Horas}h` : '—'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.motivoIgnorado || (r.warnings.length ? r.warnings.join('; ') : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <div className="flex justify-end gap-3 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-xl border">
                <Button variant="outline" onClick={() => setResultados([])}>Limpar</Button>
                <Button onClick={aplicarNoFechamento} disabled={aplicandoFechamento} className="gradient-primary text-primary-foreground">
                  {aplicandoFechamento ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Alimentar Fechamento ({competencia})
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImportacaoFechamentoPage;
