import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Link2, Copy, ExternalLink, Lock, Unlock, RefreshCw, Loader2, UserPlus, Trash2, Activity, Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildPublicAccessUrl } from '@/lib/publicOrigin';

interface Link {
  id: string;
  slug: string;
  nome: string;
  modulo: string;
  unidade: string;
  empresas_permitidas: string[];
  token: string;
  status: 'ativo' | 'bloqueado';
  total_acessos: number;
  ultimo_acesso_em: string | null;
}

interface AcessoCpf {
  id: string;
  cpf: string;
  nome: string;
  modulo: string;
  empresa: string;
  perfil: string;
  status: 'ativo' | 'bloqueado';
  ultimo_acesso_em: string | null;
  total_acessos: number;
  observacoes: string;
  created_at: string;
}

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

const buildUrl = (slug: string) => buildPublicAccessUrl(slug);

const LinksAcessoCpfPage: React.FC = () => {
  const [links, setLinks] = useState<Link[]>([]);
  const [acessos, setAcessos] = useState<AcessoCpf[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVer, setOpenVer] = useState<string | null>(null);
  const [openNovo, setOpenNovo] = useState(false);
  const [novo, setNovo] = useState({ cpf: '', nome: '', modulo: 'financeiro', empresa: 'TOPAC MATRIZ', perfil: 'usuario' });

  const carregar = async () => {
    setLoading(true);
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.from('links_acesso_publico').select('*').order('slug') as any,
      supabase.from('acessos_cpf').select('*').order('modulo, nome') as any,
    ]);
    setLinks((l || []) as Link[]);
    setAcessos((a || []) as AcessoCpf[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const copiar = (slug: string) => {
    const url = buildUrl(slug);
    navigator.clipboard.writeText(url);
    toast.success('Link copiado: ' + url);
  };

  const abrir = (slug: string) => window.open(buildUrl(slug), '_blank');

  const toggleStatus = async (link: Link) => {
    const novo = link.status === 'ativo' ? 'bloqueado' : 'ativo';
    const { error } = await (supabase as any).from('links_acesso_publico').update({ status: novo }).eq('id', link.id);
    if (error) toast.error('Erro: ' + error.message);
    else {
      toast.success(`Link ${novo === 'ativo' ? 'reativado' : 'bloqueado'}`);
      carregar();
    }
  };

  const regenerar = async (link: Link) => {
    if (!confirm(`Regenerar token de "${link.nome}"? O link antigo deixa de funcionar.`)) return;
    const { data, error } = await (supabase as any).rpc('gen_tecnico_access_token');
    if (error || !data) { toast.error('Erro ao gerar token'); return; }
    const { error: e2 } = await (supabase as any).from('links_acesso_publico').update({ token: data }).eq('id', link.id);
    if (e2) toast.error('Erro: ' + e2.message);
    else { toast.success('Novo token gerado'); carregar(); }
  };

  const toggleAcesso = async (a: AcessoCpf) => {
    const novoSt = a.status === 'ativo' ? 'bloqueado' : 'ativo';
    const { error } = await (supabase as any).from('acessos_cpf').update({ status: novoSt }).eq('id', a.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success(`CPF ${novoSt}`); carregar(); }
  };

  const removerAcesso = async (a: AcessoCpf) => {
    if (!confirm(`Remover acesso de ${a.nome} ao módulo ${a.modulo}?`)) return;
    const { error } = await (supabase as any).from('acessos_cpf').delete().eq('id', a.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Acesso removido'); carregar(); }
  };

  const salvarNovo = async () => {
    const cpfClean = novo.cpf.replace(/\D/g, '');
    if (cpfClean.length !== 11 || !novo.nome.trim()) {
      toast.error('Informe CPF (11 dígitos) e nome.');
      return;
    }
    const { error } = await (supabase as any).from('acessos_cpf').insert({
      cpf: cpfClean,
      nome: novo.nome.trim(),
      modulo: novo.modulo,
      empresa: novo.empresa,
      perfil: novo.perfil,
      status: 'ativo',
    });
    if (error) toast.error('Erro: ' + error.message);
    else {
      toast.success('Acesso cadastrado');
      setOpenNovo(false);
      setNovo({ cpf: '', nome: '', modulo: 'financeiro', empresa: 'TOPAC MATRIZ', perfil: 'usuario' });
      carregar();
    }
  };

  const atualizarCpf = async (id: string, cpfNovo: string) => {
    const clean = cpfNovo.replace(/\D/g, '');
    if (clean.length !== 11) { toast.error('CPF deve ter 11 dígitos'); return; }
    const { error } = await (supabase as any).from('acessos_cpf').update({ cpf: clean }).eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('CPF atualizado'); carregar(); }
  };

  const acessosDoLink = (modulo: string, unidade: string, empresas: string[]) =>
    acessos.filter((a) => {
      if (a.modulo !== modulo) return false;
      if (modulo === 'operacional' && empresas.length > 0) return empresas.includes(a.empresa);
      return true;
    });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Links de Acesso por CPF</h1>
          <p className="text-sm text-muted-foreground">
            Links permanentes para usuários acessarem módulos sem login. Cada CPF abre uma sessão isolada.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Links permanentes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acessos</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{l.modulo}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.unidade || '—'}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[260px] truncate" title={buildUrl(l.slug)}>
                    {buildUrl(l.slug)}
                  </TableCell>
                  <TableCell>
                    <Badge className={l.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{l.total_acessos}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.ultimo_acesso_em
                      ? formatDistanceToNow(new Date(l.ultimo_acesso_em), { addSuffix: true, locale: ptBR })
                      : 'nunca'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copiar(l.slug)} title="Copiar">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => abrir(l.slug)} title="Abrir">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenVer(l.id)} title="Ver autorizados">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(l)} title={l.status === 'ativo' ? 'Bloquear' : 'Reativar'}>
                        {l.status === 'ativo' ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => regenerar(l)} title="Regenerar token">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">CPFs autorizados ({acessos.length})</CardTitle>
          <Dialog open={openNovo} onOpenChange={setOpenNovo}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="w-4 h-4" /> Novo CPF</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cadastrar acesso por CPF</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">CPF</label>
                  <Input value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: formatCpf(e.target.value) })} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome completo" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Módulo</label>
                  <Select value={novo.modulo} onValueChange={(v) => setNovo({ ...novo, modulo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="faturamento">Faturamento</SelectItem>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="almoxarifado">Almoxarifado</SelectItem>
                      <SelectItem value="compras">Compras</SelectItem>
                      <SelectItem value="chamados">Chamados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Empresa / unidade</label>
                  <Select value={novo.empresa} onValueChange={(v) => setNovo({ ...novo, empresa: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TOPAC MATRIZ">TOPAC MATRIZ</SelectItem>
                      <SelectItem value="TOPAC FILIAL PRAIA GRANDE">TOPAC FILIAL PRAIA GRANDE</SelectItem>
                      <SelectItem value="TOPAC FILIAL GOIÂNIA">TOPAC FILIAL GOIÂNIA</SelectItem>
                      <SelectItem value="ALQUI OBRAS">ALQUI OBRAS</SelectItem>
                      <SelectItem value="LMT">LMT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={salvarNovo} className="w-full">Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acessos</TableHead>
                <TableHead>Último</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acessos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.nome}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Input
                      defaultValue={formatCpf(a.cpf)}
                      onBlur={(e) => {
                        const v = e.target.value.replace(/\D/g, '');
                        if (v && v !== a.cpf) atualizarCpf(a.id, v);
                      }}
                      className="h-7 w-36 text-xs"
                    />
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{a.modulo}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.empresa}</TableCell>
                  <TableCell>
                    <Badge className={a.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.total_acessos}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.ultimo_acesso_em
                      ? formatDistanceToNow(new Date(a.ultimo_acesso_em), { addSuffix: true, locale: ptBR })
                      : 'nunca'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleAcesso(a)} title={a.status === 'ativo' ? 'Bloquear' : 'Reativar'}>
                        {a.status === 'ativo' ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removerAcesso(a)} title="Remover">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: usuários autorizados de um link específico */}
      <Dialog open={!!openVer} onOpenChange={() => setOpenVer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Usuários autorizados do link</DialogTitle>
          </DialogHeader>
          {(() => {
            const l = links.find((x) => x.id === openVer);
            if (!l) return null;
            const lista = acessosDoLink(l.modulo, l.unidade, l.empresas_permitidas);
            return (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>{l.nome}</strong> — módulo <strong className="capitalize">{l.modulo}</strong>
                  {l.empresas_permitidas.length > 0 && <> · empresas: {l.empresas_permitidas.join(', ')}</>}
                </p>
                {l.modulo === 'operacional' && (
                  <p className="text-xs text-amber-600">
                    Operacional usa funcionários cadastrados em "App Operacional → Técnicos". A lista abaixo mostra apenas CPFs adicionais cadastrados manualmente.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>Empresa</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm">Nenhum CPF cadastrado para este link.</TableCell></TableRow>
                    ) : lista.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.nome}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCpf(a.cpf)}</TableCell>
                        <TableCell className="text-xs">{a.empresa}</TableCell>
                        <TableCell><Badge className={a.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'}>{a.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LinksAcessoCpfPage;
