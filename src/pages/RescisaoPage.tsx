import React, { useState, useEffect, useMemo } from 'react';
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
import { Plus, FileX, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { calcularRescisao, tipoRescisaoLabel, type TipoRescisao, type AvisoPrevio } from '@/lib/rescisaoCalc';
import { buildRescisaoHtml } from '@/lib/rescisaoPdf';
import { printDocumentInPage } from '@/lib/printInPage';
import { formatCurrency } from '@/lib/calculations';

const RescisaoPage: React.FC = () => {
  const { session, employees, companies } = useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
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
    const { data } = await supabase.from('rescisoes').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const emp = employees.find(e => e.id === empId);
  const empresa = emp ? companies.find(c => c.id === emp.companyId) : null;

  const resultado = useMemo(() => {
    if (!emp) return null;
    return calcularRescisao({
      salarioBase: emp.salarioBase,
      dependentes: 0,
      dataAdmissao: emp.dataAdmissao || new Date().toISOString().slice(0, 10),
      dataDesligamento,
      tipo, aviso,
      saldoFgtsDepositado: saldoFgts,
      outrosDescontos, feriasVencidasMeses,
    });
  }, [emp, dataDesligamento, tipo, aviso, saldoFgts, outrosDescontos, feriasVencidasMeses]);

  const handleSalvar = async () => {
    if (!emp || !empresa || !resultado || !session) {
      toast.error('Selecione um funcionário');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('rescisoes').insert({
        funcionario_id: emp.id,
        funcionario_nome: emp.name,
        company_id: emp.companyId,
        empresa_nome: empresa.name,
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
      });
      if (error) throw error;
      toast.success('Rescisão registrada com sucesso');
      setOpen(false);
      setEmpId(''); setMotivo(''); setObservacoes(''); setSaldoFgts(0); setOutrosDescontos(0);
      await fetchList();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const imprimir = (r: any) => {
    printDocumentInPage(buildRescisaoHtml({
      empresa: r.empresa_nome,
      funcionario: r.funcionario_nome,
      cargo: r.cargo,
      cpf: '—',
      admissao: r.data_admissao || '—',
      desligamento: r.data_desligamento,
      tipo: r.tipo_rescisao,
      aviso: r.aviso_previo,
      motivo: r.motivo,
      observacoes: r.observacoes,
      resultado: {
        diasAviso: r.dias_aviso,
        saldoSalario: Number(r.saldo_salario),
        avisoPrevioValor: Number(r.aviso_previo_valor),
        feriasVencidas: Number(r.ferias_vencidas),
        feriasProporcionais: Number(r.ferias_proporcionais),
        tercoFerias: Number(r.terco_ferias),
        decimoTerceiro: Number(r.decimo_terceiro),
        inss: Number(r.inss), irrf: Number(r.irrf), fgtsMes: Number(r.fgts_mes), multaFgts: Number(r.multa_fgts),
        outrosDescontos: Number(r.outros_descontos),
        totalProventos: Number(r.total_proventos),
        totalDescontos: Number(r.total_descontos),
        liquido: Number(r.liquido),
        detalhe: {},
      },
    }));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><FileX className="w-6 h-6" /> Rescisões</h1>
          <p className="text-sm text-muted-foreground">Calcule e registre rescisões trabalhistas (TRCT).</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Rescisão</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Rescisão</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Funcionário</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.status === 'ativo').map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name} — {e.cargo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {emp && (
                <div className="md:col-span-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                  <strong>Empresa:</strong> {empresa?.name} · <strong>Admissão:</strong> {emp.dataAdmissao || '—'} · <strong>Salário:</strong> {formatCurrency(emp.salarioBase)}
                </div>
              )}
              <div>
                <Label>Data do desligamento</Label>
                <Input type="date" value={dataDesligamento} onChange={e => setDataDesligamento(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de rescisão</Label>
                <Select value={tipo} onValueChange={v => setTipo(v as TipoRescisao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_justa_causa">Sem justa causa (empregador)</SelectItem>
                    <SelectItem value="pedido_demissao">Pedido de demissão</SelectItem>
                    <SelectItem value="acordo_mutuo_484a">Acordo mútuo (Art. 484-A)</SelectItem>
                    <SelectItem value="justa_causa">Justa causa</SelectItem>
                    <SelectItem value="termino_contrato_experiencia">Término de contrato de experiência</SelectItem>
                    <SelectItem value="rescisao_indireta">Rescisão indireta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aviso prévio</Label>
                <Select value={aviso} onValueChange={v => setAviso(v as AvisoPrevio)}>
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
                <Input type="number" step="0.01" value={saldoFgts} onChange={e => setSaldoFgts(Number(e.target.value))} />
              </div>
              <div>
                <Label>Meses de férias vencidas</Label>
                <Input type="number" value={feriasVencidasMeses} onChange={e => setFeriasVencidasMeses(Number(e.target.value))} placeholder="0 ou 12" />
              </div>
              <div>
                <Label>Outros descontos (R$)</Label>
                <Input type="number" step="0.01" value={outrosDescontos} onChange={e => setOutrosDescontos(Number(e.target.value))} />
              </div>
              <div className="md:col-span-2">
                <Label>Motivo</Label>
                <Input value={motivo} onChange={e => setMotivo(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} />
              </div>

              {resultado && (
                <div className="md:col-span-2 bg-muted p-3 rounded space-y-1 text-sm">
                  <div className="font-bold text-base mb-2">Prévia dos cálculos</div>
                  <div className="flex justify-between"><span>Saldo de salário</span><span>{formatCurrency(resultado.saldoSalario)}</span></div>
                  {resultado.avisoPrevioValor > 0 && <div className="flex justify-between"><span>Aviso prévio indenizado ({resultado.diasAviso} dias)</span><span>{formatCurrency(resultado.avisoPrevioValor)}</span></div>}
                  {resultado.feriasVencidas > 0 && <div className="flex justify-between"><span>Férias vencidas</span><span>{formatCurrency(resultado.feriasVencidas)}</span></div>}
                  {resultado.feriasProporcionais > 0 && <div className="flex justify-between"><span>Férias proporcionais</span><span>{formatCurrency(resultado.feriasProporcionais)}</span></div>}
                  {resultado.tercoFerias > 0 && <div className="flex justify-between"><span>1/3 férias</span><span>{formatCurrency(resultado.tercoFerias)}</span></div>}
                  {resultado.decimoTerceiro > 0 && <div className="flex justify-between"><span>13º proporcional</span><span>{formatCurrency(resultado.decimoTerceiro)}</span></div>}
                  {resultado.multaFgts > 0 && <div className="flex justify-between"><span>Multa FGTS</span><span>{formatCurrency(resultado.multaFgts)}</span></div>}
                  <div className="flex justify-between text-destructive"><span>(-) INSS</span><span>{formatCurrency(resultado.inss)}</span></div>
                  <div className="flex justify-between text-destructive"><span>(-) IRRF</span><span>{formatCurrency(resultado.irrf)}</span></div>
                  {resultado.outrosDescontos > 0 && <div className="flex justify-between text-destructive"><span>(-) Outros</span><span>{formatCurrency(resultado.outrosDescontos)}</span></div>}
                  <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2 text-success"><span>Líquido</span><span>{formatCurrency(resultado.liquido)}</span></div>
                  <div className="text-xs text-muted-foreground">FGTS do mês a depositar: {formatCurrency(resultado.fgtsMes)}</div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={!emp || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar Rescisão
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
                <th className="p-2 text-left">Funcionário</th>
                <th className="p-2 text-left">Empresa</th>
                <th className="p-2 text-left">Desligamento</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-right">Líquido</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">{r.funcionario_nome}</td>
                  <td className="p-2">{r.empresa_nome}</td>
                  <td className="p-2">{r.data_desligamento}</td>
                  <td className="p-2"><Badge variant="outline">{tipoRescisaoLabel(r.tipo_rescisao)}</Badge></td>
                  <td className="p-2 text-right font-bold text-success">{formatCurrency(Number(r.liquido))}</td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => imprimir(r)}><Printer className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma rescisão registrada.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default RescisaoPage;
