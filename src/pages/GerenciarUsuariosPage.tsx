import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

const ROLE_LABELS: Record<AppRole, { label: string; color: string }> = {
  admin: { label: 'Administrador', color: 'bg-red-500' },
  filial_praia: { label: 'Filial Praia Grande', color: 'bg-blue-500' },
  filial_goiania: { label: 'Filial Goiânia', color: 'bg-emerald-500' },
  almoxarifado: { label: 'Almoxarifado', color: 'bg-amber-500' },
  tecnico_campo: { label: 'Técnico de Campo', color: 'bg-purple-500' },
  operacional: { label: 'Operacional', color: 'bg-teal-500' },
  usuario: { label: 'Usuário Básico', color: 'bg-gray-500' },
};

const GerenciarUsuariosPage: React.FC = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    // Get all profiles
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, email, nome_completo, created_at')
      .order('created_at', { ascending: false });

    if (pErr) {
      toast.error('Erro ao carregar usuários');
      setLoading(false);
      return;
    }

    // Get all roles
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
        // Update existing
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('id', user.role_id);
        if (error) throw error;
      } else {
        // Insert new
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
          <p className="text-sm text-muted-foreground">Atribua roles para controlar o acesso de cada usuário</p>
        </div>
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
                    <TableHead>Role Atual</TableHead>
                    <TableHead>Alterar Role</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={user.role || ''}
                            onValueChange={(val) => handleRoleChange(user.user_id, val as AppRole)}
                            disabled={saving === user.user_id}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="filial_praia">Filial Praia Grande</SelectItem>
                              <SelectItem value="filial_goiania">Filial Goiânia</SelectItem>
                              <SelectItem value="almoxarifado">Almoxarifado</SelectItem>
                              <SelectItem value="usuario">Usuário Básico</SelectItem>
                            </SelectContent>
                          </Select>
                          {saving === user.user_id && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GerenciarUsuariosPage;
