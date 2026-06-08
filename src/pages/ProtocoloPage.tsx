import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { extractPdfText, extractPdfTextByLines, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { FileCheck, Printer, Sparkles, Upload, Loader2, Search, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { printDocumentInPage } from '@/lib/printInPage';
import { supabase } from '@/integrations/supabase/client';
import { registrarAcao } from '@/lib/acoesLog';

interface AtivoDoc {
  id: string;
  descricao: string;
  placa: string;
  patrimonio: string;
  renavam: string;
  chassi: string;
  ano_fabricacao: string;
  ano_modelo: string;
  empresa: string;
  arquivo_url: string;
  observacao?: string;
}

interface VehicleDocumentExtraction {
  placa?: string;
  renavam?: string;
  chassi?: string;
  ano_fabricacao?: string;
  ano_modelo?: string;
  exercicio?: string;
  proprietario_empresa?: string;
  municipio_uf?: string;
  especie_tipo?: string;
  marca_modelo?: string;
  descricao?: string;
  empresa?: string;
  patrimonio?: string;
  observacao?: string;
  sourceText?: string;
}

const normalizePlainText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const formatPlacaValue = (value: string) => {
  const clean = normalizePlainText(value).replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/);
  return match?.[0] || '';
};

const formatRenavamValue = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  const match = digits.match(/\d{9,11}/);
  return match?.[0] || '';
};

const formatChassiValue = (value: string) => {
  const clean = normalizePlainText(value).replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/[A-HJ-NPR-Z0-9]{17}/);
  return match?.[0] || '';
};

const findInLabelWindow = (lines: string[], label: RegExp, value: RegExp, fallbackText = '') => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizePlainText(lines[index]);
    if (!label.test(line)) continue;
    const windowText = normalizePlainText(lines.slice(index, index + 5).join(' '));
    const match = windowText.match(value);
    if (match?.[1] || match?.[0]) return match[1] || match[0];
  }

  const fallback = normalizePlainText(fallbackText).match(value);
  return fallback?.[1] || fallback?.[0] || '';
};

const cleanVehicleText = (value: string) =>
  normalizePlainText(value)
    .replace(/\b(MARCA|MODELO|VERSAO|VEICULO|CODIGO|RENAVAM|CHASSI|PLACA|ANO|FABRICACAO|FAB|MOD|EXERCICIO)\b/g, ' ')
    .replace(/[|:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

const findFreeTextAfterLabel = (lines: string[], label: RegExp, blocked: RegExp) => {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizePlainText(lines[index]);
    if (!label.test(normalized)) continue;

    const sameLine = cleanVehicleText(lines[index]);
    if (sameLine && !label.test(sameLine) && !blocked.test(sameLine)) return sameLine;

    for (let next = index + 1; next <= index + 4 && next < lines.length; next += 1) {
      const candidate = cleanVehicleText(lines[next]);
      if (candidate && !blocked.test(candidate)) return candidate;
    }
  }
  return '';
};

const parseVehicleDocumentText = (text: string, fileName: string): VehicleDocumentExtraction => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const all = `${fileName}\n${text}`;
  const normalizedAll = normalizePlainText(all);
  const anoPair = normalizedAll.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const municipio = findFreeTextAfterLabel(lines, /\b(MUNICIPIO|LOCALIDADE|CIDADE)\b/, /\b(PLACA|CHASSI|RENAVAM|CPF|CNPJ|EXERCICIO|PROPRIETARIO|MARCA|MODELO|ANO)\b/);
  const uf =
    findInLabelWindow(lines, /\bUF\b/, /\b([A-Z]{2})\b/) ||
    (municipio.match(/\b([A-Z]{2})$/)?.[1] || '');
  const marcaModelo = findFreeTextAfterLabel(lines, /\b(MARCA\s*\/?\s*MODELO|MARCA MODELO|MODELO\s*\/?\s*VERSAO|MARCA)\b/, /\b(PLACA|CHASSI|RENAVAM|CPF|CNPJ|EXERCICIO|PROPRIETARIO|ANO)\b/);
  const especieTipo = findFreeTextAfterLabel(lines, /\b(ESPECIE\s*\/?\s*TIPO|ESPECIE|TIPO)\b/, /\b(PLACA|CHASSI|RENAVAM|CPF|CNPJ|EXERCICIO|MARCA|MODELO|ANO)\b/);
  const proprietario = findFreeTextAfterLabel(lines, /\b(PROPRIETARIO|NOME|RAZAO SOCIAL|RAZAO)\b/, /\b(PLACA|CHASSI|RENAVAM|CPF|CNPJ|EXERCICIO|MARCA|MODELO|ANO|MUNICIPIO)\b/);

  return {
    placa: formatPlacaValue(findInLabelWindow(lines, /\bPLACA\b/, /([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})/, all) || fileName),
    renavam: formatRenavamValue(findInLabelWindow(lines, /\bRENAVAM\b/, /(\d{9,11})/, all)),
    chassi: formatChassiValue(findInLabelWindow(lines, /\b(CHASSI|VIN)\b/, /([A-HJ-NPR-Z0-9]{17})/, all)),
    ano_fabricacao: findInLabelWindow(lines, /\b(FABRICACAO|ANO FAB|FAB\/MOD)\b/, /((?:19|20)\d{2})/, all) || anoPair?.[1] || '',
    ano_modelo: findInLabelWindow(lines, /\b(MODELO|ANO MOD|FAB\/MOD)\b/, /(?:19|20)\d{2}\s*\/\s*((?:19|20)\d{2})/, all) || anoPair?.[2] || '',
    exercicio: findInLabelWindow(lines, /\bEXERCICIO\b/, /((?:19|20)\d{2})/, all),
    proprietario_empresa: proprietario,
    municipio_uf: [municipio, uf].filter(Boolean).join('/'),
    especie_tipo: especieTipo,
    marca_modelo: marcaModelo,
    descricao: [especieTipo, marcaModelo].filter(Boolean).join(' - '),
    sourceText: normalizedAll,
  };
};

