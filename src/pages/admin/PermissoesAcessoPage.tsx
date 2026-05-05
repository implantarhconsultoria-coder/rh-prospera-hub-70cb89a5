import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, KeyRound, Save, ShieldCheck, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Search } from 'lucide-react';

interface FuncionarioSugestao {
  id: string;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  email: string | null;
  empresa: string | null;
}

type AppRole = 'admin' | 'filial_praia' | 'filial_goiania' | 'financeiro' | 'faturamento' | 'tecnico_campo';

const SENHA_PADRAO = 'TOPAC2026';

const ROLE_LABELS: Record<AppRole, { label: string; desc: string; cor: string }> = {
  admin:          { label: 'ADMIN',        desc: 'Acesso total à plataforma',                 cor: 'bg-red-100 text-red-700 border-red-300' },
  filial_praia:   { label: 'RH PRAIA',     desc: 'RH da TOPAC PRAIA GRANDE',                  cor: 'bg-blue-100 text-blue-700 border-blue-300' },
  filial_goiania: { label: 'RH GOIÂNIA',   desc: 'RH da TOPAC GOIÂNIA',                       cor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  financeiro:     { label: 'FINANCEIRO',   desc: 'Módulo financeiro (todas as empresas)',     cor: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  faturamento:    { label: 'FATURAMENTO',  desc: 'Módulo faturamento (todas as empresas)',    cor: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  tecnico_campo:  { label: 'MECÂNICOS',    desc: 'App operacional dos mecânicos',             cor: 'bg-amber-100 text-amber-700 border-amber-300' },
};
const ALL_ROLES: AppRole[] = ['admin','filial_praia','filial_goiania','financeiro','faturamento','tecnico_campo'];

interface UsuarioRow {
  user_id: string;
  email: string;
  nome: string | null;
  roles: AppRole[];
}

const CopyButton: React.FC<{ value: string; small?: boolean }> = ({ value, small }) => {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(()=>setOk(false),1500); toast.success('Copiado'); }
    catch { toast.error('Falha ao copiar'); }
  };
  return (
    <Button type="button" size={small ? 'sm' : 'sm'} variant="ghost" onClick={copiar} className="h-7 px-2">
      {ok ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
};

const PermissoesAcessoPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);

  const [openNovo, setOpenNovo] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novaSenha, setNovaSenha] = useState(SENHA_PADRAO);
  const [novosRoles, setNovosRoles] = useState<AppRole[]>([]);
  const [funcInfo, setFuncInfo] = useState<{ id?: string; cpf?: string; cargo?: string; empresa?: string } | null>(null);

  // autocomplete funcionários
  const [sugestoes, setSugestoes] = useState<FuncionarioSugestao[]>([]);
  const [buscandoFunc, setBuscandoFunc] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);

  // Modal pós-criação mostrando email + senha pra copiar
  const [criadoInfo, setCriadoInfo] = useState<{ email: string; senha: string } | null>(null);

  const [openSenha, setOpenSenha] = useState<UsuarioRow | null>(null);
  const [senhaNova, setSenhaNova] = useState('');

  // Busca funcionários conforme digita o nome
  useEffect(() => {
    if (!openNovo) return;
    const termo = novoNome.trim();
    if (termo.length < 2) { setSugestoes([]); return; }
    let cancel = false;
    setBuscandoFunc(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('funcionarios')
        .select('id, nome, cpf, cargo, email, empresas(nome)')
        .ilike('nome', `%${termo}%`)
        .eq('status', 'ativo')
        .order('nome')
        .limit(10);
      if (cancel) return;
      const mapped: FuncionarioSugestao[] = (data || []).map((f: any) => ({
        id: f.id, nome: f.nome, cpf: f.cpf, cargo: f.cargo, email: f.email,
        empresa: f.empresas?.nome || null,
      }));
      setSugestoes(mapped);
      setBuscandoFunc(false);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [novoNome, openNovo]);

  const escolherFuncionario = (f: FuncionarioSugestao) => {
    setNovoNome(f.nome);
    if (f.email && !novoEmail) setNovoEmail(f.email);
    setFuncInfo({ id: f.id, cpf: f.cpf || undefined, cargo: f.cargo || undefined, empresa: f.empresa || undefined });
    setShowSugestoes(false);
    setSugestoes([]);
  };

  const carregar = async () => {
    setLoading(true);
    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, email, nome_completo')
        .order('nome_completo');
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');
      const map = new Map<string, UsuarioRow>();
      (profs || []).forEach((p) => {
        map.set(p.user_id, {
          user_id: p.user_id,
          email: p.email || '',
          nome: p.nome_completo,
          roles: [],
        });
      });
      (roles || []).forEach((r) => {
        const u = map.get(r.user_id);
        if (u) u.roles.push(r.role as AppRole);
        else map.set(r.user_id, { user_id: r.user_id, email: '', nome: null, roles: [r.role as AppRole] });
      });
      setUsuarios(Array.from(map.values()).sort((a,b) => (a.nome || a.email).localeCompare(b.nome || b.email)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const callFn = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-criar-usuario', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const criarUsuario = async () => {
    const senhaFinal = (novaSenha || '').trim() || SENHA_PADRAO;
    if (!novoEmail.trim() || senhaFinal.length < 6 || novosRoles.length === 0) {
      toast.error('Preencha email, senha (mínimo 6) e ao menos 1 módulo'); return;
    }
    setBusy(true);
    try {
      const emailFinal = novoEmail.trim().toLowerCase();
      await callFn({
        action: 'create',
        email: emailFinal,
        password: senhaFinal,
        nome: novoNome,
        roles: novosRoles,
      });
      toast.success('Usuário criado');
      setCriadoInfo({ email: emailFinal, senha: senhaFinal });
      setOpenNovo(false);
      setNovoEmail(''); setNovoNome(''); setNovaSenha(SENHA_PADRAO); setNovosRoles([]); setFuncInfo(null);
      carregar();
    } catch (e) {
      toast.error('Erro: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const toggleRole = async (u: UsuarioRow, role: AppRole) => {
    const novos = u.roles.includes(role)
      ? u.roles.filter(r => r !== role)
      : [...u.roles, role];
    if (novos.length === 0) { toast.error('Usuário precisa ter ao menos 1 módulo'); return; }
    setBusy(true);
    try {
      await callFn({ action: 'update_roles', user_id: u.user_id, roles: novos });
      toast.success('Permissões atualizadas');
      carregar();
    } catch (e) {
      toast.error('Erro: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const resetSenha = async () => {
    const senhaFinal = (senhaNova || '').trim() || SENHA_PADRAO;
    if (!openSenha || senhaFinal.length < 6) { toast.error('Senha mínima de 6 caracteres'); return; }
    setBusy(true);
    try {
      await callFn({ action: 'reset_password', user_id: openSenha.user_id, password: senhaFinal });
      toast.success('Senha redefinida para: ' + senhaFinal);
      setOpenSenha(null); setSenhaNova('');
    } catch (e) {
      toast.error('Erro: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const apagar = async (u: UsuarioRow) => {
    if (!confirm(`Apagar o usuário ${u.email}?`)) return;
    setBusy(true);
    try {
      await callFn({ action: 'delete', user_id: u.user_id });
      toast.success('Usuário apagado');
      carregar();
    } catch (e) {
      toast.error('Erro: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Usuários e Permissões
          </h1>
          <p className="text-sm text-muted-foreground">Login por e-mail e senha. E-mails fictícios são aceitos (ex: paula@topac.app). Senha padrão: <strong>{SENHA_PADRAO}</strong></p>
        </div>
        <Button onClick={() => { setNovaSenha(SENHA_PADRAO); setOpenNovo(true); }}><Plus className="w-4 h-4 mr-1" /> Novo usuário</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Módulos disponíveis</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {ALL_ROLES.map(r => (
              <div key={r} className={`border rounded-lg p-3 ${ROLE_LABELS[r].cor}`}>
                <div className="font-bold text-xs">{ROLE_LABELS[r].label}</div>
                <div className="text-[11px] mt-1">{ROLE_LABELS[r].desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Usuários cadastrados ({usuarios.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário cadastrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">Nome / E-mail</th>
                    <th className="py-2">Módulos liberados</th>
                    <th className="py-2 w-32 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.user_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3">
                        <div className="font-medium">{u.nome || '—'}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{u.email}</span>
                          {u.email && <CopyButton value={u.email} small />}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_ROLES.map(r => {
                            const ativo = u.roles.includes(r);
                            return (
                              <button
                                key={r}
                                disabled={busy}
                                onClick={() => toggleRole(u, r)}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold border transition ${
                                  ativo ? ROLE_LABELS[r].cor : 'bg-muted text-muted-foreground border-transparent opacity-60 hover:opacity-100'
                                }`}
                                title={ROLE_LABELS[r].desc}
                              >
                                {ROLE_LABELS[r].label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => { setSenhaNova(SENHA_PADRAO); setOpenSenha(u); }} className="mr-1" title="Redefinir senha">
                          <KeyRound className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => apagar(u)} className="text-destructive hover:bg-destructive/10" title="Apagar">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar */}
      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Label>Nome completo</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={novoNome}
                  onChange={e => { setNovoNome(e.target.value); setShowSugestoes(true); setFuncInfo(null); }}
                  onFocus={() => setShowSugestoes(true)}
                  placeholder="Digite o nome do funcionário..."
                  autoComplete="off"
                />
              </div>
              {showSugestoes && novoNome.trim().length >= 2 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-auto">
                  {buscandoFunc ? (
                    <div className="p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</div>
                  ) : sugestoes.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">Nenhum funcionário encontrado. Você pode digitar livremente.</div>
                  ) : sugestoes.map(f => (
                    <button
                      key={f.id} type="button"
                      onClick={() => escolherFuncionario(f)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-0"
                    >
                      <div className="text-sm font-medium">{f.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[f.cargo, f.empresa, f.cpf].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {funcInfo && (
                <div className="mt-2 p-2 rounded-md bg-muted/40 border text-[11px] space-y-0.5">
                  <div><strong>Empresa:</strong> {funcInfo.empresa || '—'}</div>
                  <div><strong>Cargo:</strong> {funcInfo.cargo || '—'}</div>
                  <div><strong>CPF:</strong> {funcInfo.cpf || '—'} <span className="text-muted-foreground">(somente para vínculo, não usado no login)</span></div>
                </div>
              )}
            </div>
            <div>
              <Label>E-mail (pode ser fictício, ex: paula@topac.app)</Label>
              <Input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="paula@topac.app" autoCapitalize="none" />
            </div>
            <div>
              <Label>Senha inicial</Label>
              <div className="flex gap-2">
                <Input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="mínimo 6 caracteres" />
                <Button type="button" variant="outline" onClick={() => setNovaSenha(SENHA_PADRAO)}>Padrão</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Senha padrão sugerida: <strong>{SENHA_PADRAO}</strong></p>
            </div>
            <div>
              <Label>Módulos liberados</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {ALL_ROLES.map(r => (
                  <label key={r} className="flex items-start gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/30">
                    <Checkbox
                      checked={novosRoles.includes(r)}
                      onCheckedChange={(c) => setNovosRoles(prev => c ? [...prev, r] : prev.filter(x => x !== r))}
                    />
                    <div>
                      <div className="text-sm font-medium">{ROLE_LABELS[r].label}</div>
                      <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[r].desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNovo(false)}>Cancelar</Button>
            <Button onClick={criarUsuario} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pós-criação: copiar email + senha */}
      <Dialog open={!!criadoInfo} onOpenChange={(o) => !o && setCriadoInfo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Usuário criado com sucesso</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Copie e envie estes dados de acesso. A senha não será exibida novamente.</p>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">E-mail</Label>
              <div className="flex items-center gap-2 mt-1 p-2 border rounded-md bg-muted/30">
                <code className="flex-1 text-sm">{criadoInfo?.email}</code>
                {criadoInfo && <CopyButton value={criadoInfo.email} />}
              </div>
            </div>
            <div>
              <Label className="text-xs">Senha</Label>
              <div className="flex items-center gap-2 mt-1 p-2 border rounded-md bg-muted/30">
                <code className="flex-1 text-sm font-mono">{criadoInfo?.senha}</code>
                {criadoInfo && <CopyButton value={criadoInfo.senha} />}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCriadoInfo(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog senha */}
      <Dialog open={!!openSenha} onOpenChange={(o) => !o && setOpenSenha(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{openSenha?.email}</p>
          <div className="flex gap-2">
            <Input type="text" value={senhaNova} onChange={e => setSenhaNova(e.target.value)} placeholder="Nova senha (mínimo 6)" />
            <Button type="button" variant="outline" onClick={() => setSenhaNova(SENHA_PADRAO)}>Padrão</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenSenha(null); setSenhaNova(''); }}>Cancelar</Button>
            <Button onClick={resetSenha} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <KeyRound className="w-4 h-4 mr-1" />} Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissoesAcessoPage;
