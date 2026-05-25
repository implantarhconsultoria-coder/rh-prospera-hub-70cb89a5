import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Shield, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AppRole } from '@/hooks/useUserRole';

interface UserWithRole {
  user_id: string;
  email: string;
  nome_completo: string;
  telefone?: string | null;
  cpf?: string | null;
  empresa?: string | null;
  filial?: string | null;
  created_at: string;
  email_confirmed?: boolean;
  blocked?: boolean;
  role: AppRole | null;
  role_id: string | null;
}

const ROLE_LABELS: Record<AppRole, { label: string; color: string; portal: string; note: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-500', portal: 'Central Administrativa', note: 'Acesso total.' },
  filial_matriz: { label: 'Filial Matriz', color: 'bg-cyan-500', portal: 'Portal RH Matriz', note: 'Somente dados da Matriz.' },
  filial_praia: { label: 'Filial Praia Grande', color: 'bg-blue-500', portal: 'Portal RH Praia Grande', note: 'Somente dados de Praia Grande.' },
  filial_goiania: { label: 'Filial Goiania', color: 'bg-emerald-500', portal: 'Portal RH Goiania', note: 'Somente dados de Goiania.' },
  diretor_geral: { label: 'Diretor Geral', color: 'bg-rose-600', portal: 'Visao Executiva', note: 'Acesso executivo de leitura.' },
  almoxarifado: { label: 'Almoxarifado', color: 'bg-amber-500', portal: 'Portal Almoxarifado', note: 'Estoque e movimentacoes.' },
  tecnico_campo: { label: 'Tecnico de Campo', color: 'bg-purple-500', portal: 'Portal Campo', note: 'Acesso tecnico restrito.' },
  operacional: { label: 'Mecanico', color: 'bg-teal-500', portal: 'App Mecanico', note: 'App tecnico operacional.' },
  faturamento: { label: 'Faturamento', color: 'bg-indigo-500', portal: 'Portal Faturamento', note: 'Contratos e faturamento.' },
  financeiro: { label: 'Financeiro', color: 'bg-cyan-600', portal: 'Portal Financeiro', note: 'Acesso financeiro consolidado.' },
  usuario: { label: 'Usuario Basico', color: 'bg-gray-500', portal: 'Sem portal', note: 'Aguardando permissao.' },
};

const ALL_ROLES: AppRole[] = ['admin', 'diretor_geral', 'filial_matriz', 'filial_praia', 'filial_goiania', 'almoxarifado', 'tecnico_campo', 'operacional', 'faturamento', 'financeiro', 'usuario'];

const GerenciarUsuariosPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data: adminUsers, error: adminErr } = await (supabase as any)
      .rpc('admin_listar_usuarios');

    if (!adminErr && Array.isArray(adminUsers)) {
      setUsers(adminUsers.map((u: any) => ({
        user_id: u.user_id,
        email: u.email || '',
        nome_completo: u.nome_completo || '',
        telefone: u.telefone || null,
        cpf: u.cpf || null,
        empresa: u.empresa || null,
        filial: u.filial || null,
        created_at: u.created_at,
        email_confirmed: Boolean(u.email_confirmed),
        blocked: Boolean(u.blocked),
        role: (u.role as AppRole) || null,
        role_id: u.role_id || null,
      })));
      setLoading(false);
      return;
    }

    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, email, nome_completo, telefone, created_at')
      .order('created_at', { ascending: false });

    if (pErr) {
      toast.error('Erro ao carregar usuarios');
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('id, user_id, role');

    const merged: UserWithRole[] = (profiles || []).map((p: any) => {
      const r = roles?.find((role: any) => role.user_id === p.user_id);
      return {
        user_id: p.user_id,
        email: p.email || '',
        nome_completo: p.nome_completo || '',
        telefone: p.telefone || null,
        created_at: p.created_at,
        email_confirmed: false,
        blocked: false,
        role: (r?.role as AppRole) || null,
        role_id: r?.id || null,
      };
    });

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setSaving(userId);
    const user = users.find(u => u.user_id === userId);

    try {
      if (user?.role_id) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole } as any)
          .eq('id', user.role_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole } as any);
        if (error) throw error;
      }

      toast.success(`Perfil salvo: ${ROLE_LABELS[newRole].label}`);
      await fetchUsers();
    } catch (err: any) {
      toast.error('Erro ao salvar perfil: ' + (err.message || ''));
    } finally {
      setSaving(null);
    }
  };

  const handleBlock = async (userId: string, bloquear: boolean) => {
    setSaving(userId);
    try {
      const { data, error } = await (supabase as any).rpc('admin_bloquear_usuario', {
        p_user_id: userId,
        p_bloquear: bloquear,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'Falha ao alterar bloqueio');
      toast.success(bloquear ? 'Usuario bloqueado' : 'Usuario desbloqueado');
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel alterar o bloqueio.');
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    (u.cpf || '').includes(search) ||
    (u.empresa || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Usuarios</h1>
          <p className="text-sm text-muted-foreground">Controle centralizado de acessos, perfis e portais.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Total</p><p className="text-xl font-bold text-primary">{users.length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Pendentes</p><p className="text-xl font-bold text-warning">{users.filter(u => !u.role || u.role === 'usuario').length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Confirmados</p><p className="text-xl font-bold text-success">{users.filter(u => u.email_confirmed).length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Bloqueados</p><p className="text-xl font-bold text-destructive">{users.filter(u => u.blocked).length}</p></div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Users className="w-5 h-5" /> Usuarios Cadastrados</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar por nome, email ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button variant="outline" size="sm" onClick={fetchUsers}>Atualizar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>CPF</TableHead><TableHead>Empresa/Filial</TableHead><TableHead>Status</TableHead><TableHead>Cadastro</TableHead><TableHead>Perfil</TableHead><TableHead>Portal</TableHead><TableHead>Alterar</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(user => {
                    const meta = user.role ? ROLE_LABELS[user.role] : null;
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">{user.nome_completo || '-'}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell className="text-xs">{user.cpf || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{[user.empresa, user.filial].filter(Boolean).join(' / ') || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {user.blocked ? <Badge variant="destructive">Bloqueado</Badge> : user.email_confirmed ? <Badge className="bg-green-500 text-white">Email confirmado</Badge> : <Badge variant="secondary">Email pendente</Badge>}
                            {!user.role || user.role === 'usuario' ? <Badge variant="outline">Aguardando liberacao</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '-'}</TableCell>
                        <TableCell>{meta ? <Badge className={`${meta.color} text-white`}>{meta.label}</Badge> : <Badge variant="outline">Sem perfil</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{meta?.portal || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Select value={user.role || ''} onValueChange={(val) => handleRoleChange(user.user_id, val as AppRole)} disabled={saving === user.user_id}>
                              <SelectTrigger className="w-52"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                              <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r].label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" variant={user.blocked ? 'outline' : 'destructive'} onClick={() => handleBlock(user.user_id, !user.blocked)} disabled={saving === user.user_id}>
                              {user.blocked ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                            {saving === user.user_id && <Loader2 className="w-4 h-4 animate-spin" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Referencia de portais e permissoes</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_ROLES.map(r => <div key={r} className="bg-muted/30 rounded-lg p-3 text-sm space-y-1"><Badge className={`${ROLE_LABELS[r].color} text-white text-xs`}>{ROLE_LABELS[r].label}</Badge><p className="text-xs text-muted-foreground">{ROLE_LABELS[r].portal}</p><p className="text-[10px] text-muted-foreground/70">{ROLE_LABELS[r].note}</p></div>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GerenciarUsuariosPage;
