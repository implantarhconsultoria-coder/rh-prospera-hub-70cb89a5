import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Users, Shield, Loader2, Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import type { AppRole } from '@/hooks/useUserRole';

interface UserWithRole {
  user_id: string;
  email: string;
  nome_completo: string;
  created_at: string;
  role: AppRole | null;
  role_id: string | null;
}

const ROLE_LABELS: Record<AppRole, { label: string; color: string; portal: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-500', portal: 'Central Administrativa' },
  filial_praia: { label: 'Filial Praia Grande', color: 'bg-blue-500', portal: 'Portal RH Praia Grande' },
  filial_goiania: { label: 'Filial Goiânia', color: 'bg-emerald-500', portal: 'Portal RH Goiânia' },
  almoxarifado: { label: 'Almoxarifado', color: 'bg-amber-500', portal: 'Portal Filial' },
  tecnico_campo: { label: 'Técnico de Campo', color: 'bg-purple-500', portal: 'Portal Campo' },
  operacional: { label: 'Operacional', color: 'bg-teal-500', portal: 'Portal Operacional' },
  faturamento: { label: 'Faturamento', color: 'bg-indigo-500', portal: 'Portal Faturamento' },
  financeiro: { label: 'Financeiro', color: 'bg-cyan-600', portal: 'Portal Financeiro' },
  usuario: { label: 'Usuário Básico', color: 'bg-gray-500', portal: 'Sem portal' },
};

const ALL_ROLES: AppRole[] = ['admin', 'filial_praia', 'filial_goiania', 'almoxarifado', 'tecnico_campo', 'operacional', 'faturamento', 'financeiro', 'usuario'];

const GerenciarUsuariosPage: React.FC = () => {
  const { userRole, session } = useApp();
  const isAdmin = userRole === 'admin';
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, email, nome_completo, created_at')
      .order('created_at', { ascending: false });

    if (pErr) {
      toast.error('Erro ao carregar usuários');
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('id, user_id, role');

    const merged: UserWithRole[] = (profiles || []).map(p => {
      const r = roles?.find(r => r.user_id === p.user_id);
      return {
        user_id: p.user_id,
        email: p.email,
        nome_completo: p.nome_completo,
        created_at: p.created_at,
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
          .update({ role: newRole })
          .eq('id', user.role_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });
        if (error) throw error;
      }

      toast.success(`Role atribuída: ${ROLE_LABELS[newRole].label}`);
      await fetchUsers();
    } catch (err: any) {
      toast.error('Erro ao salvar role: ' + (err.message || ''));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (userId: string, nome: string) => {
    if (!isAdmin) { toast.error('Apenas o Admin pode excluir usuários'); return; }
    if (userId === session?.user?.id) { toast.error('Não é possível excluir o próprio usuário'); return; }
    setDeleting(userId);
    try {
      // Auditoria
      await supabase.from('acoes_log').insert({
        modulo: 'usuarios',
        entidade: 'profile',
        entidade_id: userId,
        acao: 'usuario_excluido',
        funcionario_nome: nome,
        empresa: '',
        user_id: session?.user?.id,
        user_email: session?.user?.email || '',
        observacao: `Usuário ${nome} excluído pelo admin.`,
      } as any);
      // Remove roles primeiro (FK)
      await supabase.from('user_roles').delete().eq('user_id', userId);
      // Remove acessos por CPF associados, se houver
      await supabase.from('funcionario_modulos').delete().eq('autorizado_por', userId);
      // Remove o profile (mantém auth.users — só admin Supabase pode apagar)
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
      toast.success('Usuário excluído da plataforma');
      await fetchUsers();
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e?.message || ''));
    } finally {
      setDeleting(null);
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
          <p className="text-sm text-muted-foreground">Controle centralizado de acesso de toda a plataforma — portais, roles e permissões</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Usuários', value: users.length, color: 'text-primary' },
          { label: 'Com Role', value: users.filter(u => u.role).length, color: 'text-success' },
          { label: 'Sem Role', value: users.filter(u => !u.role).length, color: 'text-warning' },
          { label: 'Admins', value: users.filter(u => u.role === 'admin').length, color: 'text-destructive' },
        ].map((s, i) => (
          <div key={i} className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            <p className={`text-xl font-bold font-display mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Usuários Cadastrados ({users.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead>Role / Perfil</TableHead>
                    <TableHead>Portal de Entrada</TableHead>
                    <TableHead>Alterar Role</TableHead>
                    {isAdmin && <TableHead className="text-right">Excluir</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(user => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">{user.nome_completo || '—'}</TableCell>
                      <TableCell className="text-sm">{user.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge className={`${ROLE_LABELS[user.role].color} text-white`}>
                            {ROLE_LABELS[user.role].label}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-500 border-orange-500">
                            Sem role
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.role ? ROLE_LABELS[user.role].portal : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={user.role || ''}
                            onValueChange={(val) => handleRoleChange(user.user_id, val as AppRole)}
                            disabled={saving === user.user_id}
                          >
                            <SelectTrigger className="w-52">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.map(r => (
                                <SelectItem key={r} value={r}>{ROLE_LABELS[r].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {saving === user.user_id && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                disabled={deleting === user.user_id || user.user_id === session?.user?.id}
                                title={user.user_id === session?.user?.id ? 'Não é possível excluir o próprio usuário' : 'Excluir usuário'}
                              >
                                {deleting === user.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir este usuário?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {user.nome_completo || user.email} — esta ação não pode ser desfeita. Permissões e
                                  acessos por CPF associados também serão removidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(user.user_id, user.nome_completo || user.email)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Access Control Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Referência de Portais e Permissões</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_ROLES.map(r => (
              <div key={r} className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <Badge className={`${ROLE_LABELS[r].color} text-white text-xs`}>{ROLE_LABELS[r].label}</Badge>
                <p className="text-xs text-muted-foreground">Portal: {ROLE_LABELS[r].portal}</p>
                <p className="text-[10px] text-muted-foreground/70">
                  {r === 'admin' && 'Acesso total — todos os módulos, empresas e configurações'}
                  {r === 'filial_praia' && 'Funcionários, Férias, ASO, Protocolos, Alertas — apenas Praia Grande'}
                  {r === 'filial_goiania' && 'Funcionários, Férias, ASO, Protocolos, Alertas — apenas Goiânia'}
                  {r === 'almoxarifado' && 'Estoque, entradas e saídas de materiais'}
                  {r === 'tecnico_campo' && 'Ponto, chamados, estoque do veículo, KM'}
                  {r === 'operacional' && 'Despacho e gestão de chamados técnicos'}
                  {r === 'usuario' && 'Acesso básico — aguardando atribuição de role'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GerenciarUsuariosPage;
