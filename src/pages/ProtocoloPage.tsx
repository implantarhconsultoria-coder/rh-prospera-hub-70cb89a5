import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck, LinkIcon, Loader2, Printer, Search, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcao } from '@/lib/acoesLog';
import {
  findVehicleByPlate,
  normalizeVehiclePlate,
  toProtocolVehicleFields,
  vehicleIdentityWarnings,
  type VehicleSyncRecord,
} from '@/lib/vehicleSync';
import { toast } from 'sonner';

interface AtivoDoc extends VehicleSyncRecord {
  patrimonio?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  empresa?: string | null;
  arquivo_url?: string | null;
  documento_url?: string | null;
  observacao?: string | null;
}

type ProtocolTextData = {
  empresa_destinataria?: string;
  local_canteiro?: string;
  responsavel_recebimento?: string;
  placa?: string;
  patrimonio?: string;
  descricao_ativo?: string;
  observacoes?: string;
};

const extractProtocolLocally = (rawText: string): ProtocolTextData => {
  const text = String(rawText || '').replace(/\r/g, '').trim();
  const flat = text.replace(/\s+/g, ' ');
  const pick = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = flat.match(pattern) || text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };
  return {
    placa: normalizeVehiclePlate(pick([/\bplaca\s*[:-]?\s*([A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}|[A-Z]{3}[-\s]?\d{4})\b/i])),
    patrimonio: pick([/\bpatrim[oô]nio\s*(?:n[ºo.]*)?\s*[:-]?\s*([A-Z0-9./-]{2,30})\b/i]),
    empresa_destinataria: pick([/(?:empresa destinat[aá]ria|empresa)\s*[:-]?\s*([^,;|]{2,80})/i]),
    local_canteiro: pick([/(?:local|canteiro|obra)\s*[:-]?\s*([^,;|]{2,80})/i]),
    responsavel_recebimento: pick([/(?:respons[aá]vel(?: pelo recebimento)?|a\/c)\s*[:-]?\s*([^,;|]{2,60})/i]),
    descricao_ativo: pick([/(?:descri[cç][aã]o|equipamento|ativo)\s*[:-]?\s*([^,;|]{2,100})/i]),
    observacoes: text,
  };
};

