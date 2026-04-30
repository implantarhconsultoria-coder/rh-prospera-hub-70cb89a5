import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, Lock, Unlock, Plus, Search, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MODULOS = ['operacional','financeiro','faturamento','rh','almoxarifado','mecanicos','filial','compras','chamados','abastecimento','ponto','km','documentos','fechamento'];

const STATUS_OPCOES: { value: string; label: string; color: string }[] = [
  { value: 'ativo',     label: 'ATIVO',     color: 'bg-emerald-600 text-white' },
  { value: 'bloqueado', label: 'BLOQUEADO', color: 'bg-amber-600 text-white' },
  { value: 'ferias',    label: 'FÉRIAS',    color: 'bg-blue-600 text-white' },
  { value: 'desligado', label: 'DESLIGADO', color: 'bg-rose-600 text-white' },
];

interface FuncionarioRow { id: string; nome: string; cpf: string; cargo: string; setor: string | null; status: string; acesso_status: string | null; company_id: string; empresa_nome?: string; }
interface PermissaoRow { id: string; funcionario_id: string; modulo: string; status: string; ultimo_acesso_em: string | null; total_acessos: number; }
interface LogRow { id: string; cpf: string; modulo: string; unidade: string; resultado: string; motivo: string; created_at: string; funcionario_id: string | null; }

