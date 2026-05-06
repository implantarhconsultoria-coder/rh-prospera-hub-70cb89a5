import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Phone, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const InadimplenciaPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [titulos, setTitulos] = useState<any[]>([]);
  const [tentativas, setTentativas] = useState<any[]>([]);
  const [vendoTitulo, setVendoTitulo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const [novaTent, setNovaTent] = useState({ canal: 'telefone', resultado: 'sem_retorno', observacao: '', proximo_contato: '' });

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    let q = supabase.from('titulos_receber')
      .select('*, clientes_fat(razao_social, telefone, email)')
      .in('status', ['aberto', 'parcial', 'vencido'])
      .lt('data_vencimento', hoje)
      .order('data_vencimento');
    if (empIds !== null) q = q.in('empresa_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']);
    const { data } = await q;
    setTitulos(data || []);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const verHistorico = async (t: any) => {
    setVendoTitulo(t);
    const { data } = await supabase.from('cobrancas_tentativas').select('*').eq('titulo_id', t.id).order('data', { ascending: false });
    setTentativas(data || []);
  };

  const registrarTentativa = async () => {
    if (!vendoTitulo) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('nome_completo').eq('user_id', user?.id || '').single();
    await supabase.from('cobrancas_tentativas').insert({
      titulo_id: vendoTitulo.id,
      canal: novaTent.canal,
      resultado: novaTent.resultado,
      observacao: novaTent.observacao,
      proximo_contato: novaTent.proximo_contato || null,
      user_id: user?.id,
      usuario_nome: prof?.nome_completo || '',
    });
    toast.success('Tentativa registrada');
    setNovaTent({ canal: 'telefone', resultado: 'sem_retorno', observacao: '', proximo_contato: '' });
    verHistorico(vendoTitulo);
  };

  const totalInad = titulos.reduce((s, t) => s + Number(t.saldo || 0), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-destructive" /> Inadimplência</h1>
        <p className="text-sm text-muted-foreground">{titulos.length} título(s) vencido(s) · total: <span className="text-destructive font-bold">{fmtBRL(totalInad)}</span></p>
      </div>

      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando...</p> : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Título</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Vencimento</th>
                <th className="text-center p-3">Atraso</th>
                <th className="text-right p-3">Original</th>
                <th className="text-right p-3">Saldo</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {titulos.map(t => {
                const dias = Math.floor((Date.now() - new Date(t.data_vencimento).getTime()) / 86400000);
                return (
                  <tr key={t.id} className="border-t border-border hover:bg-sidebar-accent/10">
                    <td className="p-3 font-mono text-xs">{t.numero}</td>
                    <td className="p-3"><div>{t.clientes_fat?.razao_social}</div><div className="text-xs text-muted-foreground">{t.clientes_fat?.telefone}</div></td>
                    <td className="p-3">{t.data_vencimento}</td>
                    <td className="p-3 text-center"><span className={`text-xs px-2 py-0.5 rounded ${dias > 60 ? 'bg-destructive/30 text-destructive' : dias > 30 ? 'bg-warning/30 text-warning' : 'bg-muted'}`}>{dias}d</span></td>
                    <td className="p-3 text-right">{fmtBRL(t.valor_original)}</td>
                    <td className="p-3 text-right font-bold text-destructive">{fmtBRL(t.saldo)}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => verHistorico(t)} className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 mx-auto"><Phone className="w-3 h-3" /> Cobrar</button>
                    </td>
                  </tr>
                );
              })}
              {titulos.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum título vencido. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {vendoTitulo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-xl shadow-premium-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-lg font-bold">Cobrança — {vendoTitulo.numero}</h2>
                <p className="text-sm text-muted-foreground">{vendoTitulo.clientes_fat?.razao_social} · {fmtBRL(vendoTitulo.saldo)}</p>
              </div>
              <button onClick={() => setVendoTitulo(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/30 p-3 rounded-md space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Nova tentativa de cobrança</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={novaTent.canal} onChange={e => setNovaTent({ ...novaTent, canal: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="telefone">Telefone</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="presencial">Presencial</option>
                  </select>
                  <select value={novaTent.resultado} onChange={e => setNovaTent({ ...novaTent, resultado: e.target.value })} className="bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="sem_retorno">Sem retorno</option><option value="contato_feito">Contato feito</option>
                    <option value="prometeu_pagar">Prometeu pagar</option><option value="negociado">Negociado</option><option value="recusou">Recusou</option>
                  </select>
                </div>
                <textarea placeholder="Observação..." value={novaTent.observacao} onChange={e => setNovaTent({ ...novaTent, observacao: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Próximo contato:</label>
                  <input type="date" value={novaTent.proximo_contato} onChange={e => setNovaTent({ ...novaTent, proximo_contato: e.target.value })} className="bg-background border border-border rounded-md px-2 py-1 text-sm" />
                  <button onClick={registrarTentativa} className="btn-primary ml-auto text-sm">Registrar</button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Histórico de cobrança</h3>
                {tentativas.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma tentativa registrada.</p> : (
                  <ul className="space-y-2">
                    {tentativas.map(t => (
                      <li key={t.id} className="border-l-2 border-primary pl-3 py-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold">{t.canal} · {t.resultado.replace('_', ' ')}</span>
                          <span className="text-muted-foreground">{t.data} · {t.usuario_nome}</span>
                        </div>
                        {t.observacao && <p className="text-sm mt-1">{t.observacao}</p>}
                        {t.proximo_contato && <p className="text-xs text-warning mt-1">Próximo: {t.proximo_contato}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default InadimplenciaPage;
