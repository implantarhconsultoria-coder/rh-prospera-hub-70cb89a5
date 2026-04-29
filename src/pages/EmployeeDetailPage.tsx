import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { formatCurrency, formatDate, feriasStatus, asoStatus } from '@/lib/calculations';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save } from 'lucide-react';
import DocumentosFuncionarioPastas from '@/components/DocumentosFuncionarioPastas';

const tabs = ['Dados Cadastrais', 'Dados Funcionais', 'Benefícios', 'Férias e ASO', 'Lançamentos', 'Histórico Documental'];

const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { employees, companies, updateEmployee } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);

  const portalPrefix = location.pathname.startsWith('/filial') ? '/filial'
    : location.pathname.startsWith('/admin') ? '/admin' : '';

  const emp = employees.find(e => e.id === id);
  if (!emp) return <div className="p-8 text-center text-muted-foreground">Funcionário não encontrado</div>;

  const company = companies.find(c => c.id === emp.companyId);
  const fer = feriasStatus(emp.dataAdmissao);
  const aso = asoStatus(emp.dataExameMedico);

  const Field = ({ label, value, field, type = 'text' }: { label: string; value: string | number; field?: keyof typeof emp; type?: string }) => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {field ? (
        <Input value={value} type={type} onChange={e => updateEmployee(emp.id, { [field]: type === 'number' ? Number(e.target.value) : e.target.value } as any)}
          className="text-sm" />
      ) : (
        <p className="text-sm font-medium text-foreground bg-muted/50 px-3 py-2 rounded-md">{value}</p>
      )}
    </div>
  );

  const Toggle = ({ label, active, field, valueField, valueLabel, value }: { label: string; active: boolean; field: string; valueField?: string; valueLabel?: string; value?: number }) => (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
      <div>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {valueLabel && <span className="text-xs text-muted-foreground ml-2">({valueLabel}: {formatCurrency(value || 0)})</span>}
      </div>
      <button onClick={() => updateEmployee(emp.id, { [field]: !active } as any)}
        className={`w-12 h-6 rounded-full transition-colors ${active ? 'bg-success' : 'bg-muted'} relative`}>
        <div className={`w-5 h-5 bg-card rounded-full absolute top-0.5 transition-transform ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${portalPrefix}/funcionarios`)}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl font-bold font-display text-foreground">{emp.name}</h1>
          <p className="text-sm text-muted-foreground">{emp.cargo} — {company?.name}</p>
        </div>
        <Badge className={`ml-auto ${emp.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>{emp.status}</Badge>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${i === activeTab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="card-premium p-6">
        {activeTab === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Nome Completo" value={emp.name} field="name" />
            <Field label="CPF" value={emp.cpf} />
            <Field label="Telefone" value={emp.telefone} field="telefone" />
            <Field label="E-mail" value={emp.email} field="email" />
            <Field label="Endereço" value={emp.endereco} field="endereco" />
            <Field label="PIX" value={emp.pix} field="pix" />
            <Field label="Banco" value={emp.banco} field="banco" />
            <Field label="Agência" value={emp.agencia} field="agencia" />
            <Field label="Conta" value={emp.conta} field="conta" />
          </div>
        )}
        {activeTab === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Empresa" value={company?.name || ''} />
            <Field label="CNPJ" value={company?.cnpj || ''} />
            <Field label="Nº Registro" value={emp.registro} />
            <Field label="Matrícula eSocial" value={emp.matriculaEsocial} />
            <Field label="Cargo / Função" value={emp.cargo} field="cargo" />
            <Field label="Salário Base" value={emp.salarioBase} field="salarioBase" type="number" />
            <Field label="Data Admissão" value={emp.dataAdmissao} field="dataAdmissao" type="date" />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select value={emp.status} onChange={e => updateEmployee(emp.id, { status: e.target.value as any })}
                className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground w-full">
                <option value="ativo">Ativo</option>
                <option value="afastado">Afastado</option>
                <option value="férias">Férias</option>
                <option value="desligado">Desligado</option>
              </select>
            </div>
          </div>
        )}
        {activeTab === 2 && (
          <div className="space-y-3">
            <Toggle label="Vale Refeição (VR)" active={emp.vrAtivo} field="vrAtivo" valueField="vrDiario" valueLabel="Diário" value={emp.vrDiario} />
            {emp.vrAtivo && <Field label="Valor Diário VR" value={emp.vrDiario} field="vrDiario" type="number" />}
            <Toggle label="Vale Alimentação (VA)" active={emp.vaAtivo} field="vaAtivo" valueField="vaMensal" valueLabel="Mensal" value={emp.vaMensal} />
            {emp.vaAtivo && <Field label="Valor Mensal VA" value={emp.vaMensal} field="vaMensal" type="number" />}
            <Toggle label="Vale Transporte (VT)" active={emp.vtAtivo} field="vtAtivo" valueField="vtDiario" valueLabel="Diário" value={emp.vtDiario} />
            {emp.vtAtivo && <Field label="Valor Diário VT" value={emp.vtDiario} field="vtDiario" type="number" />}
            <Toggle label="Insalubridade" active={emp.insalubridadeAtiva} field="insalubridadeAtiva" valueField="insalubridadeValor" valueLabel="Valor" value={emp.insalubridadeValor} />
            {emp.insalubridadeAtiva && <Field label="Valor Insalubridade" value={emp.insalubridadeValor} field="insalubridadeValor" type="number" />}
          </div>
        )}
        {activeTab === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold font-display text-foreground">Férias</h3>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm"><span className="text-muted-foreground">Status:</span> <Badge className={`ml-1 text-xs ${fer.status === 'em dia' ? 'bg-success text-success-foreground' : fer.status === 'atenção' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}`}>{fer.status}</Badge></p>
                <p className="text-sm"><span className="text-muted-foreground">Período Atual:</span> {fer.periodoAtual + 1}º</p>
                <p className="text-sm"><span className="text-muted-foreground">Meses no Período:</span> {fer.mesesNoPeriodo}</p>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold font-display text-foreground">ASO</h3>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm"><span className="text-muted-foreground">Status:</span> <Badge className={`ml-1 text-xs ${aso.status === 'ok' ? 'bg-success text-success-foreground' : aso.status === 'próximo' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}`}>{aso.status}</Badge></p>
                <p className="text-sm"><span className="text-muted-foreground">Último Exame:</span> {formatDate(emp.dataExameMedico)}</p>
                <p className="text-sm"><span className="text-muted-foreground">Próximo ASO:</span> {formatDate(aso.proximoASO.toISOString())}</p>
                <p className="text-sm"><span className="text-muted-foreground">Dias Restantes:</span> {aso.diasRestantes}</p>
                <Field label="Data Exame Médico" value={emp.dataExameMedico} field="dataExameMedico" type="date" />
              </div>
            </div>
          </div>
        )}
        {activeTab === 4 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Acesse o módulo de Lançamentos Mensais para gerenciar os lançamentos deste funcionário.</p>
            <Button className="mt-4" onClick={() => navigate(`${portalPrefix}/lancamentos`)}>Ir para Lançamentos</Button>
          </div>
        )}
        {activeTab === 5 && (
          <div className="space-y-6">
            <DocumentosFuncionarioPastas funcionarioId={emp.id} />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Observações Gerais</label>
              <textarea value={emp.observacoes} onChange={e => updateEmployee(emp.id, { observacoes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[120px]"
                placeholder="Observações adicionais do funcionário..." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeDetailPage;
