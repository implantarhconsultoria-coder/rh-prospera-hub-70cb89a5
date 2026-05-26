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
  pending_id?: string | null;
  origem?: 'auth' | 'pendente' | string | null;
  email: string;
  nome_completo: string;
  telefone?: string | null;
  cpf?: string | null;
  empresa?: string | null;
  filial?: string | null;
  cargo?: string | null;
  created_at: string;
  email_confirmed?: boolean;
  email_confirmed_manual?: boolean;
  blocked?: boolean;
  status_cadastro?: string | null;
  email_rate_limited?: boolean;
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
const RATE_LIMIT_MESSAGE = 'Limite temporario de envio de e-mail atingido. O administrador podera liberar o acesso manualmente.';

const rolePriority = (roles: AppRole[]) => ALL_ROLES.find((role) => roles.includes(role)) || null;
const normalizeRoles = (roles: unknown): AppRole[] => {
  const raw = Array.isArray(roles) ? roles : [];
  const clean = raw.filter((r): r is AppRole => ALL_ROLES.includes(r as AppRole));
  return Array.from(new Set(clean));
};

const translateAdminError = (error?: string) => {
  switch (error) {
    case 'usuario_auth_nao_criado':
      return 'Cadastro pendente salvo, mas ainda nao existe usuario Auth. Use Reenviar confirmacao ou refaca o cadastro para criar a conta antes de aprovar.';
    case 'selecione_perfil_ou_modulo':
      return 'Selecione pelo menos um perfil ou modulo antes de aprovar.';
    case 'nao_autorizado':
      return 'Usuario atual nao autorizado para esta acao.';
    default:
      return error || 'Falha na operacao.';
  }
};

const isRateLimitError = (message?: string) => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('email rate') || normalized.includes('too many');
};

const GerenciarUsuariosPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const mapAdminUser = (u: any): UserWithRole => {
    const roles = normalizeRoles(u.roles || (u.role ? [u.role] : []));
    return {
      user_id: u.user_id,
      pending_id: u.pending_id || null,
      origem: u.origem || 'auth',
      email: u.email || '',
      nome_completo: u.nome_completo || '',
      telefone: u.telefone || null,
      cpf: u.cpf || null,
      empresa: u.empresa || null,
      filial: u.filial || null,
      cargo: u.cargo || null,
      created_at: u.created_at,
      email_confirmed: Boolean(u.email_confirmed),
      email_confirmed_manual: Boolean(u.email_confirmed_manual),
      blocked: Boolean(u.blocked),
      status_cadastro: u.status_cadastro || null,
      email_rate_limited: Boolean(u.email_rate_limited),
      roles,
      role: rolePriority(roles),
      role_id: u.role_id || null,
    };
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: adminUsersV2, error: adminV2Err } = await (supabase as any)
      .rpc('admin_listar_usuarios_v2');

    if (!adminV2Err && Array.isArray(adminUsersV2)) {
      setUsers(adminUsersV2.map(mapAdminUser));
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
          ...mapAdminUser(u),
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
        pending_id: null,
        origem: 'auth',
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

  const getActionKey = (user: UserWithRole) => user.user_id || user.pending_id || user.email;

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

  const saveAuthUser = async (user: UserWithRole) => {
    const rolesToSave = user.roles.filter((r) => r !== 'usuario');
    const { data, error } = await (supabase as any).rpc('admin_salvar_usuario_acesso', {
      p_user_id: user.user_id,
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

    if (!rolesToSave.length) {
      await supabase.from('user_roles').delete().eq('user_id', user.user_id);
    }
  };

  const approvePendingUser = async (user: UserWithRole) => {
    if (!user.pending_id) {
      await saveAuthUser(user);
      return;
    }

    const rolesToSave = user.roles.filter((r) => r !== 'usuario');
    const { data, error } = await (supabase as any).rpc('admin_aprovar_cadastro_pendente', {
      p_pending_id: user.pending_id,
      p_nome: user.nome_completo || '',
      p_telefone: user.telefone || '',
      p_cpf: user.cpf || '',
      p_empresa: user.empresa || '',
      p_filial: user.filial || '',
      p_cargo: user.cargo || '',
      p_roles: rolesToSave,
    });

    if (error) throw error;
    if (data?.ok === false) throw new Error(data.message || translateAdminError(data.error));
  };

  const handleSaveUser = async (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    if (!user) return;

    setSaving(getActionKey(user));
    try {
      if (user.origem === 'pendente') {
        await approvePendingUser(user);
      } else {
        await saveAuthUser(user);
      }
      toast.success('Usuario e modulos salvos');
      await fetchUsers();
    } catch (err: any) {
      toast.error('Erro ao salvar usuario: ' + translateAdminError(err.message));
    } finally {
      setSaving(null);
    }
  };

  const handleApproveUser = async (user: UserWithRole) => {
    setSaving(getActionKey(user));
    try {
      await approvePendingUser(user);
      toast.success('Usuario aprovado e liberado conforme modulos selecionados');
      await fetchUsers();
    } catch (error: any) {
      toast.error(translateAdminError(error?.message));
    } finally {
      setSaving(null);
    }
  };

  const handleConfirmEmail = async (user: UserWithRole) => {
    setSaving(getActionKey(user));
    try {
      const { data, error } = await (supabase as any).rpc('admin_confirmar_email_manual', {
        p_user_id: user.origem === 'auth' ? user.user_id : null,
        p_pending_id: user.pending_id || null,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'Falha ao confirmar email');
      toast.success('Email confirmado manualmente');
      await fetchUsers();
    } catch (error: any) {
      toast.error(translateAdminError(error?.message));
    } finally {
      setSaving(null);
    }
  };

  const handleResendConfirmation = async (user: UserWithRole) => {
    setSaving(getActionKey(user));
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      await (supabase as any).rpc('admin_marcar_reenvio_confirmacao', {
        p_email: user.email,
        p_ok: true,
        p_error: null,
      });
      toast.success('Confirmacao reenviada');
      await fetchUsers();
    } catch (error: any) {
      await (supabase as any).rpc('admin_marcar_reenvio_confirmacao', {
        p_email: user.email,
        p_ok: false,
        p_error: error?.message || 'resend_failed',
      });
      toast.error(isRateLimitError(error?.message) ? RATE_LIMIT_MESSAGE : (error?.message || 'Nao foi possivel reenviar confirmacao.'));
    } finally {
      setSaving(null);
    }
  };

  const handleBlock = async (user: UserWithRole, bloquear: boolean) => {
    setSaving(getActionKey(user));
    try {
      if (user.origem === 'pendente' && user.pending_id) {
        const { data, error } = await (supabase as any).rpc('admin_bloquear_cadastro_pendente', {
          p_pending_id: user.pending_id,
          p_bloquear: bloquear,
        });
        if (error) throw error;
        if (data?.ok === false) throw new Error(data.error || 'Falha ao alterar bloqueio');
      } else {
        const { data, error } = await (supabase as any).rpc('admin_bloquear_usuario', {
          p_user_id: user.user_id,
          p_bloquear: bloquear,
        });
        if (error) throw error;
        if (data?.ok === false) throw new Error(data.error || 'Falha ao alterar bloqueio');
      }
      toast.success(bloquear ? 'Usuario bloqueado' : 'Usuario desbloqueado');
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel alterar o bloqueio.');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (user: UserWithRole) => {
    const ok = window.confirm(`Excluir o usuario ${user.email || user.user_id}? Esta acao remove o acesso.`);
    if (!ok) return;

    setSaving(getActionKey(user));
    try {
      if (user.origem === 'pendente' && user.pending_id) {
        const { data, error } = await (supabase as any).rpc('admin_excluir_cadastro_pendente', {
          p_pending_id: user.pending_id,
        });
        if (error) throw error;
        if (data?.ok === false) throw new Error(data.error || 'Falha ao excluir cadastro pendente');
      } else {
        const { data, error } = await (supabase as any).rpc('admin_excluir_usuario', {
          p_user_id: user.user_id,
        });
        if (error) throw error;
        if (data?.ok === false) throw new Error(data.error || 'Falha ao excluir usuario');
      }
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

  const pendingCount = users.filter(u => u.origem === 'pendente' || !u.role || u.role === 'usuario' || (u.status_cadastro === 'email_rate_limit' && !u.email_confirmed)).length;

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
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Pendentes</p><p className="text-xl font-bold text-warning">{pendingCount}</p></div>
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
                    const actionKey = getActionKey(user);
                    const isSaving = saving === actionKey;
                    return (
                      <TableRow key={`${user.origem || 'auth'}-${user.user_id}`}>
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
                            {user.email_confirmed_manual ? <Badge className="bg-emerald-600 text-white">Confirmado manual</Badge> : null}
                            {user.email_rate_limited || (user.status_cadastro === 'email_rate_limit' && !user.email_confirmed) ? <Badge variant="destructive">Rate limit e-mail</Badge> : null}
                            {user.origem === 'pendente' ? <Badge variant="outline">Cadastro pendente</Badge> : null}
                            {!user.role || user.role === 'usuario' ? <Badge variant="outline">Aguardando liberacao</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="space-y-2">
                            {meta ? <Badge className={`${meta.color} text-white`}>{meta.label}</Badge> : <Badge variant="outline">Sem perfil</Badge>}
                            <Select value={user.role || ''} onValueChange={(val) => setPrimaryRole(user.user_id, val as AppRole)} disabled={isSaving}>
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
                                <Checkbox checked={user.roles.includes(r)} onCheckedChange={(checked) => toggleModuleRole(user.user_id, r, checked === true)} disabled={isSaving} />
                                <span>{ROLE_LABELS[r].label}</span>
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => handleSaveUser(user.user_id)} disabled={isSaving}>Salvar</Button>
                            <Button size="sm" variant="default" onClick={() => handleApproveUser(user)} disabled={isSaving}>
                              Aprovar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleResendConfirmation(user)} disabled={isSaving || !user.email}>
                              Reenviar confirmacao
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleConfirmEmail(user)} disabled={isSaving}>
                              Confirmar email
                            </Button>
                            <Button size="sm" variant={user.blocked ? 'outline' : 'destructive'} onClick={() => handleBlock(user, !user.blocked)} disabled={isSaving}>
                              {user.blocked ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(user)} disabled={isSaving}>
                              Excluir
                            </Button>
                            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
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