const normalizeVehicleDocumentExtraction = (aiData: any, localData: VehicleDocumentExtraction, fileName: string): VehicleDocumentExtraction => {
  const marcaModelo = cleanVehicleText(aiData?.marca_modelo || aiData?.modelo || localData.marca_modelo || '');
  const especieTipo = cleanVehicleText(aiData?.especie_tipo || aiData?.tipo || localData.especie_tipo || '');
  const descricao = [especieTipo, marcaModelo].filter(Boolean).join(' - ') || cleanVehicleText(aiData?.descricao || localData.descricao || fileName.replace(/\.[^/.]+$/, ''));

  return {
    placa: formatPlacaValue(localData.placa || aiData?.placa || fileName),
    renavam: formatRenavamValue(localData.renavam || aiData?.renavam || ''),
    chassi: formatChassiValue(localData.chassi || aiData?.chassi || ''),
    ano_fabricacao: String(localData.ano_fabricacao || aiData?.ano_fabricacao || '').replace(/\D/g, '').slice(0, 4),
    ano_modelo: String(localData.ano_modelo || aiData?.ano_modelo || '').replace(/\D/g, '').slice(0, 4),
    exercicio: String(localData.exercicio || aiData?.exercicio || '').replace(/\D/g, '').slice(0, 4),
    proprietario_empresa: String(localData.proprietario_empresa || aiData?.proprietario_empresa || aiData?.proprietario || aiData?.empresa || '').trim(),
    municipio_uf: String(localData.municipio_uf || aiData?.municipio_uf || aiData?.municipio || '').trim(),
    especie_tipo: especieTipo,
    marca_modelo: marcaModelo,
    descricao,
    empresa: String(aiData?.empresa || localData.proprietario_empresa || '').trim(),
    patrimonio: String(aiData?.patrimonio || localData.patrimonio || '').trim(),
    observacao: String(aiData?.observacao || localData.observacao || '').trim(),
    sourceText: localData.sourceText,
  };
};

const buildExtractionSummary = (data: VehicleDocumentExtraction) =>
  [
    data.placa && `placa ${data.placa}`,
    data.renavam && `RENAVAM ${data.renavam}`,
    data.chassi && `chassi ${data.chassi}`,
    data.ano_fabricacao && `ano fab. ${data.ano_fabricacao}`,
    data.ano_modelo && `ano modelo ${data.ano_modelo}`,
    data.exercicio && `exercicio ${data.exercicio}`,
  ].filter(Boolean).join(', ');

