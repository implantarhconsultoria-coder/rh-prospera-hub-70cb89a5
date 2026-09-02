import React, { useState } from 'react';
import { Save, Sparkles, Loader2, Car, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type TipoAtivo = 'veiculo' | 'equipamento';

type FormState = {
  tipo: TipoAtivo;
  descricao: string;
  placa: string;
  patrimonio: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  empresa: string;
  marca: string;
  modelo: string;
  observacao: string;
};

const EMPTY: FormState = {
  tipo: 'veiculo',
  descricao: '',
  placa: '',
  patrimonio: '',
  renavam: '',
  chassi: '',
  ano_fabricacao: '',
  ano_modelo: '',
  empresa: 'TOPAC MATRIZ',
  marca: '',
  modelo: '',
  observacao: '',
};

const plain = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const plate = (value: unknown) => plain(value).replace(/[^A-Z0-9]/g, '').match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/)?.[0] || '';
const renavam = (value: unknown) => String(value || '').replace(/\D/g, '').match(/\d{9,11}/)?.[0] || '';
const chassis = (value: unknown) => plain(value).replace(/[^A-Z0-9]/g, '').match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] || '';
const year = (value: unknown) => String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
const patrimonio = (value: unknown) => plain(value).match(/\b[A-Z]\d{1,3}\.\d{1,5}\b/)?.[0] || '';
const first = (...values: unknown[]) => values.map(value => String(value || '').trim()).find(Boolean) || '';

const parseLocal = (text: string) => {
  const normalized = plain(text);
  const equipment = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE DE ILUMINACAO|MOTOCOMPRESSOR)\b/.test(normalized);
  const plateValue = plate(normalized.match(/\bPLACA\b[^A-Z0-9]{0,20}([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/i)?.[1] || normalized);
  const renavamValue = renavam(normalized.match(/\bRENAVAM\b[^0-9]{0,30}(\d[\d.\s-]{7,16})/i)?.[1] || '');
  const chassiValue = chassis(normalized.match(/\b(?:CHASSI|VIN)\b[^A-Z0-9]{0,30}([A-HJ-NPR-Z0-9]{17})/i)?.[1] || '');
  const patrimonioValue = patrimonio(normalized);
  const years = normalized.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const model = first(
    normalized.match(/\bMARCA\s*\/?\s*MODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|PATRIMONIO)\b|$)/i)?.[1],
    normalized.match(/\bMODELO\b\s*[:\-]?\s*([A-Z0-9][A-Z0-9 .\/-]{1,70}?)(?=\s+\b(?:PLACA|RENAVAM|CHASSI|ANO|COR|PATRIMONIO)\b|$)/i)?.[1],
  );
  const description = model ? `${equipment ? 'EQUIPAMENTO' : 'CARRO'} - ${model}` : equipment ? 'EQUIPAMENTO' : '';
  return {
    tipo: (equipment ? 'equipamento' : 'veiculo') as TipoAtivo,
    descricao: description,
    placa: plateValue,
    patrimonio: patrimonioValue,
    renavam: renavamValue,
    chassi: chassiValue,
    ano_fabricacao: years?.[1] || '',
    ano_modelo: years?.[2] || years?.[1] || '',
    modelo: model,
  };
};