const ProtocoloPage: React.FC = () => {
  const { companies } = useApp();
  const topac = companies.find((company) => company.id === 'topac-matriz');

  const [empresaDestinataria, setEmpresaDestinataria] = useState('');
  const [localCanteiro, setLocalCanteiro] = useState('');
  const [responsavelRecebimento, setResponsavelRecebimento] = useState('');
  const [placa, setPlaca] = useState('');
  const [renavam, setRenavam] = useState('');
  const [chassi, setChassi] = useState('');
  const [anoFabricacao, setAnoFabricacao] = useState('');
  const [anoModelo, setAnoModelo] = useState('');
  const [patrimonio, setPatrimonio] = useState('');
  const [exercicio, setExercicio] = useState(new Date().getFullYear().toString());
  const [descricaoEquipamento, setDescricaoEquipamento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [textoColado, setTextoColado] = useState('');
  const [parsing, setParsing] = useState(false);
  const [savingProtocol, setSavingProtocol] = useState(false);
  const [lastSavedProtocolId, setLastSavedProtocolId] = useState<string | null>(null);
  const [ativosCache, setAtivosCache] = useState<AtivoDoc[]>([]);
  const [matchedAtivo, setMatchedAtivo] = useState<AtivoDoc | null>(null);
  const [ativoSearch, setAtivoSearch] = useState('');
  const [showManualSelect, setShowManualSelect] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('ativos')
        .select('id,descricao,placa,patrimonio,renavam,chassi,ano_fabricacao,ano_modelo,empresa,arquivo_url,documento_url,observacao')
        .eq('tipo', 'veiculo')
        .order('created_at', { ascending: false });
      if (error) {
        toast.error(`Não foi possível carregar a Frota: ${error.message}`);
        return;
      }
      setAtivosCache((data as AtivoDoc[]) || []);
    };
    void load();
  }, []);

  const applyVehicle = (vehicle: AtivoDoc) => {
    const data = toProtocolVehicleFields(vehicle);
    setMatchedAtivo(vehicle);
    setPlaca(data.placa);
    setPatrimonio(data.patrimonio);
    setRenavam(data.renavam);
    setChassi(data.chassi);
    setAnoFabricacao(data.anoFabricacao);
    setAnoModelo(data.anoModelo);
    if (data.empresa) setEmpresaDestinataria(data.empresa);
    if (data.descricao) setDescricaoEquipamento(data.descricao);
    if (data.observacao && !observacoes.trim()) setObservacoes(data.observacao);
    setPdfUrl(data.pdfUrl);
    const warnings = vehicleIdentityWarnings(vehicle);
    if (warnings.length) toast.warning(`Veículo legado localizado. Atualize a Frota: ${warnings.join(' ')}`);
  };

  useEffect(() => {
    const normalized = normalizeVehiclePlate(placa);
    if (normalized.length !== 7) {
      setMatchedAtivo(null);
      setPdfUrl('');
      return;
    }
    const match = findVehicleByPlate(ativosCache, normalized);
    if (!match) {
      setMatchedAtivo(null);
      setPdfUrl('');
      return;
    }
    if (matchedAtivo?.id !== match.id) {
      applyVehicle(match);
      toast.success(`Veículo sincronizado com a Frota: ${match.descricao || normalized}.`);
    }
  }, [placa, ativosCache, matchedAtivo?.id]);

  const filteredAtivos = useMemo(() => {
    const query = ativoSearch.trim().toLowerCase();
    if (!query) return ativosCache.slice(0, 30);
    return ativosCache.filter((vehicle) => `${vehicle.descricao || ''} ${vehicle.placa || ''} ${vehicle.patrimonio || ''}`.toLowerCase().includes(query)).slice(0, 50);
  }, [ativosCache, ativoSearch]);

  const handleParseText = async () => {
    if (!textoColado.trim()) return toast.error('Cole o texto antes de iniciar a leitura.');
    setParsing(true);
    const local = extractProtocolLocally(textoColado);
    let remote: ProtocolTextData = {};
    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: { type: 'protocolo', text: textoColado },
      });
      if (!error) remote = data?.data || {};
    } catch (error) {
      console.warn('[protocolo] parser remoto indisponível; leitura local mantida.', error);
    }
    const value = (key: keyof ProtocolTextData) => String(remote[key] || local[key] || '').trim();
    if (value('empresa_destinataria')) setEmpresaDestinataria(value('empresa_destinataria'));
    if (value('local_canteiro')) setLocalCanteiro(value('local_canteiro'));
    if (value('responsavel_recebimento')) setResponsavelRecebimento(value('responsavel_recebimento'));
    if (value('placa')) setPlaca(normalizeVehiclePlate(value('placa')));
    if (value('patrimonio')) setPatrimonio(value('patrimonio'));
    if (value('descricao_ativo')) setDescricaoEquipamento(value('descricao_ativo'));
    if (value('observacoes')) setObservacoes(value('observacoes'));
    setParsing(false);
    toast.success('Texto lido. A placa identificada será sincronizada automaticamente com a Frota.');
  };

  const buildProtocolPayload = () => ({
    empresa_origem: topac?.name || 'TOPAC MATRIZ',
    empresa_destinataria: empresaDestinataria,
    local_canteiro: localCanteiro,
    responsavel_recebimento: responsavelRecebimento,
    data_emissao: dataEmissao,
    descricao_ativo: descricaoEquipamento,
    placa: normalizeVehiclePlate(placa),
    renavam,
    chassi,
    ano_fabricacao: anoFabricacao,
    ano_modelo: anoModelo,
    patrimonio,
    exercicio,
    observacoes,
    texto_original: textoColado,
    pdf_url: pdfUrl || null,
    ativo_id: matchedAtivo?.id || null,
  });

  const validateProtocol = () => {
    const normalized = normalizeVehiclePlate(placa);
    if (normalized && normalized.length !== 7) {
      toast.error('Informe uma placa válida.');
      return false;
    }
    if (normalized && !matchedAtivo) {
      toast.error('A placa não está cadastrada na Frota. Cadastre ou corrija o veículo na aba Frota / Documentos.');
      return false;
    }
    if (!normalized && !patrimonio && !descricaoEquipamento) {
      toast.error('Informe placa, patrimônio ou descrição do equipamento.');
      return false;
    }
    return true;
  };

  const saveProtocol = async ({ silent = false } = {}) => {
    if (!validateProtocol()) return null;
    const payload = buildProtocolPayload();
    setSavingProtocol(true);
    try {
      const { data, error } = await supabase.from('protocolos_documentos' as any).insert(payload).select('id').single();
      if (error) throw error;
      const id = String((data as any)?.id || '');
      setLastSavedProtocolId(id);
      await registrarAcao({
        modulo: 'protocolo', entidade: 'protocolos_documentos', entidadeId: id, acao: 'gerou', depois: payload,
        arquivoUrl: pdfUrl || undefined,
        observacao: `Protocolo sincronizado com ${matchedAtivo ? `Frota/${matchedAtivo.id}` : 'equipamento sem placa'}`,
      });
      if (!silent) toast.success('Protocolo salvo e sincronizado com a Frota.');
      return id;
    } catch (error) {
      console.warn('[protocolo] persistência remota indisponível; arquivando localmente.', error);
      const id = `local-${Date.now()}`;
      const current = JSON.parse(localStorage.getItem('topac_protocolos_documentos') || '[]');
      localStorage.setItem('topac_protocolos_documentos', JSON.stringify([{ id, ...payload, created_at: new Date().toISOString() }, ...current].slice(0, 200)));
      setLastSavedProtocolId(id);
      if (!silent) toast.warning('Protocolo arquivado localmente.');
      return id;
    } finally {
      setSavingProtocol(false);
    }
  };

  const buildProtocoloHtml = (via: number) => `<div style="page-break-after:always;padding:15mm;font-family:Arial,sans-serif;font-size:12px;color:#000;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px">
      <div><strong>${topac?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${topac?.cnpj || ''}</span></div>
      <div style="font-size:14px;font-weight:bold;text-align:right">PROTOCOLO DE LIBERAÇÃO DE DOCUMENTO<br/><span style="font-size:10px;color:#666">${via}ª Via de 2</span></div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <strong>Dados da Liberação</strong><br/>Empresa Destinatária: ${empresaDestinataria || '—'}<br/>Local/Canteiro: ${localCanteiro || '—'}<br/>Responsável: ${responsavelRecebimento || '—'}<br/>Data: ${new Date(`${dataEmissao}T12:00:00`).toLocaleDateString('pt-BR')}<br/>Descrição: ${descricaoEquipamento || '—'}
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <strong>Identificação do Ativo — dados sincronizados da Frota</strong><br/>Placa: ${placa || '—'}<br/>RENAVAM: ${renavam || '—'}<br/>Chassi: ${chassi || '—'}<br/>Ano Fabricação/Modelo: ${anoFabricacao || '—'} / ${anoModelo || '—'}<br/>Patrimônio: ${patrimonio || '—'}<br/>Exercício: ${exercicio}
    </div>
    ${observacoes ? `<div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px"><strong>Observações</strong><p style="white-space:pre-wrap">${observacoes}</p></div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:60px"><div style="text-align:center;width:45%"><hr/>Assinatura — Entrega</div><div style="text-align:center;width:45%"><hr/>Assinatura — Recebimento</div></div>
  </div>`;

  const handlePrint = async () => {
    if (!validateProtocol()) return;
    await saveProtocol({ silent: true });
    let content = buildProtocoloHtml(1) + buildProtocoloHtml(2);
    if (pdfUrl) {
      try {
        const { pageUrls } = await renderPdfPagesToDataUrls(pdfUrl, 1.6);
        content += pageUrls.map((url, index) => `<div style="${index === 0 ? 'page-break-before:always;' : ''}"><img src="${url}" style="display:block;width:100%;height:auto"/></div>`).join('');
      } catch {
        toast.warning('O protocolo será impresso, mas o PDF vinculado da Frota não pôde ser incorporado.');
      }
    }
    printDocumentInPage(`<!DOCTYPE html><html><head><title>Protocolo</title><style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${content}</body></html>`);
  };

  const clear = () => {
    setEmpresaDestinataria(''); setLocalCanteiro(''); setResponsavelRecebimento(''); setPlaca('');
    setRenavam(''); setChassi(''); setAnoFabricacao(''); setAnoModelo(''); setPatrimonio('');
    setDescricaoEquipamento(''); setObservacoes(''); setTextoColado(''); setMatchedAtivo(null); setPdfUrl('');
    setLastSavedProtocolId(null); setDataEmissao(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium gradient-primary p-6 text-primary-foreground">
        <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/20"><FileCheck className="h-7 w-7" /></div><div><h1 className="text-2xl font-bold font-display">Protocolo / Liberação de Documento</h1><p className="text-sm text-primary-foreground/70">Dados do veículo sincronizados exclusivamente pela Frota</p></div></div>
      </div>

      <div className="card-premium space-y-4 p-5">
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Leitura Inteligente de Texto</h2><Button variant="ghost" size="sm" onClick={clear}>Limpar campos</Button></div>
        <textarea value={textoColado} onChange={(event) => setTextoColado(event.target.value)} placeholder="Cole a mensagem com empresa, local, responsável e placa. Ao identificar a placa, o sistema localizará o cadastro da Frota." className="min-h-32 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm" />
        <Button variant="outline" onClick={() => void handleParseText()} disabled={parsing}>{parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{parsing ? 'Lendo texto...' : 'Ler texto e preencher'}</Button>
      </div>

      <div className="card-premium space-y-4 p-5">
        <h2 className="text-sm font-bold">Dados da Liberação</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Empresa Destinatária" value={empresaDestinataria} onChange={setEmpresaDestinataria} />
          <Field label="Local / Canteiro" value={localCanteiro} onChange={setLocalCanteiro} />
          <Field label="Responsável pelo Recebimento" value={responsavelRecebimento} onChange={setResponsavelRecebimento} />
          <Field label="Data de Emissão" value={dataEmissao} type="date" onChange={setDataEmissao} />
          <div className="lg:col-span-2"><Field label="Descrição do Ativo / Equipamento" value={descricaoEquipamento} onChange={setDescricaoEquipamento} /></div>
        </div>
      </div>

      <div className="card-premium space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Identificação do Ativo</h2>{matchedAtivo && <span className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs text-success"><LinkIcon className="h-3 w-3" /> Sincronizado com Frota: {matchedAtivo.descricao || matchedAtivo.placa}</span>}</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Placa" value={placa} onChange={(value) => setPlaca(normalizeVehiclePlate(value))} />
          <ReadOnlyField label="RENAVAM" value={renavam} />
          <ReadOnlyField label="Chassi" value={chassi} />
          <ReadOnlyField label="Ano Fabricação" value={anoFabricacao} />
          <ReadOnlyField label="Ano Modelo" value={anoModelo} />
          <ReadOnlyField label="Patrimônio da Frota" value={patrimonio} />
          <Field label="Exercício" value={exercicio} onChange={setExercicio} />
        </div>
        {!matchedAtivo && normalizeVehiclePlate(placa).length === 7 && <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><span className="font-medium text-warning">Placa não localizada na Frota.</span><Button variant="link" size="sm" onClick={() => setShowManualSelect(true)}>Conferir cadastros</Button></div>}
        {showManualSelect && <div className="space-y-2 rounded-lg bg-muted/30 p-4"><div className="flex items-center gap-2"><Search className="h-4 w-4" /><Input value={ativoSearch} onChange={(event) => setAtivoSearch(event.target.value)} placeholder="Buscar por placa, patrimônio ou descrição" /><Button variant="ghost" onClick={() => setShowManualSelect(false)}>Fechar</Button></div><div className="max-h-48 overflow-y-auto rounded-lg border">{filteredAtivos.map((vehicle) => <button key={vehicle.id} type="button" onClick={() => { applyVehicle(vehicle); setShowManualSelect(false); }} className="flex w-full justify-between border-b px-3 py-2 text-left text-sm hover:bg-muted/50"><span>{vehicle.descricao || 'Veículo'}</span><span className="text-muted-foreground">{vehicle.placa || vehicle.patrimonio || '—'}</span></button>)}</div></div>}
      </div>

      <div className="card-premium space-y-4 p-5">
        <div><label className="mb-1 block text-xs text-muted-foreground">Observações</label><textarea value={observacoes} onChange={(event) => setObservacoes(event.target.value)} className="min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm" /></div>
        <div className="rounded-lg border p-3">
          <p className="text-xs font-semibold">Documento da Frota</p>
          {pdfUrl ? <div className="mt-2 space-y-2"><p className="flex items-center gap-2 text-xs text-success"><LinkIcon className="h-3 w-3" /> PDF vinculado automaticamente. O Protocolo não realiza upload próprio.</p><PdfDocumentViewer source={{ url: pdfUrl, tipo: 'protocolo' }} title="Documento cadastrado na Frota" /></div> : <p className="mt-1 text-xs text-muted-foreground">Nenhum PDF está vinculado ao cadastro correspondente na Frota.</p>}
        </div>
        <div className="flex flex-wrap gap-3"><Button variant="outline" size="lg" onClick={() => void saveProtocol()} disabled={savingProtocol}>{savingProtocol ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}{savingProtocol ? 'Salvando...' : 'Salvar no sistema'}</Button><Button size="lg" onClick={() => void handlePrint()} className="gradient-accent text-accent-foreground"><Printer className="mr-2 h-4 w-4" /> Gerar e imprimir - {pdfUrl ? '2 vias + documento da Frota' : '2 vias'}</Button>{lastSavedProtocolId && <span className="self-center text-xs text-success">Arquivado: {lastSavedProtocolId}</span>}</div>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) => <div><label className="mb-1 block text-xs text-muted-foreground">{label}</label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
const ReadOnlyField = ({ label, value }: { label: string; value: string }) => <div><label className="mb-1 block text-xs text-muted-foreground">{label}</label><Input value={value} readOnly className="bg-muted/40" /></div>;

export default ProtocoloPage;
