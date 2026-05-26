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
import { Checkbox } from '@/components/ui/checkbox';
import type { AppRole } from '@/hooks/useUserRole';

interface UserWithRole {
  user_id: string;
  email: string;
  nome_completo: string;
  telefone?: string | null;
  cpf?: string | null;
  empresa?: string | null;
  filial?: string | null;
  cargo?: string | null;
  created_at: string;
  email_confirmed?: boolean;
  blocked?: boolean;
  roles: AppRole[];
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
const MODULE_ROLES: AppRole[] = ['financeiro', 'faturamento', 'almoxarifado', 'filial_matriz', 'filial_praia', 'filial_goiania', 'operacional', 'tecnico_campo', 'diretor_geral', 'admin'];

const rolePriority = (roles: AppRole[]) => ALL_ROLES.find((role) => roles.includes(role)) || null;
const normalizeRoles = (roles: unknown): AppRole[] => {
  const raw = Array.isArray(roles) ? roles : [];
  const clean = raw.filter((r): r is AppRole => ALL_ROLES.includes(r as AppRole));
  return Array.from(new Set(clean));
};

const GerenciarUsuariosPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data: adminUsersV2, error: adminV2Err } = await (supabase as any)
      .rpc('admin_listar_usuarios_v2');

    if (!adminV2Err && Array.isArray(adminUsersV2)) {
      setUsers(adminUsersV2.map((u: any) => {
        const roles = normalizeRoles(u.roles || (u.role ? [u.role] : []));
        return {
          user_id: u.user_id,
          email: u.email || '',
          nome_completo: u.nome_completo || '',
          telefone: u.telefone || null,
          cpf: u.cpf || null,
          empresa: u.empresa || null,
          filial: u.filial || null,
          cargo: u.cargo || null,
          created_at: u.created_at,
          email_confirmed: Boolean(u.email_confirmed),
          blocked: Boolean(u.blocked),
          roles,
          role: rolePriority(roles),
          role_id: u.role_id || null,
        };
      }));
      setLoading(false);
      return;
    }

    const { data: adminUsers, error: adminErr } = await (supabase as any)
      .rpc('admin_listar_usuarios');

    if (!adminErr && Array.isArray(adminUsers)) {
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('id, user_id, role');

      setUsers(adminUsers.map((u: any) => {
        const allRoles = normalizeRoles((rolesData || [])
          .filter((r: any) => r.user_id === u.user_id)
          .map((r: any) => r.role));
        const roles = allRoles.length ? allRoles : normalizeRoles(u.role ? [u.role] : []);
        return {
          user_id: u.user_id,
          email: u.email || '',
          nome_completo: u.nome_completo || '',
          telefone: u.telefone || null,
          cpf: u.cpf || null,
          empresa: u.empresa || null,
          filial: u.filial || null,
          cargo: u.cargo || null,
          created_at: u.created_at,
          email_confirmed: Boolean(u.email_confirmed),
          blocked: Boolean(u.blocked),
          roles,
          role: rolePriority(roles),
          role_id: u.role_id || null,
        };
      }));
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
        roles: r?.role ? [r.role as AppRole] : [],
        role: (r?.role as AppRole) || null,
        role_id: r?.id || null,
      };
    });

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const updateUserLocal = (userId: string, patch: Partial<UserWithRole>) => {
    setUsers((prev) => prev.map((user) => user.user_id === userId ? { ...user, ...patch } : user));
  };

  const setPrimaryRole = (userId: string, newRole: AppRole) => {
    const user = users.find((u) => u.user_id === userId);
    const current = user?.roles || [];
    const roles = normalizeRoles(newRole === 'usuario' ? ['usuario'] : [newRole, ...current.filter((r) => r !== 'usuario')]);
    updateUserLocal(userId, { roles, role: rolePriority(roles) });
  };

  const toggleModuleRole = (userId: string, moduleRole: AppRole, checked: boolean) => {
    const user = users.find((u) => u.user_id === userId);
    const current = user?.roles || [];
    const roles = normalizeRoles(
      checked
        ? [...current.filter((r) => r !== 'usuario'), moduleRole]
        : current.filter((r) => r !== moduleRole),
    );
    updateUserLocal(userId, { roles, role: rolePriority(roles) });
  };

  const handleSaveUser = async (userId: string) => {
    setSaving(userId);
    const user = users.find(u => u.user_id === userId);
    if (!user) {
      setSaving(null);
      return;
    }

    try {
      const rolesToSave = user.roles.filter((r) => r !== 'usuario');
      const { data, error } = await (supabase as any).rpc('admin_salvar_usuario_acesso', {
        p_user_id: userId,
        p_nome: user.nome_completo || '',
        p_telefone: user.telefone || '',
        p_cpf: user.cpf || '',
        p_empresa: user.empresa || '',
        p_filial: user.filial || '',
        p_cargo: user.cargo || '',
        p_roles: rolesToSave,
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'Falha ao salvar usuario');

      if (!rolesToSave.length && user.role_id) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
      } else if (!rolesToSave.length) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
      }

      toast.success('Usuario e modulos salvos');
      await fetchUsers();
    } catch (err: any) {
      toast.error('Erro ao salvar usuario: ' + (err.message || ''));
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

  const handleDelete = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    const ok = window.confirm(`Excluir o usuario ${user?.email || userId}? Esta acao remove o acesso.`);
    if (!ok) return;

    setSaving(userId);
    try {
      const { data, error } = await (supabase as any).rpc('admin_excluir_usuario', {
        p_user_id: userId,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'Falha ao excluir usuario');
      toast.success('Usuario excluido');
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel excluir o usuario.');
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase()) ||
    (u.cpf || '').includes(search) ||
    (u.empresa || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.filial || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.cargo || '').toLowerCase().includes(search.toLowerCase())
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
                <TableHeader><TableRow><TableHead>Usuario</TableHead><TableHead>Dados</TableHead><TableHead>Status</TableHead><TableHead>Perfil</TableHead><TableHead>Modulos liberados</TableHead><TableHead>Acoes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(user => {
                    const meta = user.role ? ROLE_LABELS[user.role] : null;
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-2">
                            <Input value={user.nome_completo || ''} onChange={(e) => updateUserLocal(user.user_id, { nome_completo: e.target.value })} placeholder="Nome completo" />
                            <div className="text-xs text-muted-foreground break-all">{user.email}</div>
                            <div className="text-xs text-muted-foreground">Cadastro: {user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '-'}</div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[280px]">
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={user.cpf || ''} onChange={(e) => updateUserLocal(user.user_id, { cpf: e.target.value })} placeholder="CPF" />
                            <Input value={user.cargo || ''} onChange={(e) => updateUserLocal(user.user_id, { cargo: e.target.value })} placeholder="Funcao" />
                            <Input value={user.empresa || ''} onChange={(e) => updateUserLocal(user.user_id, { empresa: e.target.value })} placeholder="Empresa" />
                            <Input value={user.filial || ''} onChange={(e) => updateUserLocal(user.user_id, { filial: e.target.value })} placeholder="Filial" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {user.blocked ? <Badge variant="destructive">Bloqueado</Badge> : user.email_confirmed ? <Badge className="bg-green-500 text-white">Email confirmado</Badge> : <Badge variant="secondary">Email pendente</Badge>}
                            {!user.role || user.role === 'usuario' ? <Badge variant="outline">Aguardando liberacao</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="space-y-2">
                            {meta ? <Badge className={`${meta.color} text-white`}>{meta.label}</Badge> : <Badge variant="outline">Sem perfil</Badge>}
                            <Select value={user.role || ''} onValueChange={(val) => setPrimaryRole(user.user_id, val as AppRole)} disabled={saving === user.user_id}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="Perfil principal..." /></SelectTrigger>
                              <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r].label}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">{meta?.portal || 'Sem portal liberado'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[320px]">
                          <div className="grid grid-cols-2 gap-2">
                            {MODULE_ROLES.map((r) => (
                              <label key={r} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                                <Checkbox checked={user.roles.includes(r)} onCheckedChange={(checked) => toggleModuleRole(user.user_id, r, checked === true)} disabled={saving === user.user_id} />
                                <span>{ROLE_LABELS[r].label}</span>
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => handleSaveUser(user.user_id)} disabled={saving === user.user_id}>Salvar</Button>
                            <Button size="sm" variant={user.blocked ? 'outline' : 'destructive'} onClick={() => handleBlock(user.user_id, !user.blocked)} disabled={saving === user.user_id}>
                              {user.blocked ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(user.user_id)} disabled={saving === user.user_id}>
                              Excluir
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