const ProtocoloPage: React.FC = () => {
  const { companies } = useApp();
  const topac = companies.find(c => c.id === 'topac-matriz');

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
  const [proprietarioEmpresa, setProprietarioEmpresa] = useState('');
  const [municipioUf, setMunicipioUf] = useState('');
  const [especieTipo, setEspecieTipo] = useState('');
  const [marcaModelo, setMarcaModelo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [textoColado, setTextoColado] = useState('');
  const [parsing, setParsing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [documentReadAttempted, setDocumentReadAttempted] = useState(false);
  const [lastExtractedDocData, setLastExtractedDocData] = useState<VehicleDocumentExtraction | null>(null);
  const [savingProtocol, setSavingProtocol] = useState(false);
  const [lastSavedProtocolId, setLastSavedProtocolId] = useState<string | null>(null);

  // Auto-lookup state
  const [ativosCache, setAtivosCache] = useState<AtivoDoc[]>([]);
  const [matchedAtivo, setMatchedAtivo] = useState<AtivoDoc | null>(null);
  const [showManualSelect, setShowManualSelect] = useState(false);
  const [ativoSearch, setAtivoSearch] = useState('');
  const hydratingIdsRef = useRef(new Set<string>());
  const lastMatchedIdRef = useRef<string | null>(null);

  // Load all vehicle docs for matching
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('ativos').select('*').eq('tipo', 'veiculo').order('created_at', { ascending: false });
      if (data) setAtivosCache(data as unknown as AtivoDoc[]);
    };
    load();
  }, []);

  const sanitize = (value: string) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hasValue = (value?: string | null) => Boolean(value?.trim());
  const firstFilled = (...values: Array<unknown>) =>
    values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  const normalizeDateInput = (value: string) => {
    const match = (value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  };
  const extractLocalProtocolData = (rawText: string) => {
    const text = (rawText || '').replace(/\r/g, '').trim();
    const flat = text.replace(/\s+/g, ' ');
    const normalizedFlat = normalizePlainText(flat);
    const pick = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
        const match = flat.match(pattern) || text.match(pattern);
        if (match?.[1]) return match[1].replace(/\s+(por favor|favor)$/i, '').trim();
      }
      return '';
    };
    const pickNormalized = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
        const match = normalizedFlat.match(pattern);
        if (match?.[1]) return match[1].trim();
      }
      return '';
    };
    const placaValue = formatPlacaValue(pick([/\bplaca\s*[:\-]?\s*([A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}|[A-Z]{3}[-\s]?\d{4})\b/i]) || pickNormalized([/\bPLACA\s*[:\-]?\s*([A-Z]{3}\s*-?\s*[0-9][A-Z0-9]\s*-?\s*[0-9]{2})\b/]));
    const patrimonioValue = pick([
      /\bpatrim[oô]nio\s*(?:n[ºo.]*)?\s*[:\-]?\s*([A-Z0-9./-]{2,30})\b/i,
      /(?:^|\n|\s)([A-Z]{1,4}\d{1,4}(?:[./-]\d{1,6})?)\s*(?:[-–—]\s*)?(?:placa|ve[ií]culo|compressor)\b/i,
    ]) || pickNormalized([
      /\bPATRIMONIO\s*(?:N[Oº.]*)?\s*[:\-]?\s*([A-Z0-9./-]{2,30})\b/,
      /\b(?:COMPRESSOR|VEICULO|EQUIPAMENTO|MAQUINA)\s+(?:DE\s+)?PATRIMONIO\s*([A-Z0-9./-]{2,30})\b/,
    ]);
    const destinoMatch = flat.match(/encaminhad[ao]s?\s+(?:a|à)\s+empresa\s+(.+?)(?:\s+aos cuidados de\s+|\s+a\/c\s+|[.,;\n]|$)/i);
    let empresaDestino = '';
    let localDestino = '';
    if (destinoMatch?.[1]) {
      const destino = destinoMatch[1].trim();
      const canteiroIdx = destino.toLowerCase().indexOf(' canteiro ');
      if (canteiroIdx >= 0) {
        empresaDestino = destino.slice(0, canteiroIdx).trim();
        localDestino = destino.slice(canteiroIdx + 1).trim();
      } else {
        empresaDestino = destino;
      }
    }
    const descricaoMatch = flat.match(/\b(compressor|ve[ií]culo|caminh[aã]o|carro|equipamento|m[aá]quina|munck|guindaste)\b[^.,;\n]*/i);
    return {
      empresa_destinataria: empresaDestino || pick([
        /(?:encaminhad[ao]s?\s+(?:a|à)\s+empresa|empresa destinat[aá]ria|empresa)\s*[:\-]?\s*([A-ZÁ-Ú0-9][A-ZÁ-Úa-zá-ú0-9 &./-]{2,80}?)(?=\s+(?:aos cuidados|referente|para|no|na|$)|[.,;\n])/i,
      ]),
      local_canteiro: localDestino || pick([
        /(?:local|canteiro|obra)\s*[:\-]?\s*([A-ZÁ-Ú0-9][A-ZÁ-Úa-zá-ú0-9 &./-]{2,80}?)(?=\s+(?:aos cuidados|respons[aá]vel|referente|$)|[.,;\n])/i,
        /\b(canteiro\s+(?:de|da|do)\s+[A-ZÁ-Úa-zá-ú0-9 &./-]{2,80}?)(?=\s+aos cuidados|[.,;\n]|$)/i,
      ]),
      responsavel_recebimento: pick([
        /(?:aos cuidados (?:de|do|da)|a\/c|respons[aá]vel(?: pelo recebimento)?|recebimento)\s*[:\-]?\s*([A-ZÁ-Ú][A-ZÁ-Úa-zá-ú ]{2,60}?)(?=[.,;\n]|$)/i,
      ]),
      placa: placaValue,
      patrimonio: patrimonioValue,
      renavam: pick([/\brenavam\s*[:\-]?\s*(\d{6,20})\b/i]),
      chassi: pick([/\bchassi\s*[:\-]?\s*([A-Z0-9]{8,30})\b/i]),
      ano_fabricacao: pick([/\bano fabrica[cç][aã]o\s*[:\-]?\s*(\d{4})\b/i, /\bfabrica[cç][aã]o\s*[:\-]?\s*(\d{4})\b/i]),
      ano_modelo: pick([/\bano modelo\s*[:\-]?\s*(\d{4})\b/i, /\bmodelo\s*[:\-]?\s*(\d{4})\b/i]),
      descricao_ativo: descricaoMatch ? descricaoMatch[0].trim() : '',
      observacoes: text,
    };
  };
  const mergeParsedData = (aiData: any, localData: any) => {
    const d = aiData || {};
    return {
      empresa_destinataria: firstFilled(localData.empresa_destinataria, d.empresa_destinataria, d.empresa),
      local_canteiro: firstFilled(localData.local_canteiro, d.local_canteiro, d.local, d.canteiro),
      responsavel_recebimento: firstFilled(localData.responsavel_recebimento, d.responsavel_recebimento, d.responsavel, d.recebedor),
      placa: firstFilled(d.placa, localData.placa),
      patrimonio: firstFilled(d.patrimonio, localData.patrimonio),
      renavam: firstFilled(d.renavam, localData.renavam),
      chassi: firstFilled(d.chassi, localData.chassi),
      ano_fabricacao: firstFilled(d.ano_fabricacao, localData.ano_fabricacao),
      ano_modelo: firstFilled(d.ano_modelo, localData.ano_modelo),
      empresa: firstFilled(d.empresa),
      descricao_ativo: firstFilled(localData.descricao_ativo, d.descricao_ativo, d.descricao),
      observacoes: firstFilled(d.observacoes, d.observacao, localData.observacoes),
    };
  };

  const analyzeVehiclePdf = async (source: string | File | Uint8Array, fileLabel: string) => {
    const bytes = source instanceof File
      ? new Uint8Array(await source.arrayBuffer())
      : source;
    const extractedText = await extractPdfTextByLines(bytes)
      .catch(() => extractPdfText(bytes))
      .catch(() => '');
    const localData = parseVehicleDocumentText(extractedText, fileLabel);
    const { pageUrls } = await renderPdfPagesToDataUrls(bytes, 1.15, 2);
    let aiData: any = {};

    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: {
          text: `Arquivo: ${fileLabel}\n\n${extractedText}`.trim(),
          images: pageUrls,
          type: 'documento_veiculo',
        },
      });

      if (!error) aiData = data?.data ?? {};
    } catch (error) {
      console.warn('[protocolo] parse-text indisponivel para documento de veiculo; usando leitura local.', error);
    }

    return normalizeVehicleDocumentExtraction(aiData, localData, fileLabel);
  };

  const applyExtractedDocumentData = (data: VehicleDocumentExtraction, { force = false } = {}) => {
    const fill = (current: string, setter: (value: string) => void, value?: string) => {
      if (!value?.trim()) return;
      if (force || !hasValue(current)) setter(value.trim());
    };

    fill(placa, setPlaca, data.placa);
    fill(renavam, setRenavam, data.renavam);
    fill(chassi, setChassi, data.chassi);
    fill(anoFabricacao, setAnoFabricacao, data.ano_fabricacao);
    fill(anoModelo, setAnoModelo, data.ano_modelo);
    if (data.exercicio?.trim()) setExercicio(data.exercicio.trim());
    fill(patrimonio, setPatrimonio, data.patrimonio);
    fill(descricaoEquipamento, setDescricaoEquipamento, data.descricao);
    fill(proprietarioEmpresa, setProprietarioEmpresa, data.proprietario_empresa || data.empresa);
    fill(municipioUf, setMunicipioUf, data.municipio_uf);
    fill(especieTipo, setEspecieTipo, data.especie_tipo);
    fill(marcaModelo, setMarcaModelo, data.marca_modelo);
  };

  const readAndApplyVehicleDocument = async ({
    source,
    sourceUrl,
    fileLabel,
    force = false,
    silent = false,
  }: {
    source?: File | Uint8Array;
    sourceUrl?: string;
    fileLabel?: string;
    force?: boolean;
    silent?: boolean;
  } = {}) => {
    const targetSource = source || sourceUrl || pdfFile || pdfUrl;
    const label = fileLabel || pdfFile?.name || matchedAtivo?.descricao || matchedAtivo?.placa || 'Documento do veiculo';

    if (!targetSource) {
      if (!silent) toast.error('Anexe ou selecione um PDF do documento primeiro.');
      return null;
    }

    setLoadingPdf(true);
    setDocumentReadAttempted(true);

    try {
      const extracted = await analyzeVehiclePdf(targetSource, label);
      setLastExtractedDocData(extracted);
      applyExtractedDocumentData(extracted, { force });

      const summary = buildExtractionSummary(extracted);
      if (!silent) {
        if (summary) toast.success(`Dados lidos do documento: ${summary}.`);
        else toast.warning('PDF lido, mas nao encontrei placa, RENAVAM ou chassi. Revise o documento.');
      }

      return extracted;
    } catch (error) {
      console.error('[protocolo] erro ao ler dados do documento', error);
      if (!silent) toast.error('Nao foi possivel ler os dados do PDF anexado.');
      return null;
    } finally {
      setLoadingPdf(false);
    }
  };

  const ensureDocumentReadBeforeProtocol = async () => {
    if (!pdfUrl && !pdfFile) return true;

    let extracted = lastExtractedDocData;
    if (!documentReadAttempted || !extracted) {
      extracted = await readAndApplyVehicleDocument({ silent: true });
    }

    if (!extracted && (!renavam || !chassi)) {
      toast.error('Leia os dados do documento antes de salvar/imprimir. RENAVAM e chassi precisam ser conferidos quando existem no PDF.');
      return false;
    }

    const renavamFound = hasValue(extracted?.renavam);
    const chassiFound = hasValue(extracted?.chassi);
    if ((renavamFound && !hasValue(renavam)) || (chassiFound && !hasValue(chassi))) {
      applyExtractedDocumentData(extracted, { force: false });
      toast.error('O PDF contem RENAVAM/CHASSI. Os campos foram preenchidos; confira antes de gerar o protocolo.');
      return false;
    }

    return true;
  };

  const buildComplementaryDocumentText = () => {
    const lines = [
      proprietarioEmpresa && `Proprietario / Empresa: ${proprietarioEmpresa}`,
      municipioUf && `Municipio/UF: ${municipioUf}`,
      especieTipo && `Especie/Tipo: ${especieTipo}`,
      marcaModelo && `Marca/Modelo: ${marcaModelo}`,
    ].filter(Boolean);

    return lines.length ? `Dados extraidos do documento:\n${lines.join('\n')}` : '';
  };

  const updateAtivoFromExtractedData = async (ativo: AtivoDoc, extracted: VehicleDocumentExtraction) => {
    const updates: Record<string, string> = {};
    const candidates: Record<string, string | undefined> = {
      placa: extracted.placa,
      renavam: extracted.renavam,
      chassi: extracted.chassi,
      ano_fabricacao: extracted.ano_fabricacao,
      ano_modelo: extracted.ano_modelo,
      patrimonio: extracted.patrimonio,
      descricao: extracted.descricao,
      empresa: extracted.empresa || extracted.proprietario_empresa,
    };

    Object.entries(candidates).forEach(([field, nextValue]) => {
      const currentValue = (ativo as any)[field];
      if (!hasValue(currentValue) && hasValue(nextValue)) updates[field] = String(nextValue).trim();
    });

    if (!Object.keys(updates).length) return ativo;

    const hydratedAtivo = { ...ativo, ...updates } as AtivoDoc;
    const { error } = await supabase.from('ativos').update(updates as any).eq('id', ativo.id);
    if (error) throw error;

    setAtivosCache((current) => current.map((item) => (item.id === ativo.id ? hydratedAtivo : item)));
    setMatchedAtivo(hydratedAtivo);
    return hydratedAtivo;
  };

  const findAtivoFromExtraction = (extracted: VehicleDocumentExtraction) => {
    const normalizedPlaca = sanitize(extracted.placa || '');
    const normalizedPatrimonio = sanitize(extracted.patrimonio || patrimonio || '');
    const normalizedRenavam = String(extracted.renavam || '').trim();
    const normalizedChassi = String(extracted.chassi || '').trim().toLowerCase();

    return ativosCache.find((ativo) => {
      if (normalizedPlaca && hasValue(ativo.placa) && sanitize(ativo.placa) === normalizedPlaca) return true;
      if (normalizedPatrimonio && hasValue(ativo.patrimonio) && sanitize(ativo.patrimonio) === normalizedPatrimonio) return true;
      if (normalizedRenavam && hasValue(ativo.renavam) && ativo.renavam === normalizedRenavam) return true;
      if (normalizedChassi && hasValue(ativo.chassi) && ativo.chassi.toLowerCase() === normalizedChassi) return true;
      return false;
    }) || null;
  };

  const buildAtivoObservationFromExtraction = (extracted: VehicleDocumentExtraction, base = '') => {
    const lines = [
      base,
      extracted.exercicio && `Exercicio: ${extracted.exercicio}`,
      extracted.proprietario_empresa && `Proprietario / Empresa: ${extracted.proprietario_empresa}`,
      extracted.municipio_uf && `Municipio/UF: ${extracted.municipio_uf}`,
      extracted.especie_tipo && `Especie/Tipo: ${extracted.especie_tipo}`,
      extracted.marca_modelo && `Marca/Modelo: ${extracted.marca_modelo}`,
    ].filter(Boolean);
    return lines.join('\n');
  };

  const linkUploadedPdfToAtivo = async (extracted: VehicleDocumentExtraction, arquivoUrl: string, fileName: string) => {
    const existing = matchedAtivo || findAtivoFromExtraction(extracted);

    if (existing) {
      const updates: Record<string, string> = {};
      if (!hasValue(existing.arquivo_url)) updates.arquivo_url = arquivoUrl;
      if (!hasValue(existing.placa) && hasValue(extracted.placa)) updates.placa = extracted.placa!;
      if (!hasValue(existing.patrimonio) && hasValue(extracted.patrimonio || patrimonio)) updates.patrimonio = (extracted.patrimonio || patrimonio).trim();
      if (!hasValue(existing.renavam) && hasValue(extracted.renavam)) updates.renavam = extracted.renavam!;
      if (!hasValue(existing.chassi) && hasValue(extracted.chassi)) updates.chassi = extracted.chassi!;
      if (!hasValue(existing.ano_fabricacao) && hasValue(extracted.ano_fabricacao)) updates.ano_fabricacao = extracted.ano_fabricacao!;
      if (!hasValue(existing.ano_modelo) && hasValue(extracted.ano_modelo)) updates.ano_modelo = extracted.ano_modelo!;
      if (!hasValue(existing.descricao) && hasValue(extracted.descricao || descricaoEquipamento)) updates.descricao = (extracted.descricao || descricaoEquipamento).trim();
      if (!hasValue(existing.empresa) && hasValue(extracted.empresa || extracted.proprietario_empresa)) updates.empresa = (extracted.empresa || extracted.proprietario_empresa || '').trim();
      const observation = buildAtivoObservationFromExtraction(extracted, existing.observacao || '');
      if (observation && observation !== existing.observacao) updates.observacao = observation;

      if (Object.keys(updates).length) {
        const { error } = await supabase.from('ativos').update(updates as any).eq('id', existing.id);
        if (error) throw error;
        const hydrated = { ...existing, ...updates } as AtivoDoc;
        setAtivosCache((current) => current.map((item) => item.id === existing.id ? hydrated : item));
        setMatchedAtivo(hydrated);
        return hydrated;
      }

      setMatchedAtivo(existing);
      return existing;
    }

    const payload = {
      tipo: 'veiculo',
      descricao: extracted.descricao || descricaoEquipamento || fileName.replace(/\.[^/.]+$/, ''),
      placa: extracted.placa || placa || '',
      patrimonio: extracted.patrimonio || patrimonio || '',
      empresa: extracted.empresa || extracted.proprietario_empresa || empresaDestinataria || 'TOPAC MATRIZ',
      observacao: buildAtivoObservationFromExtraction(extracted, 'Documento vinculado automaticamente pelo Protocolo.'),
      arquivo_url: arquivoUrl,
      renavam: extracted.renavam || '',
      chassi: extracted.chassi || '',
      ano_fabricacao: extracted.ano_fabricacao || '',
      ano_modelo: extracted.ano_modelo || '',
      status: 'ativo',
    };
    const { data, error } = await supabase.from('ativos').insert(payload as any).select('*').single();
    if (error) throw error;
    const created = data as unknown as AtivoDoc;
    setAtivosCache((current) => [created, ...current]);
    setMatchedAtivo(created);
    return created;
  };

  const applyMatchedAtivo = (ativo: AtivoDoc) => {
    if (hasValue(ativo.placa)) setPlaca(ativo.placa);
    if (hasValue(ativo.patrimonio)) setPatrimonio(ativo.patrimonio);
    if (hasValue(ativo.renavam)) setRenavam(ativo.renavam);
    if (hasValue(ativo.chassi)) setChassi(ativo.chassi);
    if (hasValue(ativo.ano_fabricacao)) setAnoFabricacao(ativo.ano_fabricacao);
    if (hasValue(ativo.ano_modelo)) setAnoModelo(ativo.ano_modelo);
    if (hasValue(ativo.empresa)) setEmpresaDestinataria(ativo.empresa);
    if (hasValue(ativo.descricao)) setDescricaoEquipamento(ativo.descricao);
    if (hasValue(ativo.observacao) && !hasValue(observacoes)) setObservacoes(ativo.observacao || '');
    if (hasValue(ativo.arquivo_url)) {
      const nextPdfUrl = ativo.arquivo_url;
      if (nextPdfUrl !== pdfUrl) {
        setPdfUrl(nextPdfUrl);
        setPdfFile(null);
        setDocumentReadAttempted(false);
        setLastExtractedDocData(null);
      }
    }
  };

  const hydrateMatchedAtivo = async (ativo: AtivoDoc) => {
    if (!ativo.arquivo_url || hydratingIdsRef.current.has(ativo.id)) return;

    const missingFields = {
      patrimonio: !hasValue(ativo.patrimonio),
      renavam: !hasValue(ativo.renavam),
      chassi: !hasValue(ativo.chassi),
      ano_fabricacao: !hasValue(ativo.ano_fabricacao),
      ano_modelo: !hasValue(ativo.ano_modelo),
      empresa: !hasValue(ativo.empresa),
      descricao: !hasValue(ativo.descricao),
      observacao: !hasValue(ativo.observacao),
    };

    if (!Object.values(missingFields).some(Boolean)) return;

    hydratingIdsRef.current.add(ativo.id);
    setLoadingPdf(true);

    try {
      const extracted = await analyzeVehiclePdf(ativo.arquivo_url, ativo.descricao || ativo.placa || 'Documento do veículo');
      setDocumentReadAttempted(true);
      setLastExtractedDocData(extracted);
      applyExtractedDocumentData(extracted);
      const updates: Record<string, string> = {};

      Object.entries(missingFields).forEach(([field, shouldFill]) => {
        const nextValue = extracted?.[field];
        if (shouldFill && typeof nextValue === 'string' && nextValue.trim()) {
          updates[field] = nextValue.trim();
        }
      });

      if (Object.keys(updates).length === 0) return;

      const hydratedAtivo = { ...ativo, ...updates } as AtivoDoc;
      const { error } = await supabase.from('ativos').update(updates as any).eq('id', ativo.id);
      if (error) throw error;

      setAtivosCache((current) => current.map((item) => (item.id === ativo.id ? hydratedAtivo : item)));
      setMatchedAtivo(hydratedAtivo);
      applyMatchedAtivo(hydratedAtivo);
      toast.success('Dados do veículo atualizados a partir do PDF salvo no sistema.');
    } catch {
      toast.error('Não foi possível complementar os dados do veículo pelo PDF.');
    } finally {
      hydratingIdsRef.current.delete(ativo.id);
      setLoadingPdf(false);
    }
  };

  // Auto-match when key fields change — auto-fill ALL vehicle fields
  useEffect(() => {
    if (!placa && !patrimonio && !renavam && !chassi && !descricaoEquipamento) {
      setMatchedAtivo(null);
      lastMatchedIdRef.current = null;
      return;
    }

    const normalizedPlaca = sanitize(placa);
    const normalizedPatrimonio = sanitize(patrimonio);
    const normalizedRenavam = renavam.trim();
    const normalizedChassi = chassi.trim().toLowerCase();
    const descriptionTokens = normalizePlainText(descricaoEquipamento)
      .split(' ')
      .filter((token) => token.length >= 4 && !['PATRIMONIO', 'PLACA', 'DOCUMENTO', 'ATIVO', 'EQUIPAMENTO'].includes(token));

    const plateMatch = normalizedPlaca
      ? ativosCache.find((a) => hasValue(a.placa) && sanitize(a.placa) === normalizedPlaca)
      : null;

    const match = plateMatch || ativosCache.find(a => {
      if (normalizedPatrimonio && hasValue(a.patrimonio) && sanitize(a.patrimonio) === normalizedPatrimonio) return true;
      if (normalizedRenavam && hasValue(a.renavam) && a.renavam === normalizedRenavam) return true;
      if (normalizedChassi && hasValue(a.chassi) && a.chassi.toLowerCase() === normalizedChassi) return true;
      if (descriptionTokens.length >= 2) {
        const haystack = normalizePlainText(`${a.descricao || ''} ${a.observacao || ''}`);
        if (descriptionTokens.every((token) => haystack.includes(token))) return true;
      }
      return false;
    });

    if (match) {
      setMatchedAtivo(match);
      applyMatchedAtivo(match);

      if (lastMatchedIdRef.current !== match.id) {
        toast.success(`Veículo localizado: ${match.descricao || match.placa} — campos preenchidos automaticamente.`);
        lastMatchedIdRef.current = match.id;
      }

      hydrateMatchedAtivo(match);
    } else {
      setMatchedAtivo(null);
      lastMatchedIdRef.current = null;
    }
  }, [placa, patrimonio, renavam, chassi, descricaoEquipamento, ativosCache]);

  const filteredAtivos = useMemo(() => {
    if (!ativoSearch || ativoSearch.length < 2) return [];
    const q = ativoSearch.toLowerCase();
    return ativosCache.filter(a =>
      (a.descricao || '').toLowerCase().includes(q) ||
      (a.placa || '').toLowerCase().includes(q) ||
      (a.patrimonio || '').toLowerCase().includes(q) ||
      (a.renavam || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [ativoSearch, ativosCache]);

  const handleParseText = async () => {
    if (!textoColado.trim()) { toast.error('Cole o texto primeiro'); return; }
    setParsing(true);
    try {
      const localData = extractLocalProtocolData(textoColado);
      let aiData = {};
      try {
        const { data, error } = await supabase.functions.invoke('parse-text', {
          body: { text: textoColado, type: 'protocolo' },
        });
        if (error) throw error;
        aiData = data?.data || {};
      } catch (e) {
        console.warn('[protocolo] parse-text indisponivel, usando leitura local', e);
      }

      const d = mergeParsedData(aiData, localData);
      if (d.empresa_destinataria) setEmpresaDestinataria(d.empresa_destinataria);
      if (d.local_canteiro) setLocalCanteiro(d.local_canteiro);
      if (d.responsavel_recebimento) setResponsavelRecebimento(d.responsavel_recebimento);
      if (d.placa) setPlaca(d.placa);
      if (d.patrimonio) setPatrimonio(d.patrimonio);
      if (d.renavam) setRenavam(d.renavam);
      if (d.chassi) setChassi(d.chassi);
      if (d.ano_fabricacao) setAnoFabricacao(d.ano_fabricacao);
      if (d.ano_modelo) setAnoModelo(d.ano_modelo);
      if (d.empresa && !d.empresa_destinataria) setEmpresaDestinataria(d.empresa);
      if (d.descricao_ativo) setDescricaoEquipamento(d.descricao_ativo);
      if (d.observacoes) setObservacoes(d.observacoes);
      toast.success('Texto lido e campos preenchidos. Revise antes de salvar ou imprimir.');
    } catch (e: any) {
      toast.error('Erro ao processar texto: ' + (e.message || 'Tente novamente'));
    } finally {
      setParsing(false);
    }
  };
  const handleSelectAtivo = async (a: AtivoDoc) => {
    setMatchedAtivo(a);
    applyMatchedAtivo(a);
    setShowManualSelect(false);
    setAtivoSearch('');
    if (a.arquivo_url) {
      const extracted = await readAndApplyVehicleDocument({
        sourceUrl: a.arquivo_url,
        fileLabel: a.descricao || a.placa || 'Documento do veiculo',
      });
      if (extracted) {
        await updateAtivoFromExtractedData(a, extracted).catch((error) => {
          console.warn('[protocolo] falha ao atualizar cadastro do veiculo', error);
        });
      }
    }
    toast.success('Documento vinculado! PDF carregado automaticamente.');
  };

  const handlePdfUpload = async (file: File) => {
    setPdfFile(file);
    setDocumentReadAttempted(false);
    setLastExtractedDocData(null);
    const fileName = `protocolo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('documentos-ativos').upload(fileName, file, { contentType: 'application/pdf' });
    if (error) { toast.error('Erro no upload'); return; }
    const { data: urlData } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setPdfUrl(urlData.publicUrl);
    toast.success('PDF anexado. Lendo dados do documento...');
    const extracted = await readAndApplyVehicleDocument({ source: file, fileLabel: file.name });
    if (extracted) {
      await linkUploadedPdfToAtivo(extracted, urlData.publicUrl, file.name).catch((error) => {
        console.warn('[protocolo] falha ao vincular PDF anexado ao cadastro de frota', error);
        toast.warning('PDF lido, mas nao consegui salvar o vinculo na Frota. Os campos foram preenchidos para este protocolo.');
      });
    }
  };

  const titulo = 'PROTOCOLO DE LIBERAÇÃO DE DOCUMENTO';

  const buildProtocoloHtml = (via: number, total: number) => {
    const co = topac;
    return `<div style="page-break-after:always;padding:15mm;font-family:Arial,sans-serif;font-size:12px;color:#000;box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px">
      <div><strong>${co?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
      <div style="font-size:14px;font-weight:bold;text-align:right">${titulo}<br/><span style="font-size:10px;color:#666">${via}ª Via de ${total}</span></div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Dados da Liberação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px">
        <div><span style="color:#666">Empresa Destinatária:</span> ${empresaDestinataria}</div>
        <div><span style="color:#666">Local/Canteiro:</span> ${localCanteiro || '—'}</div>
        <div><span style="color:#666">Responsável Recebimento:</span> ${responsavelRecebimento || '—'}</div>
        <div><span style="color:#666">Data:</span> ${new Date(dataEmissao).toLocaleDateString('pt-BR')}</div>
        ${descricaoEquipamento ? `<div style="grid-column:1/-1"><span style="color:#666">Descrição:</span> ${descricaoEquipamento}</div>` : ''}
      </div>
    </div>
    <div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px">
      <div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Identificação do Ativo</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px">
        <div><span style="color:#666">Placa:</span> ${placa || '—'}</div>
        <div><span style="color:#666">Renavam:</span> ${renavam || '—'}</div>
        <div><span style="color:#666">Chassi:</span> ${chassi || '—'}</div>
        <div><span style="color:#666">Ano Fabricação:</span> ${anoFabricacao || '—'}</div>
        <div><span style="color:#666">Ano Modelo:</span> ${anoModelo || '—'}</div>
        <div><span style="color:#666">Patrimônio:</span> ${patrimonio || '—'}</div>
        <div><span style="color:#666">Exercício:</span> ${exercicio}</div>
      </div>
    </div>
    ${observacoes ? `<div style="border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px"><div style="font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px">Observações</div><p style="font-size:11px;margin:0;white-space:pre-wrap">${observacoes}</p></div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:60px">
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Entrega</small></div>
      <div style="text-align:center;width:45%"><hr style="border:0;border-top:1px solid #000;margin-bottom:4px"/><small>Assinatura — Recebimento</small></div>
    </div>
    </div>`;
  };

  const buildProtocolPayload = () => {
    const complemento = buildComplementaryDocumentText();
    return {
      empresa_origem: topac?.name || 'TOPAC MATRIZ',
      empresa_destinataria: empresaDestinataria,
      local_canteiro: localCanteiro,
      responsavel_recebimento: responsavelRecebimento,
      data_emissao: normalizeDateInput(dataEmissao),
      descricao_ativo: descricaoEquipamento,
      placa,
      renavam,
      chassi,
      ano_fabricacao: anoFabricacao,
      ano_modelo: anoModelo,
      patrimonio,
      exercicio,
      observacoes: [observacoes, complemento].filter(Boolean).join('\n\n'),
      texto_original: textoColado,
      pdf_url: pdfUrl,
      ativo_id: matchedAtivo?.id || null,
    };
  };

  const saveProtocol = async ({ silent = false } = {}) => {
    if (!empresaDestinataria && !descricaoEquipamento && !placa && !patrimonio) {
      if (!silent) toast.error('Preencha ou leia o texto antes de salvar.');
      return null;
    }

    const documentReady = await ensureDocumentReadBeforeProtocol();
    if (!documentReady) return null;

    const payload = buildProtocolPayload();
    setSavingProtocol(true);
    try {
      const { data, error } = await supabase
        .from('protocolos_documentos')
        .insert(payload as any)
        .select('id')
        .single();
      if (error) throw error;
      const id = (data as any)?.id || null;
      setLastSavedProtocolId(id);
      await registrarAcao({
        modulo: 'protocolo',
        entidade: 'protocolos_documentos',
        entidadeId: id,
        acao: 'gerou',
        depois: payload,
        arquivoUrl: pdfUrl || undefined,
        observacao: `Protocolo salvo para ${empresaDestinataria || descricaoEquipamento || placa || patrimonio}`,
      });
      if (!silent) toast.success('Protocolo salvo e arquivado no sistema.');
      return id;
    } catch (e) {
      console.warn('[protocolo] falha ao salvar no Supabase, arquivando localmente', e);
      const fallbackId = `local-${Date.now()}`;
      const current = JSON.parse(localStorage.getItem('topac_protocolos_documentos') || '[]');
      localStorage.setItem('topac_protocolos_documentos', JSON.stringify([{ id: fallbackId, ...payload, created_at: new Date().toISOString() }, ...current].slice(0, 200)));
      setLastSavedProtocolId(fallbackId);
      if (!silent) toast.warning('Protocolo arquivado localmente. Assim que a tabela estiver ativa, volta a salvar no banco.');
      return fallbackId;
    } finally {
      setSavingProtocol(false);
    }
  };

  const handlePrint = async () => {
    if (!placa && !patrimonio && !descricaoEquipamento) {
      toast.error('Informe ao menos placa, patrimônio ou descrição');
      return;
    }

    const protocolId = await saveProtocol({ silent: true });
    if (!protocolId) return;

    let fullHtml = buildProtocoloHtml(1, 2) + buildProtocoloHtml(2, 2);

    if (pdfUrl) {
      try {
        const { pageUrls } = await renderPdfPagesToDataUrls(pdfUrl, 1.6);
        fullHtml += pageUrls.map((pageUrl, index) => `
          <div class="pdf-print-page" style="${index === 0 ? 'page-break-before:always;' : ''}">
            <img src="${pageUrl}" alt="Documento do veículo página ${index + 1}" style="display:block;width:100%;height:auto" />
          </div>
        `).join('');
      } catch {
        toast.error('Não foi possível incorporar o PDF na impressão');
      }
    }

    const html = `<!DOCTYPE html><html><head><title>${titulo}</title>
    <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,sans-serif}.pdf-print-page{padding:0;margin:0}.pdf-print-page img{display:block;width:100%;height:auto}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    ${fullHtml}
    </body></html>`;
    printDocumentInPage(html);
  };

  const handleClear = () => {
    setEmpresaDestinataria(''); setLocalCanteiro(''); setResponsavelRecebimento('');
    setPlaca(''); setRenavam(''); setChassi(''); setAnoFabricacao(''); setAnoModelo('');
    setPatrimonio(''); setDescricaoEquipamento(''); setObservacoes('');
    setProprietarioEmpresa(''); setMunicipioUf(''); setEspecieTipo(''); setMarcaModelo('');
    setTextoColado(''); setPdfFile(null); setPdfUrl('');
    setDocumentReadAttempted(false); setLastExtractedDocData(null);
    setMatchedAtivo(null); setShowManualSelect(false);
    lastMatchedIdRef.current = null;
    setExercicio(new Date().getFullYear().toString());
    setDataEmissao(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <FileCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Protocolo / Liberação de Documento</h1>
            <p className="text-primary-foreground/70 text-sm">Empresa padrão: TOPAC MATRIZ — Localização automática de documentos cadastrados</p>
          </div>
        </div>
      </div>

      {/* Leitura IA */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Leitura Inteligente de Texto
          </h2>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground">
            Limpar Campos
          </Button>
        </div>
        <textarea
          value={textoColado}
          onChange={e => setTextoColado(e.target.value)}
          placeholder="Cole aqui o texto de WhatsApp, e-mail ou mensagem com os dados do documento. A IA vai sugerir o preenchimento — você pode revisar e editar tudo antes de salvar ou imprimir."
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[140px] resize-y"
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleParseText} disabled={parsing} variant="outline">
            {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {parsing ? 'Lendo texto...' : 'Ler texto e preencher'}
          </Button>
          <span className="text-xs text-muted-foreground">Os campos serão preenchidos automaticamente. Revise antes de imprimir.</span>
        </div>
      </div>

      {/* Dados da liberação */}
      <div className="card-premium p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Dados da Liberação</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><label className="text-xs text-muted-foreground block mb-1">Empresa Destinatária</label>
            <Input value={empresaDestinataria} onChange={e => setEmpresaDestinataria(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Local / Canteiro</label>
            <Input value={localCanteiro} onChange={e => setLocalCanteiro(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Responsável pelo Recebimento</label>
            <Input value={responsavelRecebimento} onChange={e => setResponsavelRecebimento(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Data de Emissão</label>
            <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} /></div>
          <div className="lg:col-span-2"><label className="text-xs text-muted-foreground block mb-1">Descrição do Ativo / Equipamento</label>
            <Input value={descricaoEquipamento} onChange={e => setDescricaoEquipamento(e.target.value)} placeholder="Ex: Veículo, Compressor, Equipamento..." /></div>
        </div>
      </div>

      {/* Identificação do ativo */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Identificação do Ativo</h2>
          {matchedAtivo && (
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 px-3 py-1 rounded-full">
              <LinkIcon className="w-3 h-3" />
              Documento vinculado: {matchedAtivo.descricao || matchedAtivo.placa}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><label className="text-xs text-muted-foreground block mb-1">Placa</label>
            <Input value={placa} onChange={e => setPlaca(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Renavam</label>
            <Input value={renavam} onChange={e => setRenavam(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Chassi</label>
            <Input value={chassi} onChange={e => setChassi(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Ano Fabricação</label>
            <Input value={anoFabricacao} onChange={e => setAnoFabricacao(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Ano Modelo</label>
            <Input value={anoModelo} onChange={e => setAnoModelo(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Patrimônio</label>
            <Input value={patrimonio} onChange={e => setPatrimonio(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Exercício</label>
            <Input value={exercicio} onChange={e => setExercicio(e.target.value)} /></div>
        </div>

        {(proprietarioEmpresa || municipioUf || especieTipo || marcaModelo) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><label className="text-xs text-muted-foreground block mb-1">Proprietario / Empresa</label>
              <Input value={proprietarioEmpresa} onChange={e => setProprietarioEmpresa(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Municipio/UF</label>
              <Input value={municipioUf} onChange={e => setMunicipioUf(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Especie/Tipo</label>
              <Input value={especieTipo} onChange={e => setEspecieTipo(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Marca/Modelo</label>
              <Input value={marcaModelo} onChange={e => setMarcaModelo(e.target.value)} /></div>
          </div>
        )}

        {!matchedAtivo && !pdfUrl && (placa || patrimonio || renavam || chassi) && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm">
            <span className="text-warning font-medium">Documento não encontrado automaticamente. Selecione o PDF do ativo.</span>
            <Button variant="link" size="sm" className="text-primary ml-2" onClick={() => setShowManualSelect(true)}>
              Selecionar manualmente
            </Button>
          </div>
        )}

        {showManualSelect && (
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar documento por descrição, placa ou patrimônio..."
                value={ativoSearch} onChange={e => setAtivoSearch(e.target.value)} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setShowManualSelect(false)}>Fechar</Button>
            </div>
            {filteredAtivos.length > 0 && (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {filteredAtivos.map(a => (
                  <button key={a.id} onClick={() => handleSelectAtivo(a)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex justify-between items-center border-b last:border-0">
                    <span className="font-medium">{a.descricao}</span>
                    <span className="text-xs text-muted-foreground">{a.placa || a.patrimonio || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Observações + PDF + Imprimir */}
      <div className="card-premium p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[80px] resize-y" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PDF do Documento</label>
            {matchedAtivo?.arquivo_url && pdfUrl === matchedAtivo.arquivo_url ? (
              <div className="text-xs text-success bg-success/10 rounded-lg p-3 flex items-center gap-2">
                <LinkIcon className="w-3 h-3" />
                PDF carregado automaticamente de Doc. Veículos
                <Button variant="ghost" size="sm" className="text-xs ml-auto"
                  onClick={() => { setPdfUrl(''); setPdfFile(null); setDocumentReadAttempted(false); setLastExtractedDocData(null); }}>Trocar</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 text-sm">
                  <Upload className="w-4 h-4" />
                  {pdfFile ? pdfFile.name : 'Selecionar PDF'}
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
                </label>
              </div>
            )}
            {pdfUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingPdf}
                onClick={() => readAndApplyVehicleDocument({ force: false })}
                className="mt-2"
              >
                {loadingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                LER DOCUMENTO E PREENCHER
              </Button>
            )}
            {pdfUrl && (
              <div className="space-y-2 mt-1">
                <p className="text-xs text-success">✓ PDF vinculado — será impresso como via adicional</p>
                {loadingPdf && <p className="text-xs text-muted-foreground">Carregando PDF...</p>}
                <PdfDocumentViewer source={{ url: pdfUrl, tipo: 'protocolo' }} title="PDF do documento" />
              </div>
            )}
            {!pdfUrl && <p className="text-xs text-muted-foreground mt-1">Sem PDF: imprime apenas 2 vias do protocolo</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => saveProtocol()} disabled={savingProtocol} variant="outline" size="lg">
            {savingProtocol ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
            Salvar no sistema
          </Button>
          <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold" size="lg">
            <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir - {pdfUrl ? '2 vias + Documento Anexo' : '2 vias'}
          </Button>
          {lastSavedProtocolId && <span className="self-center text-xs text-success">Arquivado: {lastSavedProtocolId}</span>}
        </div>
      </div>
    </div>
  );
};

export default ProtocoloPage;

