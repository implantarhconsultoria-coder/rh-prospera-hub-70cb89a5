import React, { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Shield, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

type DirectorUser = {
  user_id: string;
  nome_completo: string;
  email: string;
};

type PermissionRow = {
  id: string;
  director_user_id: string;
  modulo: string;
  permissao: string;
  expira_em: string;
  liberado_por_nome: string | null;
  liberado_em: string | null;
  motivo: string | null;
  ativo: boolean;
};

const MODULES = [
  { value: 'rh', label: 'RH / Funcionarios' },
  { value: 'fechamento', label: 'Fechamento' },
  { value: 'apontamento', label: 'Apontamento Contabilidade' },
  { value: 'ponto', label: 'Ponto' },
  { value: 'rescisoes', label: 'Rescisoes' },
  { value: 'aso', label: 'ASO' },
  { value: 'ferias', label: 'Ferias' },
  { value: 'epi', label: 'EPI' },
  { value: 'uniformes', label: 'Uniformes' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'solicitacoes_operacionais', label: 'Solicitacoes Operacionais' },
  { value: 'app_mecanico', label: 'App Mecanico' },
  { value: 'abastecimento', label: 'Abastecimento QR Code' },
  { value: 'frota', label: 'Frota / Documentos' },
  { value: 'compras', label: 'Compras' },
  { value: 'todos', label: 'Todos os modulos bloqueados' },
];

const missingSchema = (error: any) => {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return text.includes('could not find the table') || text.includes('schema cache') || text.includes('does not exist');
};

const localDateTimePlusHours = (hours: number) => {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

const PermissoesDiretorPage: React.FC = () => {
  const { session, userRoles, refreshDirectorPermissions } = useApp();
  const [directors, setDirectors] = useState<DirectorUser[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [directorId, setDirectorId] = useState('');
  const [modulo, setModulo] = useState('rh');
  const [permissao, setPermissao] = useState('editar');
  const [expiraEm, setExpiraEm] = useState(localDateTimePlusHours(8));
  const [motivo, setMotivo] = useState('');

  const isAdmin = userRoles.includes('admin');
  const directorName = useMemo(() => new Map(directors.map((d) => [d.user_id, d.nome_completo || d.email])), [directors]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }, { data: perms, error: permsError }] =
        await Promise.all([
          supabase.from('user_roles').select('user_id, role').eq('role', 'diretor_geral' as any),
          supabase.from('profiles').select('user_id, nome_completo, email').order('nome_completo'),
          (supabase as any)
            .from('director_temporary_permissions')
            .select('*')
            .eq('ativo', true)
            .order('expira_em', { ascending: true }),
        ]);

      if (rolesError) throw rolesError;
      if (profilesError) throw profilesError;
      if (permsError && !missingSchema(permsError)) throw permsError;

      const directorIds = new Set((roles || []).map((r: any) => r.user_id));
      const mappedDirectors = (profiles || []).filter((p: any) => directorIds.has(p.user_id));
      setDirectors(mappedDirectors as DirectorUser[]);
      setDirectorId((current) => current || mappedDirectors[0]?.user_id || '');
      setPermissions((perms || []) as PermissionRow[]);
    } catch (error: any) {
      toast.error(`Erro ao carregar permissoes do diretor: ${error?.message || 'tente novamente'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grantPermission = async () => {
    if (!isAdmin) {
      toast.error('Somente admin pode liberar permissao temporaria.');
      return;
    }
    if (!directorId || !expiraEm) {
      toast.error('Selecione diretor e prazo de liberacao.');
      return;
    }

    setSaving(true);
    try {
      const userName = session?.user?.user_metadata?.nome_completo || session?.user?.email || 'Admin';
      const payload = {
        director_user_id: directorId,
        modulo,
        permissao,
        expira_em: new Date(expiraEm).toISOString(),
        liberado_por: session?.user?.id || null,
        liberado_por_nome: userName,
        motivo: motivo || null,
        ativo: true,
      };
      const { data, error } = await (supabase as any)
        .from('director_temporary_permissions')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;

      await (supabase as any).from('director_permission_audit').insert({
        permission_id: data.id,
        director_user_id: directorId,
        acao: 'liberado',
        user_id: session?.user?.id || null,
        usuario_nome: userName,
        detalhes: payload,
      });

      toast.success('Permissao temporaria liberada.');
      setMotivo('');
      await Promise.all([load(), refreshDirectorPermissions()]);
    } catch (error: any) {
      toast.error(`Erro ao liberar permissao: ${error?.message || 'tente novamente'}`);
    } finally {
      setSaving(false);
    }
  };

  const revokePermission = async (permission: PermissionRow) => {
    setSaving(true);
    try {
      const userName = session?.user?.user_metadata?.nome_completo || session?.user?.email || 'Admin';
      const { error } = await (supabase as any)
        .from('director_temporary_permissions')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', permission.id);
      if (error) throw error;
      await (supabase as any).from('director_permission_audit').insert({
        permission_id: permission.id,
        director_user_id: permission.director_user_id,
        acao: 'revogado',
        user_id: session?.user?.id || null,
        usuario_nome: userName,
        detalhes: { modulo: permission.modulo, permissao: permission.permissao },
      });
      toast.success('Permissao revogada.');
      await Promise.all([load(), refreshDirectorPermissions()]);
    } catch (error: any) {
      toast.error(`Erro ao revogar permissao: ${error?.message || 'tente novamente'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card className="p-6 border-amber-500/40 bg-amber-500/5">
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground mt-2">Somente Rodrigo/admin pode liberar permissoes temporarias para o diretor.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Permissoes Temporarias do Diretor</h1>
            <p className="text-sm text-muted-foreground">Libere edicao por prazo controlado, com historico da acao.</p>
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Diretor</label>
            <select value={directorId} onChange={(e) => setDirectorId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              {directors.map((director) => (
                <option key={director.user_id} value={director.user_id}>{director.nome_completo || director.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Modulo liberado</label>
            <select value={modulo} onChange={(e) => setModulo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              {MODULES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo de permissao</label>
            <select value={permissao} onChange={(e) => setPermissao(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="visualizar">Visualizar</option>
              <option value="editar">Editar</option>
              <option value="total">Total temporario</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Valido ate</label>
            <Input type="datetime-local" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
          </div>
        </div>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da liberacao temporaria..." />
        <div className="flex justify-end">
          <Button onClick={grantPermission} disabled={saving || !directorId}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            Liberar temporariamente
          </Button>
        </div>
        {!directors.length && (
          <p className="text-sm text-amber-300">Nenhum usuario com perfil Diretor Geral encontrado. Cadastre/libere o perfil diretor em Gerenciar Usuarios primeiro.</p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-bold">Liberacoes ativas</h2>
        </div>
        <div className="space-y-3">
          {permissions.map((permission) => (
            <div key={permission.id} className="rounded-xl border border-border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold">{directorName.get(permission.director_user_id) || permission.director_user_id}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Modulo: {MODULES.find((m) => m.value === permission.modulo)?.label || permission.modulo} - Permissao: {permission.permissao} - Expira: {formatDate(permission.expira_em)}
                </div>
                {permission.motivo && <div className="text-xs text-muted-foreground mt-1">Motivo: {permission.motivo}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Ativa</Badge>
                <Button size="sm" variant="outline" onClick={() => revokePermission(permission)} disabled={saving}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Revogar
                </Button>
              </div>
            </div>
          ))}
          {!permissions.length && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma liberacao temporaria ativa.</div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default PermissoesDiretorPage;
