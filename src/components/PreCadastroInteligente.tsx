import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import {
  formatSmartCpf,
  formatSmartMoney,
  formatSmartPhone,
  formatSmartRg,
  type SmartAdmissionResult,
  type SmartField,
} from '@/lib/preCadastroInteligente';
import { interpretarEValidarPreCadastroLivre } from '@/lib/preCadastroInteligenteNormalizacao';

const statusMeta = (field: SmartField<unknown>) => {
  if (field.status === 'ok') return { className: 'bg-emerald-500', label: 'Identificado com segurança', icon: CheckCircle2 };
  if (field.status === 'review') return { className: 'bg-amber-400', label: 'Recomenda conferência', icon: AlertTriangle };
  return { className: 'bg-red-500', label: field.status === 'conflict' ? 'Conflito encontrado' : field.status === 'missing' ? 'Não informado' : 'Informação inválida', icon: CircleAlert };
};

type ReviewFieldProps = {
  label: string;
  field: SmartField<unknown>;
  children: React.ReactNode;
  onCandidate?: (value: unknown, display: string) => void;
};

const ReviewField: React.FC<ReviewFieldProps> = ({ label, field, children, onCandidate }) => {
  const meta = statusMeta(field);
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border/80 bg-card/60 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={meta.label}>
          <span className={`h-2.5 w-2.5 rounded-full ${meta.className}`} />
          <span className="hidden sm:inline">{meta.label}</span>
        </div>
      </div>
      {children}
      {field.message && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{field.message}</span>
        </div>
      )}
      {field.status === 'conflict' && field.candidates?.length ? (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
          <div className="mb-2 text-[11px] font-semibold text-red-500">CONFLITO ENCONTRADO — selecione uma opção ou edite manualmente:</div>
          <div className="flex flex-wrap gap-2">
            {field.candidates.map((candidate, index) => (
              <Button
                key={`${candidate.display}-${index}`}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onCandidate?.(candidate.value, candidate.display)}
              >
                {candidate.display}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PreCadastroInteligente: React.FC = () => {
  const { companies, employees } = useApp();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<SmartAdmissionResult | null>(null);
  const [etapa, setEtapa] = useState<'texto' | 'conferencia'>('texto');

  const roles = useMemo(
    () => Array.from(new Set(employees.map((employee: any) => String(employee.cargo || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [employees],
  );

  const companyOptions = useMemo(() => companies.map((company: any) => ({
    id: company.id,
    name: String(company.name || company.nome || '').trim(),
    razaoSocial: company.razaoSocial || company.razao_social,
  })), [companies]);

  const fechar = () => {
    setOpen(false);
    setEtapa('texto');
  };

  const limpar = () => {
    setTexto('');
    setResultado(null);
    setEtapa('texto');
  };

  const interpretar = () => {
    const next = interpretarEValidarPreCadastroLivre(texto, {
      companies: companyOptions,
      roles,
    });
    setResultado(next);
    setEtapa('conferencia');
  };

  const updateField = (key: keyof SmartAdmissionResult, value: unknown, display?: string) => {
    setResultado((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: {
          ...(current as any)[key],
          value,
          display: display ?? String(value ?? ''),
          status: value === null || value === '' ? 'missing' : 'ok',
          confidence: value === null || value === '' ? 'low' : 'high',
          message: undefined,
          candidates: undefined,
        },
      } as SmartAdmissionResult;
    });
  };

  const updateBenefit = (key: 'vr' | 'vt', enabled: boolean | null, dailyValue: number | null) => {
    const prefix = key.toUpperCase();
    const display = enabled === null
      ? 'NÃO INFORMADO'
      : enabled === false
        ? `${prefix}: NÃO`
        : dailyValue === null
          ? `${prefix}: SIM — valor ainda não informado`
          : `${prefix}: SIM — ${formatSmartMoney(dailyValue)}/dia`;
    updateField(key, { enabled, dailyValue }, display);
  };

  const selectCandidate = (key: keyof SmartAdmissionResult, value: unknown, display: string) => {
    updateField(key, value, display);
  };

  const renderReview = () => {
    if (!resultado) return null;
    const vr = resultado.vr.value;
    const vt = resultado.vt.value;

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
          <div className="text-sm font-semibold text-foreground">CONFERÊNCIA DO PREENCHIMENTO</div>
          <div className="mt-1 text-xs text-muted-foreground">Revise e corrija qualquer informação antes de transferir para o Pré-Cadastro. Nada será salvo automaticamente.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReviewField label="1. Empresa contratante" field={resultado.empresa} onCandidate={(value, display) => selectCandidate('empresa', value, display)}>
            <select
              value={resultado.empresa.value?.id || ''}
              onChange={(event) => {
                const company = companyOptions.find((item) => item.id === event.target.value);
                updateField('empresa', company ? { id: company.id, name: company.name } : null, company?.name.toLocaleUpperCase('pt-BR') || 'NÃO INFORMADO');
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">NÃO INFORMADO</option>
              {companyOptions.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </ReviewField>

          <ReviewField label="2. Nome" field={resultado.nome} onCandidate={(value, display) => selectCandidate('nome', value, display)}>
            <Input value={resultado.nome.value || ''} onChange={(event) => updateField('nome', event.target.value, event.target.value || 'NÃO INFORMADO')} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="3. CPF" field={resultado.cpf} onCandidate={(value, display) => selectCandidate('cpf', value, display)}>
            <Input value={resultado.cpf.value ? formatSmartCpf(resultado.cpf.value) : ''} onChange={(event) => updateField('cpf', event.target.value.replace(/\D/g, ''), formatSmartCpf(event.target.value))} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="4. RG" field={resultado.rg} onCandidate={(value, display) => selectCandidate('rg', value, display)}>
            <Input value={resultado.rg.value ? formatSmartRg(resultado.rg.value) : ''} onChange={(event) => updateField('rg', event.target.value.replace(/\D/g, ''), formatSmartRg(event.target.value))} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="5. Data de nascimento" field={resultado.dataNascimento} onCandidate={(value, display) => selectCandidate('dataNascimento', value, display)}>
            <Input type="date" value={resultado.dataNascimento.value || ''} onChange={(event) => updateField('dataNascimento', event.target.value, event.target.value || 'NÃO INFORMADO')} />
          </ReviewField>

          <ReviewField label="6. Data de admissão" field={resultado.dataAdmissao} onCandidate={(value, display) => selectCandidate('dataAdmissao', value, display)}>
            <Input type="date" value={resultado.dataAdmissao.value || ''} onChange={(event) => updateField('dataAdmissao', event.target.value, event.target.value || 'NÃO INFORMADO')} />
          </ReviewField>

          <ReviewField label="7. Função" field={resultado.funcao} onCandidate={(value, display) => selectCandidate('funcao', value, display)}>
            <Input list="pre-cadastro-smart-roles" value={resultado.funcao.value || ''} onChange={(event) => updateField('funcao', event.target.value, event.target.value || 'NÃO INFORMADO')} placeholder="NÃO INFORMADO" />
            <datalist id="pre-cadastro-smart-roles">{roles.map((role) => <option key={role} value={role} />)}</datalist>
          </ReviewField>

          <ReviewField label="8. Setor/GHE" field={resultado.setorGhe} onCandidate={(value, display) => selectCandidate('setorGhe', value, display)}>
            <Input value={resultado.setorGhe.value || ''} onChange={(event) => updateField('setorGhe', event.target.value, event.target.value || 'NÃO INFORMADO')} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="9. Obra/Local" field={resultado.obraLocal} onCandidate={(value, display) => selectCandidate('obraLocal', value, display)}>
            <Input value={resultado.obraLocal.value || ''} onChange={(event) => updateField('obraLocal', event.target.value, event.target.value || 'NÃO INFORMADO')} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="10. Salário" field={resultado.salario} onCandidate={(value, display) => selectCandidate('salario', value, display)}>
            <Input type="number" min="0" step="0.01" value={resultado.salario.value ?? ''} onChange={(event) => updateField('salario', event.target.value === '' ? null : Number(event.target.value), event.target.value === '' ? 'NÃO INFORMADO' : formatSmartMoney(Number(event.target.value)))} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="11. E-mail" field={resultado.email} onCandidate={(value, display) => selectCandidate('email', value, display)}>
            <Input type="email" value={resultado.email.value || ''} onChange={(event) => updateField('email', event.target.value, event.target.value || 'NÃO INFORMADO')} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="12. Celular" field={resultado.celular} onCandidate={(value, display) => selectCandidate('celular', value, display)}>
            <Input value={resultado.celular.value ? formatSmartPhone(resultado.celular.value) : ''} onChange={(event) => updateField('celular', event.target.value.replace(/\D/g, ''), formatSmartPhone(event.target.value))} placeholder="NÃO INFORMADO" />
          </ReviewField>

          <ReviewField label="13. VR" field={resultado.vr} onCandidate={(value, display) => selectCandidate('vr', value, display)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={vr?.enabled === null || vr?.enabled === undefined ? '' : vr.enabled ? 'sim' : 'nao'}
                onChange={(event) => updateBenefit('vr', event.target.value === '' ? null : event.target.value === 'sim', vr?.dailyValue ?? null)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">NÃO INFORMADO</option><option value="sim">SIM</option><option value="nao">NÃO</option>
              </select>
              <Input type="number" min="0" step="0.01" disabled={vr?.enabled !== true} value={vr?.dailyValue ?? ''} onChange={(event) => updateBenefit('vr', true, event.target.value === '' ? null : Number(event.target.value))} placeholder="Valor diário" />
            </div>
          </ReviewField>

          <ReviewField label="14. VT" field={resultado.vt} onCandidate={(value, display) => selectCandidate('vt', value, display)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={vt?.enabled === null || vt?.enabled === undefined ? '' : vt.enabled ? 'sim' : 'nao'}
                onChange={(event) => updateBenefit('vt', event.target.value === '' ? null : event.target.value === 'sim', vt?.dailyValue ?? null)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">NÃO INFORMADO</option><option value="sim">SIM</option><option value="nao">NÃO</option>
              </select>
              <Input type="number" min="0" step="0.01" disabled={vt?.enabled !== true} value={vt?.dailyValue ?? ''} onChange={(event) => updateBenefit('vt', true, event.target.value === '' ? null : Number(event.target.value))} placeholder="Valor diário" />
            </div>
          </ReviewField>

          <ReviewField label="15. Insalubridade" field={resultado.insalubridade} onCandidate={(value, display) => selectCandidate('insalubridade', value, display)}>
            <select
              value={resultado.insalubridade.value === null ? '' : resultado.insalubridade.value ? 'sim' : 'nao'}
              onChange={(event) => updateField('insalubridade', event.target.value === '' ? null : event.target.value === 'sim', event.target.value === '' ? 'NÃO INFORMADO' : event.target.value === 'sim' ? 'SIM' : 'NÃO')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">NÃO INFORMADO</option><option value="sim">SIM</option><option value="nao">NÃO</option>
            </select>
          </ReviewField>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setEtapa('texto')}>VOLTAR E EDITAR TEXTO</Button>
          <Button type="button" variant="outline" onClick={fechar}>CANCELAR</Button>
          <Button type="button" className="bg-violet-600 text-white hover:bg-violet-500">CONFIRMAR E PREENCHER PRÉ-CADASTRO</Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-2 border border-violet-400/30 bg-violet-600 text-white shadow-sm hover:bg-violet-500"
      >
        <Sparkles className="h-4 w-4" />
        PREENCHIMENTO INTELIGENTE
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-violet-500/30 bg-background shadow-2xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-violet-500" />
              {etapa === 'texto' ? 'PREENCHIMENTO INTELIGENTE' : 'CONFERÊNCIA DO PREENCHIMENTO'}
            </DialogTitle>
            {etapa === 'texto' && (
              <p className="text-sm text-muted-foreground">Cole as informações do colaborador abaixo. Não é necessário organizar os dados.</p>
            )}
          </DialogHeader>

          {etapa === 'texto' ? (
            <div className="space-y-4">
              <Textarea
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                className="min-h-[300px] resize-y border-violet-500/20 bg-muted/20 leading-6 focus-visible:ring-violet-500"
                placeholder={`Exemplo:\n\nAmanda Oliveira Santos\nTOPAC Matriz\nsalário 2400\nVR 31 por dia\nVT sim\nadmissão 08/09/2026\nCPF 39118566895\n\nVocê pode informar os dados em qualquer ordem.`}
                autoFocus
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={fechar}>CANCELAR</Button>
                <Button type="button" variant="outline" onClick={limpar} disabled={!texto}>LIMPAR</Button>
                <Button type="button" onClick={interpretar} disabled={!texto.trim()} className="gap-2">
                  <Sparkles className="h-4 w-4" /> INTERPRETAR INFORMAÇÕES
                </Button>
              </div>
            </div>
          ) : renderReview()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreCadastroInteligente;