export default function FrotaCadastroInteligente({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const { session } = useApp();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [smartText, setSmartText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const setField = (field: keyof FormState, value: string) => setForm(current => ({ ...current, [field]: value }));

  const processSmartText = async () => {
    if (!smartText.trim()) return toast.error('Cole a mensagem da Frota antes de processar.');
    setParsing(true);
    try {
      const local = parseLocal(smartText);
      let ai: Record<string, unknown> = {};
      try {
        const { data, error } = await supabase.functions.invoke('parse-text', {
          body: { type: 'documento_veiculo', text: smartText.slice(0, 60_000) },
        });
        if (!error) ai = (data?.data || {}) as Record<string, unknown>;
      } catch (error) {
        console.warn('Janela Inteligente da Frota usando parser local.', error);
      }
      const context = plain(`${smartText} ${ai.descricao || ''} ${ai.tipo_veiculo || ''}`);
      const tipo: TipoAtivo = /\b(COMPRESSOR|GERADOR|EQUIPAMENTO|PLATAFORMA|BOMBA|TORRE|MOTOCOMPRESSOR)\b/.test(context) || ai.tipo === 'equipamento' || local.tipo === 'equipamento' ? 'equipamento' : 'veiculo';
      const modelo = first(ai.modelo, ai.marca_modelo, local.modelo);
      setForm(current => ({
        ...current,
        tipo,
        descricao: first(ai.descricao, local.descricao, modelo ? `${tipo === 'equipamento' ? 'EQUIPAMENTO' : 'CARRO'} - ${modelo}` : '', current.descricao),
        placa: plate(first(local.placa, ai.placa, current.placa)),
        patrimonio: first(local.patrimonio, ai.patrimonio, current.patrimonio),
        renavam: renavam(first(local.renavam, ai.renavam, current.renavam)),
        chassi: chassis(first(local.chassi, ai.chassi, current.chassi)),
        ano_fabricacao: year(first(local.ano_fabricacao, ai.ano_fabricacao, ai.ano, current.ano_fabricacao)),
        ano_modelo: year(first(local.ano_modelo, ai.ano_modelo, ai.ano, current.ano_modelo)),
        empresa: first(ai.empresa, current.empresa, 'TOPAC MATRIZ'),
        marca: first(ai.marca, current.marca),
        modelo: first(modelo, current.modelo),
        observacao: first(ai.observacao, current.observacao),
      }));
      toast.success('Mensagem interpretada. Confira os campos e salve o cadastro.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível interpretar a mensagem.');
    } finally {
      setParsing(false);
    }
  };

  const findExisting = async () => {
    const placaNormalizada = plate(form.placa);
    if (placaNormalizada) {
      const { data, error } = await supabase.from('ativos').select('id').eq('placa', placaNormalizada).limit(1).maybeSingle();
      if (error) throw error;
      if (data?.id) return data.id as string;
    }
    if (form.patrimonio.trim()) {
      const { data, error } = await supabase.from('ativos').select('id').eq('patrimonio', form.patrimonio.trim()).limit(1).maybeSingle();
      if (error) throw error;
      if (data?.id) return data.id as string;
    }
    return '';
  };

  const save = async () => {
    if (!session?.user?.id) return toast.error('Sessão expirada. Entre novamente.');
    if (!form.descricao.trim() && !plate(form.placa) && !form.patrimonio.trim()) return toast.error('Informe descrição, placa ou patrimônio do ativo.');
    setSaving(true);
    try {
      const payload = {
        user_id: session.user.id,
        tipo: form.tipo,
        descricao: form.descricao.trim() || (form.tipo === 'equipamento' ? 'EQUIPAMENTO' : 'CARRO'),
        placa: plate(form.placa),
        patrimonio: form.patrimonio.trim(),
        renavam: renavam(form.renavam),
        chassi: chassis(form.chassi),
        ano_fabricacao: year(form.ano_fabricacao),
        ano_modelo: year(form.ano_modelo),
        empresa: form.empresa.trim() || 'TOPAC MATRIZ',
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        tipo_veiculo: form.tipo === 'equipamento' ? 'equipamento' : 'carro',
        observacao: form.observacao.trim(),
        status: 'ativo',
        updated_at: new Date().toISOString(),
      };
      const existingId = await findExisting();
      if (existingId) {
        const { error } = await supabase.from('ativos').update(payload as any).eq('id', existingId);
        if (error) throw error;
        toast.success('Ativo existente atualizado sem remover o documento já arquivado.');
      } else {
        const { error } = await supabase.from('ativos').insert(payload as any);
        if (error) throw error;
        toast.success('Ativo cadastrado na Frota.');
      }
      setForm(EMPTY);
      setSmartText('');
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar o ativo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card-premium p-5 space-y-5 border-l-4 border-primary">
      <div>
        <h2 className="text-lg font-bold">Cadastro da Frota</h2>
        <p className="text-xs text-muted-foreground">O formulário tradicional foi mantido junto da Janela Inteligente. A janela apenas preenche os campos; a gravação acontece somente após conferência.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Car className="w-4 h-4 text-primary" /> Preenchimento tradicional</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Tipo</label><select value={form.tipo} onChange={e => setForm(current => ({ ...current, tipo: e.target.value as TipoAtivo }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="veiculo">Veículo</option><option value="equipamento">Máquina / Equipamento</option></select></div>
            <div><label className="text-xs text-muted-foreground">Empresa</label><Input value={form.empresa} onChange={e => setField('empresa', e.target.value)} /></div>
            <div className="md:col-span-2"><label className="text-xs text-muted-foreground">Descrição / Ativo</label><Input value={form.descricao} onChange={e => setField('descricao', e.target.value)} placeholder="Ex.: CARRO - FIAT STRADA ou COMPRESSOR M27" /></div>
            <div><label className="text-xs text-muted-foreground">Placa</label><Input value={form.placa} onChange={e => setField('placa', e.target.value.toUpperCase())} /></div>
            <div><label className="text-xs text-muted-foreground">Patrimônio</label><Input value={form.patrimonio} onChange={e => setField('patrimonio', e.target.value.toUpperCase())} /></div>
            <div><label className="text-xs text-muted-foreground">RENAVAM</label><Input value={form.renavam} onChange={e => setField('renavam', e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Chassi</label><Input value={form.chassi} onChange={e => setField('chassi', e.target.value.toUpperCase())} /></div>
            <div><label className="text-xs text-muted-foreground">Ano fabricação</label><Input value={form.ano_fabricacao} onChange={e => setField('ano_fabricacao', e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Ano modelo</label><Input value={form.ano_modelo} onChange={e => setField('ano_modelo', e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Marca</label><Input value={form.marca} onChange={e => setField('marca', e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Modelo</label><Input value={form.modelo} onChange={e => setField('modelo', e.target.value)} /></div>
            <div className="md:col-span-2"><label className="text-xs text-muted-foreground">Observação</label><Input value={form.observacao} onChange={e => setField('observacao', e.target.value)} /></div>
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Salvando...' : 'Salvar cadastro'}
          </Button>
        </div>

        <div className="space-y-4 rounded-xl border-2 border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-semibold"><Sparkles className="w-4 h-4 text-primary" /> Janela Inteligente</div>
          <p className="text-xs text-muted-foreground">Cole a mensagem recebida com placa, patrimônio, descrição, RENAVAM, chassi ou ano. O sistema interpreta e preenche o formulário ao lado para conferência.</p>
          <textarea value={smartText} onChange={e => setSmartText(e.target.value)} rows={11} placeholder="Ex.: A10.245 - Compressor M27... ou dados de um veículo recebidos por mensagem" className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <Button onClick={() => void processSmartText()} disabled={parsing || !smartText.trim()} variant="outline" className="w-full">
            {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {parsing ? 'Interpretando...' : 'Interpretar e preencher formulário'}
          </Button>
          <div className="rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground flex gap-2"><Wrench className="w-4 h-4 shrink-0" /> A Janela Inteligente não substitui o formulário e não grava silenciosamente. O usuário confere os campos antes de salvar.</div>
        </div>
      </div>
    </section>
  );
}
