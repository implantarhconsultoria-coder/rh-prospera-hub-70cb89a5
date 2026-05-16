import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Users, Edit, Eye, Sparkles, UploadCloud } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Cliente {
  id: string; razao_social: string; nome_fantasia: string; cnpj_cpf: string;
  email: string; telefone: string; cidade: string; uf: string; status: string;
}

const empty: Partial<Cliente> = { razao_social: '', nome_fantasia: '', cnpj_cpf: '', email: '', telefone: '', cidade: '', uf: '', status: 'ativo' };

const ClientesFatPage: React.FC = () => {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [open, setOpen] = useState(false);
  const [smartMode, setSmartMode] = useState(false);
  const [arquivoNome, setArquivoNome] = useState('');
  const [form, setForm] = useState<Partial<Cliente> & { observacoes?: string; endereco?: string; cep?: string; contato_responsavel?: string; inscricao_estadual?: string }>(empty);
  const [editId, setEditId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('clientes_fat').select('*').order('razao_social');
    setClientes((data || []) as Cliente[]);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, []);

  const filtrados = clientes.filter(c =>
    c.razao_social?.toLowerCase().includes(busca.toLowerCase()) ||
    c.nome_fantasia?.toLowerCase().includes(busca.toLowerCase()) ||
    c.cnpj_cpf?.includes(busca)
  );

  const abrirNovo = () => { setSmartMode(false); setArquivoNome(''); setForm(empty); setEditId(null); setOpen(true); };
  const abrirNovoInteligente = () => {
    setSmartMode(true);
    setArquivoNome('');
    setEditId(null);
    setForm({
      ...empty,
      observacoes: 'Cliente iniciado pelo Cadastro Inteligente. Envie o documento, confira os dados e salve somente após validação.',
    });
    setOpen(true);
  };
  const abrirEdicao = (c: Cliente) => { setSmartMode(false); setArquivoNome(''); setForm(c); setEditId(c.id); setOpen(true); };

  const carregarDocumento = (file?: File) => {
    if (!file) return;
    setArquivoNome(file.name);
    setForm({
      ...form,
      observacoes: `${form.observacoes || ''}\nDocumento recebido para conferência inteligente: ${file.name}`.trim(),
    });
    toast.success('Documento anexado. Confira/preencha os dados antes de salvar.');
  };

  const salvar = async () => {
    if (!form.razao_social) { toast.error('Razão social é obrigatória'); return; }
    if (editId) {
      const { error } = await supabase.from('clientes_fat').update(form as any).eq('id', editId);
      if (error) return toast.error(error.message);
      toast.success('Cliente atualizado');
    } else {
      const { error } = await supabase.from('clientes_fat').insert(form as any);
      if (error) return toast.error(error.message);
      toast.success(smartMode ? 'Cliente inteligente salvo após conferência' : 'Cliente cadastrado');
    }
    setOpen(false);
    carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Clientes</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} clientes cadastrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={abrirNovoInteligente} className="btn-secondary flex items-center gap-2 border-primary/40 text-primary"><Sparkles className="w-4 h-4" /> Novo Cliente Inteligente</button>
          <button onClick={abrirNovo} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Cliente</button>
        </div>
      </div>

      <div className="card-premium p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, fantasia ou CNPJ..." className="bg-transparent outline-none flex-1 text-sm" />
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Razão Social</th>
              <th className="text-left p-3">Fantasia</th>
              <th className="text-left p-3">CNPJ/CPF</th>
              <th className="text-left p-3">Cidade/UF</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
            ) : filtrados.map(c => (
              <tr key={c.id} className="border-t border-border hover:bg-sidebar-accent/10">
                <td className="p-3 font-medium">{c.razao_social}</td>
                <td className="p-3 text-muted-foreground">{c.nome_fantasia || '—'}</td>
                <td className="p-3 text-muted-foreground">{c.cnpj_cpf || '—'}</td>
                <td className="p-3 text-muted-foreground">{c.cidade ? `${c.cidade}/${c.uf}` : '—'}</td>
                <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{c.status}</span></td>
                <td className="p-3 text-right">
                  <button onClick={() => navigate(`/admin/faturamento/clientes/${c.id}`)} className="p-1.5 hover:bg-sidebar-accent rounded mr-1" title="Ver detalhe"><Eye className="w-4 h-4" /></button>
                  <button onClick={() => abrirEdicao(c)} className="p-1.5 hover:bg-sidebar-accent rounded" title="Editar"><Edit className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? 'Editar Cliente' : smartMode ? 'Novo Cliente Inteligente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
          {smartMode && (
            <label className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 text-center hover:bg-primary/10">
              <UploadCloud className="mb-2 h-8 w-8 text-primary" />
              <span className="font-semibold">Enviar PDF, foto ou print do cliente</span>
              <span className="text-xs text-muted-foreground">O arquivo fica registrado na observação. Confira os campos antes de salvar.</span>
              {arquivoNome && <span className="mt-2 text-xs text-primary">Arquivo: {arquivoNome}</span>}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => carregarDocumento(e.target.files?.[0])} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Razão Social *</Label><Input value={form.razao_social || ''} onChange={e => setForm({ ...form, razao_social: e.target.value })} /></div>
            <div><Label>Nome Fantasia</Label><Input value={form.nome_fantasia || ''} onChange={e => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
            <div><Label>CNPJ/CPF</Label><Input value={form.cnpj_cpf || ''} onChange={e => setForm({ ...form, cnpj_cpf: e.target.value })} /></div>
            <div><Label>Inscrição Estadual</Label><Input value={form.inscricao_estadual || ''} onChange={e => setForm({ ...form, inscricao_estadual: e.target.value })} /></div>
            <div><Label>Contato Responsável</Label><Input value={form.contato_responsavel || ''} onChange={e => setForm({ ...form, contato_responsavel: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone || ''} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
            <div className="col-span-2"><Label>Endereço</Label><Input value={form.endereco || ''} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div>
            <div><Label>Cidade</Label><Input value={form.cidade || ''} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>UF</Label><Input maxLength={2} value={form.uf || ''} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
              <div><Label>CEP</Label><Input value={form.cep || ''} onChange={e => setForm({ ...form, cep: e.target.value })} /></div>
            </div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ''} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
            <div><Label>Status</Label>
              <select value={form.status || 'ativo'} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="ativo">Ativo</option><option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvar} className="btn-primary">{smartMode ? 'Salvar cliente conferido' : 'Salvar'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesFatPage;
