import React, { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

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

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

const AtestadosImportPage: React.FC = () => {
  const { employees, companies, session } = useApp();
  const [staging, setStaging] = useState<AtestadoStaging[]>([]);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matchFuncionario = (data: { funcionario_nome?: string; cpf?: string }) => {
    const cpf = onlyDigits(data.cpf || '');
    if (cpf) {
      const byCpf = employees.find(e => onlyDigits(e.cpf) === cpf);
      if (byCpf) return byCpf;
    }
    const nome = (data.funcionario_nome || '').trim().toLowerCase();
    if (!nome) return undefined;
    // exato
    let m = employees.find(e => e.name.trim().toLowerCase() === nome);
    if (m) return m;
    // contém todos os tokens
    const tokens = nome.split(/\s+/).filter(t => t.length > 2);
    m = employees.find(e => {
      const en = e.name.toLowerCase();
      return tokens.every(t => en.includes(t));
    });
    return m;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const userId = session?.user?.id;
    if (!userId) { toast.error('Sessão expirada'); return; }

    for (const file of Array.from(files)) {
      const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const path = `${userId}/${safeName}`;
      const idx = staging.length + 0;

      setStaging(prev => [...prev, {
        fileName: file.name, fileUrl: '', fileSize: file.size,
        status: 'subindo', aplicarVR: true, aplicarVT: true,
      }]);

      const up = await supabase.storage.from('atestados').upload(path, file, { upsert: false });
      if (up.error) {
        setStaging(prev => prev.map((s, i) => s.fileName === file.name && s.status === 'subindo'
          ? { ...s, status: 'erro', erro: up.error.message } : s));
        continue;
      }

      const { data: signed } = await supabase.storage.from('atestados').createSignedUrl(path, 3600);
      const fileUrl = signed?.signedUrl || '';

      setStaging(prev => prev.map(s => s.fileName === file.name && s.status === 'subindo'
        ? { ...s, status: 'processando', fileUrl } : s));

      try {
        // Gera dataUrl: PDFs viram imagem da 1ª página (Gemini só aceita imagens)
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
        const empresa = emp ? companies.find(c => c.id === emp.companyId) : undefined;

        setStaging(prev => prev.map(s => s.fileUrl === fileUrl ? {
          ...s,
          status: 'ok',
          funcionarioId: emp?.id,
          funcionarioNome: ext.funcionario_nome || emp?.name || '',
          empresaNome: empresa?.name || '',
          cpf: ext.cpf || '',
          dataInicio: ext.data_inicio || '',
          dataFim: ext.data_fim || '',
          diasCobertos: Number(ext.dias_cobertos) || 1,
          cid: ext.cid || '',
          medico: ext.medico || '',
          crm: ext.crm || '',
          textoBruto: ext.texto_bruto || '',
          confianca: Number(ext.confianca) || 0,
        } : s));
      } catch (e: any) {
        setStaging(prev => prev.map(s => s.fileUrl === fileUrl
          ? { ...s, status: 'erro', erro: e.message } : s));
      }
    }
  };

  const updateRow = (i: number, patch: Partial<AtestadoStaging>) => {
    setStaging(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const removeRow = (i: number) => setStaging(prev => prev.filter((_, idx) => idx !== i));

  const salvarTudo = async () => {
    const validos = staging.filter(s => s.status === 'ok' && s.funcionarioId);
    if (validos.length === 0) {
      toast.error('Nenhum atestado pronto para salvar (vincule o funcionário primeiro)');
      return;
    }
    setSalvando(true);
    try {
      const userId = session?.user?.id!;
      const userName = session?.user?.email || 'Sistema';

      const rowsAtestados = validos.map(v => {
        const emp = employees.find(e => e.id === v.funcionarioId);
        const company = emp ? companies.find(c => c.id === emp.companyId) : undefined;
        const competencia = (v.dataInicio || new Date().toISOString().slice(0, 10)).slice(0, 7);
        return {
          funcionario_id: v.funcionarioId!,
          funcionario_nome: emp?.name || v.funcionarioNome || '',
          company_id: emp?.companyId,
          empresa_nome: company?.name || '',
          competencia,
          data_inicio: v.dataInicio || null,
          data_fim: v.dataFim || null,
          dias_cobertos: v.diasCobertos || 1,
          cid: v.cid || '',
          medico: v.medico || '',
          crm: v.crm || '',
          arquivo_url: v.fileUrl,
          arquivo_nome: v.fileName,
          ocr_texto_bruto: v.textoBruto || '',
          ocr_confianca: v.confianca || 0,
          status: 'confirmado',
          aplicado_vr: v.aplicarVR,
          aplicado_vt: v.aplicarVT,
          importado_por_user_id: userId,
          importado_por_nome: userName,
        };
      });

      const { data: ins, error: errA } = await supabase.from('atestados').insert(rowsAtestados).select();
      if (errA) throw errA;

      // Histórico do funcionário
      const rowsDocs = validos.map(v => {
        const emp = employees.find(e => e.id === v.funcionarioId);
        const company = emp ? companies.find(c => c.id === emp.companyId) : undefined;
        const competencia = (v.dataInicio || new Date().toISOString().slice(0, 10)).slice(0, 7);
        return {
          funcionario_id: v.funcionarioId!,
          funcionario_nome: emp?.name || '',
          company_id: emp?.companyId,
          empresa_nome: company?.name || '',
          tipo_documento: 'Atestado Médico',
          competencia,
          descricao: `Atestado ${v.diasCobertos || 1} dia(s)${v.cid ? ` — CID ${v.cid}` : ''}${v.medico ? ` — Dr(a). ${v.medico}` : ''}`,
          arquivo_url: v.fileUrl,
          gerado_por_user_id: userId,
          gerado_por_nome: userName,
          status_envio: 'arquivado',
          unidade: company?.name || '',
        };
      });
      await supabase.from('documentos_funcionario').insert(rowsDocs);

      toast.success(`${validos.length} atestado(s) arquivado(s) no histórico.`);
      setStaging(prev => prev.filter(s => !validos.includes(s)));
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const prontos = staging.filter(s => s.status === 'ok').length;
  const erros = staging.filter(s => s.status === 'erro').length;
  const processando = staging.filter(s => s.status === 'subindo' || s.status === 'processando').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Importar Atestados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suba PDFs ou imagens. O sistema reconhece o funcionário, arquiva no histórico e ajusta VR/VT (sem alterar horas).
        </p>
      </div>

      <Card className="p-6 border-2 border-dashed border-primary/30 bg-primary/5">
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*"
          onChange={e => handleFiles(e.target.files)} className="hidden" />
        <button onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 py-10 cursor-pointer hover:bg-primary/5 rounded-lg transition">
          <Upload className="w-12 h-12 text-primary" />
          <div className="text-center">
            <p className="font-semibold text-foreground">Clique para selecionar arquivos</p>
            <p className="text-xs text-muted-foreground">PDFs e imagens — pode subir vários de uma vez</p>
          </div>
        </button>
        {staging.length > 0 && (
          <div className="flex gap-2 justify-center mt-3">
            {processando > 0 && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{processando} processando</Badge>}
            {prontos > 0 && <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />{prontos} prontos</Badge>}
            {erros > 0 && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{erros} com erro</Badge>}
          </div>
        )}
      </Card>

      {staging.length > 0 && (
        <div className="space-y-3">
          {staging.map((s, i) => (
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
                  {s.status === 'ok' && (
                    <Badge className="bg-success text-success-foreground">
                      <CheckCircle2 className="w-3 h-3 mr-1" />OK {s.confianca ? `(${Math.round((s.confianca || 0) * 100)}%)` : ''}
                    </Badge>
                  )}
                  {s.status === 'erro' && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => removeRow(i)}>×</Button>
                </div>
              </div>

              {s.status === 'erro' && (
                <p className="text-xs text-destructive">{s.erro}</p>
              )}

              {s.status === 'ok' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />Funcionário</label>
                    <select value={s.funcionarioId || ''} onChange={e => updateRow(i, { funcionarioId: e.target.value || undefined })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${!s.funcionarioId ? 'border-destructive' : ''}`}>
                      <option value="">— Selecione —</option>
                      {employees.filter(e => e.status === 'ativo').map(emp => {
                        const c = companies.find(cc => cc.id === emp.companyId);
                        return <option key={emp.id} value={emp.id}>{emp.name} • {c?.name || ''}</option>;
                      })}
                    </select>
                    {s.funcionarioNome && !s.funcionarioId && (
                      <p className="text-[10px] text-warning mt-1">Sugerido: "{s.funcionarioNome}" (não bateu — selecione manual)</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Início</label>
                    <Input type="date" value={s.dataInicio || ''} onChange={e => updateRow(i, { dataInicio: e.target.value })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">Dias</label>
                    <Input type="number" min="1" value={s.diasCobertos || 1}
                      onChange={e => updateRow(i, { diasCobertos: Number(e.target.value) })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">CID</label>
                    <Input value={s.cid || ''} onChange={e => updateRow(i, { cid: e.target.value })} className="h-9" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase text-muted-foreground">Médico</label>
                    <Input value={s.medico || ''} onChange={e => updateRow(i, { medico: e.target.value })} className="h-9" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">CRM</label>
                    <Input value={s.crm || ''} onChange={e => updateRow(i, { crm: e.target.value })} className="h-9" />
                  </div>
                  <div className="flex flex-col gap-1 lg:col-span-4">
                    <label className="text-[10px] uppercase text-muted-foreground">Impacto em benefícios (não afeta horas)</label>
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={s.aplicarVR} onChange={e => updateRow(i, { aplicarVR: e.target.checked })} />Descontar dia(s) do VR</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={s.aplicarVT} onChange={e => updateRow(i, { aplicarVT: e.target.checked })} />Descontar dia(s) do VT</label>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}

          <div className="flex justify-end gap-3 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-xl border">
            <Button variant="outline" onClick={() => setStaging([])} disabled={salvando}>Limpar lista</Button>
            <Button onClick={salvarTudo} disabled={salvando || prontos === 0} className="gradient-primary text-primary-foreground">
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar e arquivar ({prontos})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtestadosImportPage;
