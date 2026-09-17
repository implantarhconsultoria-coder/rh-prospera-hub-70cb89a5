import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronRight, FileUp, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

type Funcionario = { id: string; nome: string };
type SupportView = 'pdf' | 'autorizacao' | 'mensal' | null;

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default function AlmoxarifadoFechamentoOperacional() {
  const { session } = useApp();
  const user = session?.user;
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [funcionarioId, setFuncionarioId] = useState('');
  const [dataReferencia, setDataReferencia] = useState(isoDate(new Date()));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [supportView, setSupportView] = useState<SupportView>(null);

  const [autorizadoPor, setAutorizadoPor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvandoAutorizacao, setSalvandoAutorizacao] = useState(false);

  const [competencia, setCompetencia] = useState(isoDate(new Date()).slice(0, 7));
  const [fechandoMes, setFechandoMes] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('funcionarios')
        .select('id,nome')
        .eq('ativo', true)
        .order('nome');
      setFuncionarios((data || []) as Funcionario[]);
    })();
  }, []);

  const funcionario = useMemo(
    () => funcionarios.find((item) => item.id === funcionarioId) || null,
    [funcionarios, funcionarioId]
  );

  const operadorNome =
    user?.user_metadata?.nome || user?.user_metadata?.full_name || user?.email || 'Operador almoxarifado';

  async function arquivarPdf() {
    if (!funcionario || !arquivo) {
      toast({ variant: 'destructive', title: 'Selecione o funcionário e o PDF assinado.' });
      return;
    }
    if (arquivo.type && arquivo.type !== 'application/pdf') {
      toast({ variant: 'destructive', title: 'O arquivo precisa ser PDF.' });
      return;
    }

    setEnviando(true);
    try {
      const path = `almoxarifado/${funcionario.id}/${dataReferencia}/${Date.now()}-${arquivo.name}`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(path, arquivo, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

      const { data: fechamento } = await (supabase as any)
        .from('almoxarifado_fechamentos_funcionario')
        .select('id')
        .eq('funcionario_id', funcionario.id)
        .eq('data_referencia', dataReferencia)
        .maybeSingle();

      const { error } = await (supabase as any).from('almoxarifado_documentos_assinados').insert({
        fechamento_funcionario_id: fechamento?.id || null,
        funcionario_id: funcionario.id,
        funcionario_nome: funcionario.nome,
        data_referencia: dataReferencia,
        arquivo_url: urlData.publicUrl,
        arquivo_nome: arquivo.name,
        enviado_por: user?.id || null,
        enviado_por_nome: operadorNome,
      });
      if (error) throw error;
      setArquivo(null);
      toast({ title: 'PDF assinado arquivado', description: 'Documento salvo no histórico do almoxarifado e do funcionário.' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Falha ao arquivar PDF assinado.' });
    } finally {
      setEnviando(false);
    }
  }

  async function registrarAutorizacao() {
    if (!funcionario || !autorizadoPor.trim() || !motivo.trim()) {
      toast({ variant: 'destructive', title: 'Preencha funcionário, autorizador e motivo.' });
      return;
    }
    setSalvandoAutorizacao(true);
    const { error } = await (supabase as any).from('almoxarifado_autorizacoes_excepcionais').insert({
      data_hora: new Date().toISOString(),
      funcionario_id: funcionario.id,
      funcionario_nome: funcionario.nome,
      motivo: motivo.trim(),
      autorizado_por_nome: autorizadoPor.trim(),
      operador_id: user?.id || null,
      operador_nome: operadorNome,
    });
    setSalvandoAutorizacao(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Falha ao registrar autorização.' });
      return;
    }
    setAutorizadoPor('');
    setMotivo('');
    toast({ title: 'Autorização excepcional registrada.' });
  }

  async function fecharMes() {
    if (!competencia) return;
    setFechandoMes(true);
    try {
      const inicio = `${competencia}-01T00:00:00`;
      const fimDate = new Date(`${competencia}-01T00:00:00`);
      fimDate.setMonth(fimDate.getMonth() + 1);
      const fim = fimDate.toISOString();

      const [{ data: entradas }, { data: saidas }, { data: itens }] = await Promise.all([
        (supabase as any).from('almoxarifado_entradas').select('*').gte('datahora', inicio).lt('datahora', fim),
        (supabase as any).from('almoxarifado_saidas').select('*').gte('datahora', inicio).lt('datahora', fim),
        (supabase as any).from('almoxarifado_itens').select('id,descricao,quantidade'),
      ]);

      const resumo = {
        total_entradas: (entradas || []).reduce((s: number, row: any) => s + Number(row.quantidade || 0), 0),
        total_retiradas: (saidas || []).reduce((s: number, row: any) => s + Number(row.quantidade || 0), 0),
        saldo_atual: (itens || []).reduce((s: number, row: any) => s + Number(row.quantidade || 0), 0),
      };

      const detalhe = { entradas: entradas || [], saidas: saidas || [], estoque_atual: itens || [] };
      const { error } = await (supabase as any).from('almoxarifado_fechamentos_mensais').upsert(
        {
          competencia: `${competencia}-01`,
          company_id: null,
          empresa_nome: 'TOPAC Matriz',
          resumo,
          detalhe,
          fechado_por: user?.id || null,
          fechado_por_nome: operadorNome,
          fechado_em: new Date().toISOString(),
        },
        { onConflict: 'competencia,company_id' }
      );
      if (error) throw error;
      toast({ title: 'Fechamento mensal persistido', description: `${competencia}: entradas, retiradas e saldo foram congelados no histórico.` });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Não foi possível concluir o fechamento mensal.' });
    } finally {
      setFechandoMes(false);
    }
  }

  const supportCards = [
    { id: 'pdf' as const, icon: FileUp, title: 'PDF assinado', subtitle: 'Arquivar o relatório já assinado' },
    { id: 'autorizacao' as const, icon: AlertTriangle, title: 'Retirada fora do horário', subtitle: 'Registrar autorização excepcional' },
    { id: 'mensal' as const, icon: CalendarDays, title: 'Fechamento mensal', subtitle: 'Congelar entradas, retiradas e saldo' },
  ];

  return (
    <section className="almox-operacional-persistencia">
      <div className="almox-support-header">
        <div>
          <h2>Controles e fechamento</h2>
          <p>Abra somente o procedimento que precisar. Os demais ficam recolhidos.</p>
        </div>
      </div>

      <div className="almox-support-grid">
        {supportCards.map(({ id, icon: Icon, title, subtitle }) => (
          <button key={id} type="button" className={`almox-support-card ${supportView === id ? 'active' : ''}`} onClick={() => setSupportView((current) => current === id ? null : id)}>
            <span className="almox-support-icon"><Icon size={19} /></span>
            <span><strong>{title}</strong><small>{subtitle}</small></span>
            <ChevronRight className="almox-support-arrow" size={18} />
          </button>
        ))}
      </div>

      {supportView === 'pdf' && (
        <article className="almox-support-detail">
          <div className="almox-support-detail-head">
            <div className="almox-section-title"><FileUp size={19} /><div><strong>Arquivar PDF assinado</strong><small>Digitalize o relatório assinado manualmente e guarde no histórico.</small></div></div>
            <button type="button" className="almox-support-close" onClick={() => setSupportView(null)} aria-label="Fechar"><X size={17} /></button>
          </div>
          <div className="almox-form-grid">
            <label className="almox-field"><span>Funcionário</span><select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)}><option value="">Selecionar funcionário...</option>{funcionarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="almox-field"><span>Data de referência</span><input type="date" value={dataReferencia} min="2026-09-16" onChange={(e) => setDataReferencia(e.target.value)} /></label>
            <label className="almox-field full"><span>PDF assinado</span><input type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></label>
            <div className="almox-form-actions"><button type="button" className="almox-primary" onClick={arquivarPdf} disabled={enviando}>{enviando ? <Loader2 className="spin" size={17} /> : <FileUp size={17} />}{enviando ? 'Arquivando...' : 'Arquivar PDF'}</button></div>
          </div>
        </article>
      )}

      {supportView === 'autorizacao' && (
        <article className="almox-support-detail">
          <div className="almox-support-detail-head">
            <div className="almox-section-title"><AlertTriangle size={19} /><div><strong>Retirada fora do horário</strong><small>Registre a autorização antes de realizar a retirada excepcional.</small></div></div>
            <button type="button" className="almox-support-close" onClick={() => setSupportView(null)} aria-label="Fechar"><X size={17} /></button>
          </div>
          <div className="almox-form-grid">
            <label className="almox-field"><span>Funcionário que receberá o material</span><select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)}><option value="">Selecionar funcionário...</option>{funcionarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="almox-field"><span>Autorizado por</span><input value={autorizadoPor} onChange={(e) => setAutorizadoPor(e.target.value)} placeholder="Nome do responsável" /></label>
            <label className="almox-field full"><span>Motivo da autorização</span><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Informe o motivo da retirada excepcional" rows={3} /></label>
            <div className="almox-form-actions"><button type="button" className="almox-primary" onClick={registrarAutorizacao} disabled={salvandoAutorizacao}>{salvandoAutorizacao ? <Loader2 className="spin" size={17} /> : <AlertTriangle size={17} />}{salvandoAutorizacao ? 'Registrando...' : 'Registrar autorização'}</button></div>
          </div>
        </article>
      )}

      {supportView === 'mensal' && (
        <article className="almox-support-detail">
          <div className="almox-support-detail-head">
            <div className="almox-section-title"><CalendarDays size={19} /><div><strong>Fechamento mensal</strong><small>Persiste entradas, retiradas, saldo e detalhe por funcionário no histórico.</small></div></div>
            <button type="button" className="almox-support-close" onClick={() => setSupportView(null)} aria-label="Fechar"><X size={17} /></button>
          </div>
          <div className="almox-form-grid">
            <label className="almox-field"><span>Competência</span><input type="month" min="2026-09" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></label>
            <div className="almox-form-actions"><button type="button" className="almox-primary" onClick={fecharMes} disabled={fechandoMes}>{fechandoMes ? <Loader2 className="spin" size={17} /> : <CalendarDays size={17} />}{fechandoMes ? 'Fechando...' : 'Fechar e persistir mês'}</button></div>
          </div>
        </article>
      )}
    </section>
  );
}
