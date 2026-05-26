import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileX, Printer, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { calcularRescisao, tipoRescisaoLabel, type TipoRescisao, type AvisoPrevio } from '@/lib/rescisaoCalc';
import { buildRescisaoHtml } from '@/lib/rescisaoPdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { formatCurrency } from '@/lib/calculations';
import { openEmailClient, getDestinatariosRescisao, CC_OBRIGATORIO } from '@/lib/emailUtils';
import EmployeeCombobox from '@/components/EmployeeCombobox';

const isMissingRescisaoSchema = (error: any) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === 'PGRST205' ||
    (text.includes('schema cache') && text.includes('rescisoes')) ||
    text.includes('could not find the table') ||
    text.includes('relation "public.rescisoes" does not exist') ||
    text.includes('relation "rescisoes" does not exist');
};

const RescisaoPage: React.FC = () => {
  const { session, employees, companies, refreshData } = useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [empId, setEmpId] = useState('');
  const [dataDesligamento, setDataDesligamento] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState<TipoRescisao>('sem_justa_causa');
  const [aviso, setAviso] = useState<AvisoPrevio>('indenizado');
  const [saldoFgts, setSaldoFgts] = useState(0);
  const [outrosDescontos, setOutrosDescontos] = useState(0);
  const [feriasVencidasMeses, setFeriasVencidasMeses] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const fetchList = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('rescisoes').select('*').order('created_at', { ascending: false });
    if (error) {
      if (isMissingRescisaoSchema(error)) {
        console.warn('Tabela de rescisoes ainda nao disponivel no Supabase:', error);
      } else {
        toast.error('Erro ao carregar rescisoes: ' + error.message);
      }
      setList([]);
    } else {
      setList(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const emp = employees.find((employee) => employee.id === empId);
  const empresa = emp ? companies.find((company) => company.id === emp.companyId) : null;

  const resultado = useMemo(() => {
    if (!emp) return null;
    return calcularRescisao({
      salarioBase: emp.salarioBase,
      dependentes: 0,
      dataAdmissao: emp.dataAdmissao || new Date().toISOString().slice(0, 10),
      dataDesligamento,
      tipo,
      aviso,
      saldoFgtsDepositado: saldoFgts,
      outrosDescontos,
      feriasVencidasMeses,
    });
  }, [emp, dataDesligamento, tipo, aviso, saldoFgts, outrosDescontos, feriasVencidasMeses]);

  const resultadoFromRow = (r: any) => ({
    diasAviso: Number(r.dias_aviso) || 0,
    saldoSalario: Number(r.saldo_salario) || 0,
    avisoPrevioValor: Number(r.aviso_previo_valor) || 0,
    feriasVencidas: Number(r.ferias_vencidas) || 0,
    feriasProporcionais: Number(r.ferias_proporcionais) || 0,
    tercoFerias: Number(r.terco_ferias) || 0,
    decimoTerceiro: Number(r.decimo_terceiro) || 0,
    inss: Number(r.inss) || 0,
    irrf: Number(r.irrf) || 0,
    fgtsMes: Number(r.fgts_mes) || 0,
    multaFgts: Number(r.multa_fgts) || 0,
    outrosDescontos: Number(r.outros_descontos) || 0,
    totalProventos: Number(r.total_proventos) || 0,
    totalDescontos: Number(r.total_descontos) || 0,
    liquido: Number(r.liquido) || 0,
    detalhe: {},
  });

  const rowToDocumento = (r: any) => buildRescisaoHtml({
    empresa: r.empresa_nome,
    funcionario: r.funcionario_nome,
    cargo: r.cargo,
    cpf: r.cpf || '-',
    admissao: r.data_admissao || '-',
    desligamento: r.data_desligamento,
    tipo: r.tipo_rescisao,
    aviso: r.aviso_previo,
    motivo: r.motivo,
    observacoes: r.observacoes,
    resultado: resultadoFromRow(r) as any,
  });

  const buildEmailBody = (r: any) => [
    'Solicito providencias para rescisao/desligamento do colaborador abaixo:',
    '',
    `Funcionario: ${r.funcionario_nome || ''}`,
    `CPF: ${r.cpf || ''}`,
    `Cargo: ${r.cargo || ''}`,
    `Empresa: ${r.empresa_nome || ''}`,
    `CNPJ: ${r.empresa_cnpj || ''}`,
    `Admissao: ${r.data_admissao || ''}`,
    `Desligamento: ${r.data_desligamento || ''}`,
    `Tipo de rescisao: ${tipoRescisaoLabel(r.tipo_rescisao)}`,
    `Aviso previo: ${r.aviso_previo || ''} (${Number(r.dias_aviso || 0)} dias)`,
    `Motivo: ${r.motivo || ''}`,
    '',
    'Resumo dos valores calculados:',
    `Saldo de salario: ${formatCurrency(Number(r.saldo_salario) || 0)}`,
    `Aviso previo: ${formatCurrency(Number(r.aviso_previo_valor) || 0)}`,
    `Ferias vencidas: ${formatCurrency(Number(r.ferias_vencidas) || 0)}`,
    `Ferias proporcionais: ${formatCurrency(Number(r.ferias_proporcionais) || 0)}`,
    `1/3 ferias: ${formatCurrency(Number(r.terco_ferias) || 0)}`,
    `13o proporcional: ${formatCurrency(Number(r.decimo_terceiro) || 0)}`,
    `FGTS do mes: ${formatCurrency(Number(r.fgts_mes) || 0)}`,
    `Multa FGTS: ${formatCurrency(Number(r.multa_fgts) || 0)}`,
    `Total proventos: ${formatCurrency(Number(r.total_proventos) || 0)}`,
    `Total descontos: ${formatCurrency(Number(r.total_descontos) || 0)}`,
    `Liquido previsto: ${formatCurrency(Number(r.liquido) || 0)}`,
    '',
    r.observacoes ? `Observacoes: ${r.observacoes}` : '',
    '',
    'Ficha preenchida automaticamente pelo TOPAC RH PRO.',
    'Atenciosamente.',
  ].filter((line) => line !== '').join('\n');

  const enviarEmailRescisao = (r: any) => {
    const unidade = [r.empresa_nome, r.empresa_municipio, r.empresa_uf].filter(Boolean).join(' ');
    const destinatarios = getDestinatariosRescisao(unidade);
    openEmailClient({
      to: destinatarios,
      cc: CC_OBRIGATORIO,
      subject: `Rescisao - ${r.funcionario_nome || ''} - ${r.empresa_nome || ''}`,
      body: buildEmailBody(r),
    });
    toast.success('E-mail de rescisao aberto com a ficha preenchida.');
  };

  const resetForm = () => {
    setEmpId('');
    setMotivo('');
    setObservacoes('');
    setSaldoFgts(0);
    setOutrosDescontos(0);
    setFeriasVencidasMeses(0);
  };

  const handleSalvar = async () => {
    if (!emp || !empresa || !resultado || !session) {
      toast.error('Selecione um funcionario');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        funcionario_id: emp.id,
        funcionario_nome: emp.name,
        company_id: emp.companyId,
        empresa_nome: empresa.name,
        empresa_cnpj: empresa.cnpj || null,
        empresa_municipio: empresa.city || null,
        cpf: emp.cpf || null,
        endereco: emp.endereco || null,
        cargo: emp.cargo,
        data_admissao: emp.dataAdmissao || null,
        data_desligamento: dataDesligamento,
        tipo_rescisao: tipo,
        motivo,
        aviso_previo: aviso,
        dias_aviso: resultado.diasAviso,
        salario_base: emp.salarioBase,
        dependentes: 0,
        saldo_fgts_depositado: saldoFgts,
        saldo_salario: resultado.saldoSalario,
        aviso_previo_valor: resultado.avisoPrevioValor,
        ferias_vencidas: resultado.feriasVencidas,
        ferias_proporcionais: resultado.feriasProporcionais,
        terco_ferias: resultado.tercoFerias,
        decimo_terceiro: resultado.decimoTerceiro,
        inss: resultado.inss,
        irrf: resultado.irrf,
        fgts_mes: resultado.fgtsMes,
        multa_fgts: resultado.multaFgts,
        outros_descontos: resultado.outrosDescontos,
        total_proventos: resultado.totalProventos,
        total_descontos: resultado.totalDescontos,
        liquido: resultado.liquido,
        observacoes,
        snapshot_json: resultado as any,
        status: 'finalizada',
        user_id: session.user.id,
        usuario_nome: session.user.email || '',
      };

      let saved: any = null;
      let persisted = true;
      const { data: savedData, error } = await supabase
        .from('rescisoes')
        .insert(payload)
        .select('*')
        .single();
      if (error) {
        if (!isMissingRescisaoSchema(error)) throw error;
        persisted = false;
        saved = payload;
        toast.warning('Tabela de rescisoes ainda nao esta criada no banco. Vou desligar e abrir o e-mail mesmo assim.');
      } else {
        saved = savedData || payload;
      }

      const observacaoDesligamento = [
        emp.observacoes,
        `[RESCISAO] Desligamento: ${dataDesligamento} | Tipo: ${tipoRescisaoLabel(tipo)} | Motivo: ${motivo || '-'}`,
      ].filter(Boolean).join('\n');

      const { error: employeeError } = await supabase
        .from('funcionarios')
        .update({
        status: 'desligado',
        observacoes: observacaoDesligamento,
      } as any)
        .eq('id', emp.id);

      if (employeeError) throw employeeError;

      toast.success(persisted
        ? 'Rescisao registrada, funcionario desligado e e-mail preparado.'
        : 'Funcionario desligado e e-mail preparado. Historico sera gravado quando a tabela estiver no banco.');
      setOpen(false);
      resetForm();
      await refreshData();
      if (persisted) await fetchList();
      else setList((prev) => [saved, ...prev]);
      enviarEmailRescisao(saved || payload);
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const imprimir = (r: any) => {
    printDocumentInPage(rowToDocumento(r));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><FileX className="w-6 h-6" /> Rescisoes</h1>
          <p className="text-sm text-muted-foreground">Calcule, registre, desligue o funcionario e prepare a ficha para envio.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Rescisao</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Rescisao</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Funcionario</Label>
                <EmployeeCombobox
                  value={empId || undefined}
                  onChange={(employee) => setEmpId(employee?.id || '')}
                  placeholder="Buscar por nome, CPF, funcao ou empresa..."
                />
              </div>
              {emp && (
                <div className="md:col-span-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                  <strong>Empresa:</strong> {empresa?.name} - <strong>Admissao:</strong> {emp.dataAdmissao || '-'} - <strong>CPF:</strong> {emp.cpf || '-'} - <strong>Salario:</strong> {formatCurrency(emp.salarioBase)}
                </div>
              )}
              <div>
                <Label>Data do desligamento</Label>
                <Input type="date" value={dataDesligamento} onChange={(e) => setDataDesligamento(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de rescisao</Label>
                <Select value={tipo} onValueChange={(value) => setTipo(value as TipoRescisao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_justa_causa">Sem justa causa (empregador)</SelectItem>
                    <SelectItem value="pedido_demissao">Pedido de demissao</SelectItem>
                    <SelectItem value="acordo_mutuo_484a">Acordo mutuo (Art. 484-A)</SelectItem>
                    <SelectItem value="justa_causa">Justa causa</SelectItem>
                    <SelectItem value="termino_contrato_experiencia">Termino de contrato de experiencia</SelectItem>
                    <SelectItem value="rescisao_indireta">Rescisao indireta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aviso previo</Label>
                <Select value={aviso} onValueChange={(value) => setAviso(value as AvisoPrevio)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trabalhado">Trabalhado</SelectItem>
                    <SelectItem value="indenizado">Indenizado</SelectItem>
                    <SelectItem value="dispensado">Dispensado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Saldo FGTS depositado (R$)</Label>
                <Input type="number" step="0.01" value={saldoFgts} onChange={(e) => setSaldoFgts(Number(e.target.value))} />
              </div>
              <div>
                <Label>Meses de ferias vencidas</Label>
                <Input type="number" value={feriasVencidasMeses} onChange={(e) => setFeriasVencidasMeses(Number(e.target.value))} placeholder="0 ou 12" />
              </div>
              <div>
                <Label>Outros descontos (R$)</Label>
                <Input type="number" step="0.01" value={outrosDescontos} onChange={(e) => setOutrosDescontos(Number(e.target.value))} />
              </div>
              <div className="md:col-span-2">
                <Label>Motivo</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Observacoes</Label>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>

              {resultado && (
                <div className="md:col-span-2 bg-muted p-3 rounded space-y-1 text-sm">
                  <div className="font-bold text-base mb-2">Previa dos calculos</div>
                  <div className="flex justify-between"><span>Saldo de salario</span><span>{formatCurrency(resultado.saldoSalario)}</span></div>
                  {resultado.avisoPrevioValor > 0 && <div className="flex justify-between"><span>Aviso previo indenizado ({resultado.diasAviso} dias)</span><span>{formatCurrency(resultado.avisoPrevioValor)}</span></div>}
                  {resultado.feriasVencidas > 0 && <div className="flex justify-between"><span>Ferias vencidas</span><span>{formatCurrency(resultado.feriasVencidas)}</span></div>}
                  {resultado.feriasProporcionais > 0 && <div className="flex justify-between"><span>Ferias proporcionais</span><span>{formatCurrency(resultado.feriasProporcionais)}</span></div>}
                  {resultado.tercoFerias > 0 && <div className="flex justify-between"><span>1/3 ferias</span><span>{formatCurrency(resultado.tercoFerias)}</span></div>}
                  {resultado.decimoTerceiro > 0 && <div className="flex justify-between"><span>13o proporcional</span><span>{formatCurrency(resultado.decimoTerceiro)}</span></div>}
                  {resultado.multaFgts > 0 && <div className="flex justify-between"><span>Multa FGTS</span><span>{formatCurrency(resultado.multaFgts)}</span></div>}
                  <div className="flex justify-between text-destructive"><span>(-) INSS</span><span>{formatCurrency(resultado.inss)}</span></div>
                  <div className="flex justify-between text-destructive"><span>(-) IRRF</span><span>{formatCurrency(resultado.irrf)}</span></div>
                  {resultado.outrosDescontos > 0 && <div className="flex justify-between text-destructive"><span>(-) Outros</span><span>{formatCurrency(resultado.outrosDescontos)}</span></div>}
                  <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2 text-success"><span>Liquido</span><span>{formatCurrency(resultado.liquido)}</span></div>
                  <div className="text-xs text-muted-foreground">Ao salvar, o funcionario sera marcado como desligado e o e-mail sera aberto com a ficha preenchida.</div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={!emp || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar e Enviar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Funcionario</th>
                <th className="p-2 text-left">Empresa</th>
                <th className="p-2 text-left">Desligamento</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-right">Liquido</th>
                <th className="p-2 text-center">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">{r.funcionario_nome}</td>
                  <td className="p-2">{r.empresa_nome}</td>
                  <td className="p-2">{r.data_desligamento}</td>
                  <td className="p-2"><Badge variant="outline">{tipoRescisaoLabel(r.tipo_rescisao)}</Badge></td>
                  <td className="p-2 text-right font-bold text-success">{formatCurrency(Number(r.liquido))}</td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => imprimir(r)} title="Imprimir ficha">
                      <Printer className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => enviarEmailRescisao(r)} title="Enviar por e-mail">
                      <Mail className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma rescisao registrada.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default RescisaoPage;
