import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { FileText, CalendarCheck, RefreshCw } from 'lucide-react';

type Arquivo = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string | null;
  company_id: string | null;
  empresa_nome: string | null;
  arquivo_url: string | null;
  nome_arquivo: string | null;
  descricao: string | null;
  observacao: string | null;
  data_documento: string | null;
};

type AtestadoRegistrado = {
  id: string;
  funcionario_id: string;
  arquivo_url: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  aplicado_vr: boolean | null;
  aplicado_vt: boolean | null;
};

type Revisao = { inicio: string; fim: string; aplicarVR: boolean; aplicarVT: boolean };

const DEFAULT_REVIEW: Revisao = { inicio: '', fim: '', aplicarVR: false, aplicarVT: false };
const dateOnly = (value: string) => value?.slice(0, 10) || '';
const uniqueKey = (doc: Arquivo) => `${doc.funcionario_id || 'sem-id'}|${doc.arquivo_url || doc.id}`;
const daysInclusive = (inicio: string, fim: string) =>
  Math.floor((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1;

const ConferenciaAtestadosBeneficiosPage: React.FC<{ tipo: 'vr' | 'vt' }> = ({ tipo }) => {
  const sigla = tipo.toUpperCase();
  const { employees, companies, session } = useApp();
  const [docs, setDocs] = useState<Arquivo[]>([]);
  const [confirmed, setConfirmed] = useState<AtestadoRegistrado[]>([]);
  const [review, setReview] = useState<Record<string, Revisao>>({});
  const [selectedCompany, setSelectedCompany] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [d, a] = await Promise.all([
        supabase.from('documentos_funcionario')
          .select('id,funcionario_id,funcionario_nome,company_id,empresa_nome,arquivo_url,nome_arquivo,descricao,observacao,data_documento')
          .ilike('tipo_documento', '%ATESTADO%')
          .order('data_documento', { ascending: false }).limit(250),
        supabase.from('atestados')
          .select('id,funcionario_id,arquivo_url,data_inicio,data_fim,status,aplicado_vr,aplicado_vt')
          .limit(500),
      ]);
      if (cancelled) return;
      if (d.error || a.error) {
        toast.error('Erro ao consultar documentos: ' + (d.error?.message || a.error?.message));
      } else {
        setDocs(d.data || []);
        setConfirmed(a.data || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const docGroups = useMemo(() => {
    const groups = new Map<string, Arquivo>();
    for (const doc of docs) {
      const key = uniqueKey(doc);
      const existing = groups.get(key);
      if (!existing || (doc.observacao || '').length > (existing.observacao || '').length) groups.set(key, doc);
    }
    return [...groups.values()]
      .filter(doc => selectedCompany === 'todas' || doc.company_id === selectedCompany);
  }, [docs, selectedCompany]);

  const getRegistered = (doc: Arquivo) =>
    confirmed.find(a => a.funcionario_id === doc.funcionario_id && Boolean(doc.arquivo_url) && a.arquivo_url === doc.arquivo_url);
  const pendingCount = docGroups.filter(doc => {
    const r = getRegistered(doc);
    return !r || r.status !== 'confirmado' || !r.data_inicio || !r.data_fim;
  }).length;

  const getReview = (doc: Arquivo): Revisao => {
    const fromDb = getRegistered(doc);
    return review[doc.id] || (fromDb ? {
      inicio: dateOnly(fromDb.data_inicio || ''),
      fim: dateOnly(fromDb.data_fim || ''),
      aplicarVR: fromDb.aplicado_vr === true,
      aplicarVT: fromDb.aplicado_vt === true,
    } : { ...DEFAULT_REVIEW, aplicarVT: tipo === 'vt' });
  };
  const changeReview = (doc: Arquivo, patch: Partial<Revisao>) =>
    setReview(prev => ({ ...prev, [doc.id]: { ...getReview(doc), ...patch } }));

  const save = async (doc: Arquivo) => {
    if (!session?.user?.id || !doc.funcionario_id || !doc.arquivo_url) {
      toast.error('Atestado sem funcionário vinculado ou arquivo original. Corrija no cadastro antes de confirmar.');
      return;
    }
    const emp = employees.find(e => e.id === doc.funcionario_id);
    const companyId = doc.company_id || emp?.companyId;
    if (!companyId) return toast.error('Empresa não identificada para este atestado.');
    const data = getReview(doc);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(data.fim)) {
      return toast.error('Informe o início e o fim que constam no atestado, não a data do upload.');
    }
    const dias = daysInclusive(data.inicio, data.fim);
    if (!Number.isFinite(dias) || dias <= 0 || dias > 365) {
      return toast.error('Intervalo inválido. Confira as datas no documento original.');
    }
    setSavingId(doc.id);
    try {
      const original = getRegistered(doc);
      const values = {
        funcionario_id: doc.funcionario_id,
        funcionario_nome: emp?.name || doc.funcionario_nome || '',
        company_id: companyId,
        empresa_nome: companies.find(c => c.id === companyId)?.name || doc.empresa_nome || '',
        competencia: data.inicio.slice(0, 7),
        data_inicio: data.inicio,
        data_fim: data.fim,
        dias_cobertos: dias,
        arquivo_url: doc.arquivo_url,
        arquivo_nome: doc.nome_arquivo || 'Atestado arquivado',
        status: 'confirmado',
        aplicado_vr: tipo === 'vr' ? data.aplicarVR : original?.aplicado_vr === true,
        aplicado_vt: tipo === 'vt' ? data.aplicarVT : original?.aplicado_vt === true,
        importado_por_user_id: session.user.id,
        importado_por_nome: session.user.email || '',
      };
      const query = original?.id
        ? supabase.from('atestados').update(values).eq('id', original.id)
        : supabase.from('atestados').insert(values);
      const { error } = await query;
      if (error) throw error;
      toast.success(`Datas conferidas. Configuração do ${sigla} registrada de forma independente.`);
      setReload(n => n + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao registrar atestado.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <section className="space-y-5 p-4 md:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conferência de atestados — {sigla}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Consulte os atestados históricos e confirme as datas antes do lançamento de {sigla}.
            Esta conferência altera apenas {sigla}; não modifica a configuração do outro benefício.
            A data do upload não representa necessariamente a data do afastamento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReload(n => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          <Button variant="outline" asChild><Link to={`/admin/consolidado-${tipo}`}>Consolidado {sigla}</Link></Button>
        </div>
      </header>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border p-3">Documentos únicos: <b>{docGroups.length}</b></span>
        <span className="rounded-lg border p-3">Pendentes de datas: <b>{pendingCount}</b></span>
        <label className="text-xs">Empresa
          <select className="mt-1 block h-10 rounded-md border border-input bg-background px-3" value={selectedCompany}
            onChange={event => setSelectedCompany(event.target.value)}>
            <option value="todas">Todas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {loading && <p>Consultando arquivos...</p>}
      <div className="grid gap-4">
        {docGroups.map(doc => {
          const registered = getRegistered(doc);
          const approved = Boolean(registered?.status === 'confirmado' && registered?.data_inicio && registered?.data_fim);
          const values = getReview(doc);
          return (
            <article key={doc.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{doc.funcionario_nome || 'Funcionário não identificado'}</div>
                  <div className="text-xs text-muted-foreground">{doc.empresa_nome} · Arquivo {doc.nome_arquivo || 'sem nome'} · Registro {dateOnly(doc.data_documento || '')}</div>
                  <div className="mt-1 text-xs">{approved ? 'DATAS VALIDADAS' : 'PENDENTE DE CONFERÊNCIA'}</div>
                </div>
                {doc.arquivo_url && <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm underline">
                  <FileText className="h-4 w-4" />Ver documento
                </a>}
              </div>
              <p className="my-2 text-xs text-muted-foreground">{doc.descricao} {doc.observacao}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold">Início do afastamento
                  <Input className="mt-1" type="date" value={values.inicio} onChange={e => changeReview(doc, { inicio: e.target.value })} />
                </label>
                <label className="text-xs font-semibold">Fim do afastamento
                  <Input className="mt-1" type="date" value={values.fim} onChange={e => changeReview(doc, { fim: e.target.value })} />
                </label>
                {tipo === 'vr' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={values.aplicarVR} onCheckedChange={checked => changeReview(doc, { aplicarVR: checked === true })} />
                    Aplicar abatimento no VR (somente se permitido pela regra contratual)
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={values.aplicarVT} onCheckedChange={checked => changeReview(doc, { aplicarVT: checked === true })} />
                    Aplicar abatimento no VT (dias sem deslocamento)
                  </label>
                )}
                <Button onClick={() => void save(doc)} disabled={savingId === doc.id || !doc.arquivo_url}>
                  <CalendarCheck className="mr-2 h-4 w-4" />{savingId === doc.id ? 'Salvando...' : `Validar datas — ${sigla}`}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!loading && !docGroups.length && <p className="rounded-lg border p-5 text-sm">Não há atestados arquivados neste filtro.</p>}
    </section>
  );
};

export default ConferenciaAtestadosBeneficiosPage;
