import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Save } from 'lucide-react';
import { toast } from 'sonner';

const EmailsContabilidadePage: React.FC = () => {
  const { session } = useApp();
  const [id, setId] = useState<string | null>(null);
  const [emailRobson, setEmailRobson] = useState('');
  const [emailMarisa, setEmailMarisa] = useState('');
  const [emailsCopia, setEmailsCopia] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('config_emails_contabilidade' as any)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        const r = data as any;
        setId(r.id);
        setEmailRobson(r.email_robson || '');
        setEmailMarisa(r.email_marisa || '');
        setEmailsCopia(r.emails_copia || '');
      }
      setLoading(false);
    })();
  }, []);

  const salvar = async () => {
    setSaving(true);
    const payload: any = {
      email_robson: emailRobson.trim(),
      email_marisa: emailMarisa.trim(),
      emails_copia: emailsCopia.trim(),
      updated_by: session?.user?.id,
      updated_by_nome: session?.user?.email,
    };
    let error;
    if (id) {
      ({ error } = await supabase.from('config_emails_contabilidade' as any).update(payload).eq('id', id));
    } else {
      const ins = await supabase.from('config_emails_contabilidade' as any).insert(payload).select().single();
      error = ins.error;
      if (ins.data) setId((ins.data as any).id);
    }
    setSaving(false);
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('E-mails da contabilidade atualizados');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Mail className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">E-mails da Contabilidade</h1>
            <p className="text-primary-foreground/70 text-sm">Destinatários para envio automático de Avisos de Férias</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-6 space-y-4 max-w-2xl">
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : (
          <>
            <div>
              <Label>E-mail do Robson</Label>
              <Input type="email" value={emailRobson} onChange={e => setEmailRobson(e.target.value)} placeholder="robson@topac.com.br" />
            </div>
            <div>
              <Label>E-mail da Marisa / Contabilidade</Label>
              <Input type="email" value={emailMarisa} onChange={e => setEmailMarisa(e.target.value)} placeholder="marisa@aatconsultoria.com.br" />
            </div>
            <div>
              <Label>Cópia (separar por vírgula)</Label>
              <Input value={emailsCopia} onChange={e => setEmailsCopia(e.target.value)} placeholder="adm.matriz@topac.com.br, dp@aatconsultoria.com.br" />
              <p className="text-xs text-muted-foreground mt-1">Esses e-mails entrarão como CC em todos os envios.</p>
            </div>
            <Button onClick={salvar} disabled={saving} className="gradient-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar configuração'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default EmailsContabilidadePage;