const fmtCpf = (cpf: string) => (cpf || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

const PermissoesFuncionariosPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [funcs, setFuncs] = useState<FuncionarioRow[]>([]);
  const [perms, setPerms] = useState<PermissaoRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [empresas, setEmpresas] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [filtroModulo, setFiltroModulo] = useState<string>('todos');
  const [novoModulo, setNovoModulo] = useState<string>('');
  const [funcAlvo, setFuncAlvo] = useState<string>('');

  const carregar = async () => {
    setLoading(true);
    const [{ data: e }, { data: f }, { data: p }, { data: l }] = await Promise.all([
      supabase.from('empresas').select('id,nome'),
      supabase.from('funcionarios').select('id,nome,cpf,cargo,setor,status,acesso_status,company_id').order('nome'),
      supabase.from('funcionario_modulos').select('id,funcionario_id,modulo,status,ultimo_acesso_em,total_acessos'),
      supabase.from('acesso_cpf_logs').select('id,cpf,modulo,unidade,resultado,motivo,created_at,funcionario_id').order('created_at', { ascending: false }).limit(50),
    ]);
    const mapE: Record<string,string> = {};
    (e || []).forEach((x: any) => { mapE[x.id] = x.nome; });
    setEmpresas(mapE);
    setFuncs((f as any) || []);
    setPerms((p as any) || []);
    setLogs((l as any) || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const permsByFunc = useMemo(() => {
    const m: Record<string, PermissaoRow[]> = {};
    perms.forEach(p => { (m[p.funcionario_id] ||= []).push(p); });
    return m;
  }, [perms]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcs.filter(f => {
      const mod = filtroModulo === 'todos' ? true : (permsByFunc[f.id] || []).some(p => p.modulo === filtroModulo);
      const txt = !q || f.nome.toLowerCase().includes(q) || (f.cpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
      return mod && txt;
    });
  }, [funcs, busca, filtroModulo, permsByFunc]);

  const adicionarPermissao = async () => {
    if (!funcAlvo || !novoModulo) return;
    const { error } = await supabase.from('funcionario_modulos').insert({ funcionario_id: funcAlvo, modulo: novoModulo, status: 'ativo', autorizado_por_nome: 'Admin' });
    if (error) { toast.error(error.message); return; }
    toast.success('Permissão criada');
    setFuncAlvo(''); setNovoModulo('');
    carregar();
  };

  const togglePermissao = async (perm: PermissaoRow) => {
    const novo = perm.status === 'ativo' ? 'bloqueado' : 'ativo';
    const { error } = await supabase.from('funcionario_modulos').update({ status: novo }).eq('id', perm.id);
    if (error) { toast.error(error.message); return; }
    toast.success(novo === 'ativo' ? 'Permissão reativada' : 'Permissão bloqueada');
    carregar();
  };

  const mudarStatusAcesso = async (func: FuncionarioRow, novoStatus: string) => {
    const { error } = await supabase
      .from('funcionarios')
      .update({
        acesso_status: novoStatus,
        // mantém status legado coerente para compatibilidade
        status: novoStatus === 'desligado' ? 'desligado' : 'ativo',
        acesso_atualizado_em: new Date().toISOString(),
      })
      .eq('id', func.id);
    if (error) { toast.error(error.message); return; }
    const labels: Record<string,string> = { ativo:'ATIVO', bloqueado:'BLOQUEADO', ferias:'FÉRIAS', desligado:'DESLIGADO' };
    toast.success(`${func.nome}: status alterado para ${labels[novoStatus] || novoStatus}`);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold font-display">Permissões por Funcionário</h1>
            <p className="text-xs text-muted-foreground">Cada acesso por CPF é vinculado a um funcionário oficial. Habilite/bloqueie módulos aqui.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={carregar}><Activity className="w-4 h-4 mr-2" /> Recarregar</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Conceder permissão</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <Select value={funcAlvo} onValueChange={setFuncAlvo}>
            <SelectTrigger><SelectValue placeholder="Funcionário" /></SelectTrigger>
            <SelectContent className="max-h-64">
              {funcs.map(f => <SelectItem key={f.id} value={f.id}>{f.nome} — {empresas[f.company_id] || ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={novoModulo} onValueChange={setNovoModulo}>
            <SelectTrigger><SelectValue placeholder="Módulo" /></SelectTrigger>
            <SelectContent>{MODULOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={adicionarPermissao} disabled={!funcAlvo || !novoModulo}>Adicionar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-sm">Funcionários ({filtrados.length})</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CPF…" className="pl-8 h-9 w-56" />
              </div>
              <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os módulos</SelectItem>
                  {MODULOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Empresa / Setor</TableHead>
                  <TableHead>Status do acesso</TableHead>
                  <TableHead>Módulos autorizados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map(f => {
                  const statusAtual = (f.acesso_status || (f.status === 'desligado' ? 'desligado' : 'ativo')).toLowerCase();
                  const statusOpt = STATUS_OPCOES.find(s => s.value === statusAtual) || STATUS_OPCOES[0];
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <div className="font-medium">{f.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{f.cargo}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{fmtCpf(f.cpf)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="block w-fit mb-1">{empresas[f.company_id] || '—'}</Badge>
                        {f.setor && <span className="text-[10px] text-muted-foreground">{f.setor}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={statusOpt.color}>{statusOpt.label}</Badge>
                          <Select value={statusAtual} onValueChange={(v) => mudarStatusAcesso(f, v)}>
                            <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPCOES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(permsByFunc[f.id] || []).length === 0 && <span className="text-xs text-muted-foreground">nenhum</span>}
                          {(permsByFunc[f.id] || []).map(p => (
                            <Button key={p.id} size="sm" variant={p.status === 'ativo' ? 'default' : 'secondary'} className="h-7 text-[11px]" onClick={() => togglePermissao(p)} title={`Clique para ${p.status === 'ativo' ? 'bloquear' : 'reativar'}`}>
                              {p.status === 'ativo' ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                              {p.modulo}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Últimos 50 acessos por CPF</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>CPF</TableHead><TableHead>Módulo / Unidade</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: ptBR })}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtCpf(l.cpf)}</TableCell>
                  <TableCell className="text-xs">{l.modulo} · {l.unidade}</TableCell>
                  <TableCell>
                    {l.resultado === 'autorizado'
                      ? <Badge className="bg-emerald-600 text-white">autorizado</Badge>
                      : <Badge variant="destructive" title={l.motivo}>{l.motivo || 'negado'}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PermissoesFuncionariosPage;
