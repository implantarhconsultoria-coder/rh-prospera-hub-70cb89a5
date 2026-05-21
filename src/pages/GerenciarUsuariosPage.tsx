import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Shield, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AppRole } from '@/hooks/useUserRole';

interface UserWithRole {
  user_id: string;
  email: string;
  nome_completo: string;
  created_at: string;
  role: AppRole | null;
  role_id: string | null;
}

const ROLE_LABELS: Record<AppRole, { label: string; color: string; portal: string; note: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-500', portal: 'Central Administrativa', note: 'Acesso total.' },
  filial_matriz: { label: 'Filial Matriz', color: 'bg-cyan-500', portal: 'Portal RH Matriz', note: 'Somente dados da Matriz.' },
  filial_praia: { label: 'Filial Praia Grande', color: 'bg-blue-500', portal: 'Portal RH Praia Grande', note: 'Somente dados de Praia Grande.' },
  filial_goiania: { label: 'Filial Goiania', color: 'bg-emerald-500', portal: 'Portal RH Goiania', note: 'Somente dados de Goiania.' },
  almoxarifado: { label: 'Almoxarifado', color: 'bg-amber-500', portal: 'Portal Almoxarifado', note: 'Estoque e movimentacoes.' },
  tecnico_campo: { label: 'Tecnico de Campo', color: 'bg-purple-500', portal: 'Portal Campo', note: 'Acesso tecnico restrito.' },
  operacional: { label: 'Mecanico', color: 'bg-teal-500', portal: 'App Mecanico', note: 'App tecnico operacional.' },
  faturamento: { label: 'Faturamento', color: 'bg-indigo-500', portal: 'Portal Faturamento', note: 'Contratos e faturamento.' },
  financeiro: { label: 'Financeiro', color: 'bg-cyan-600', portal: 'Portal Financeiro', note: 'Acesso financeiro consolidado.' },
  usuario: { label: 'Usuario Basico', color: 'bg-gray-500', portal: 'Sem portal', note: 'Aguardando permissao.' },
};

const ALL_ROLES: AppRole[] = ['admin', 'filial_matriz', 'filial_praia', 'filial_goiania', 'almoxarifado', 'tecnico_campo', 'operacional', 'faturamento', 'financeiro', 'usuario'];

const GerenciarUsuariosPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, email, nome_completo, created_at')
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

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.nome_completo.toLowerCase().includes(search.toLowerCase())
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
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Com perfil</p><p className="text-xl font-bold text-success">{users.filter(u => u.role).length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Sem perfil</p><p className="text-xl font-bold text-warning">{users.filter(u => !u.role).length}</p></div>
        <div className="card-premium p-4"><p className="text-[10px] text-muted-foreground uppercase">Admins</p><p className="text-xl font-bold text-destructive">{users.filter(u => u.role === 'admin').length}</p></div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Users className="w-5 h-5" /> Usuarios Cadastrados</CardTitle>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Cadastro</TableHead><TableHead>Perfil</TableHead><TableHead>Portal</TableHead><TableHead>Alterar</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(user => {
                    const meta = user.role ? ROLE_LABELS[user.role] : null;
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">{user.nome_completo || '-'}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '-'}</TableCell>
                        <TableCell>{meta ? <Badge className={`${meta.color} text-white`}>{meta.label}</Badge> : <Badge variant="outline">Sem perfil</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{meta?.portal || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select value={user.role || ''} onValueChange={(val) => handleRoleChange(user.user_id, val as AppRole)} disabled={saving === user.user_id}>
                              <SelectTrigger className="w-52"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                              <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r].label}</SelectItem>)}</SelectContent>
                            </Select>
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
