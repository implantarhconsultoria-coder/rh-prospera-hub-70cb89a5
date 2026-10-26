import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (codigo: string) => void | Promise<void>;
};
type Operador = {
  id: string;
  nome: string;
  email?: string | null;
  codigo_emitido: boolean;
};
const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};
const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
const mensagemPin = (error?: string) => {
  const messages: Record<string, string> = {
    nao_autenticado: 'Sua sessão expirou. Entre novamente para cadastrar o PIN.',
    sem_permissao: 'Seu acesso ao módulo Operacional precisa ser autorizado.',
    operador_nao_vinculado_ou_inativo: 'Seu cadastro de operador está inativo ou não vinculado à sua conta.',
    pin_deve_ter_6_digitos: 'O PIN deve ter exatamente 6 números.',
    escolha_um_pin_menos_obvio: 'Escolha um PIN menos previsível.',
    escolha_outro_pin: 'Esse PIN já está em uso. Escolha outro.',
    pin_ja_configurado: 'Você já possui um PIN. Utilize a recuperação por e-mail.',
  };
  return messages[error || ''] || error || 'Não foi possível cadastrar o PIN.';
};

const OperadorCodeDialog: React.FC<Props> = ({
  open, title = 'Identificar operador',
  description = 'Informe seu código individual para confirmar esta operação.',
  loading = false, onOpenChange, onConfirm,
}) => {
  const { session } = useApp();
  const [codigo, setCodigo] = useState('');
  const [repeticao, setRepeticao] = useState('');
  const [operador, setOperador] = useState<Operador | null>(null);
  const [modo, setModo] = useState<'confirmar' | 'cadastrar'>('confirmar');
  const [verificando, setVerificando] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (!open) {
      setCodigo('');
      setRepeticao('');
      setOperador(null);
      setModo('confirmar');
      setAviso('');
      setVerificando(false);
      return;
    }
    let ativo = true;
    const carregarOperador = async () => {
      setVerificando(true);
      try {
        const { data, error } = await rpc.rpc('operador_operacao_garantir_self', { p_modulo: 'operacional' });
        if (!ativo) return;
        if (error || !data?.ok || !data?.operador) {
          setAviso('Não foi possível identificar seu cadastro. Verifique seu acesso com o administrador.');
          return;
        }
        const atual = data.operador as Operador;
        setOperador(atual);
        setModo(atual.codigo_emitido ? 'confirmar' : 'cadastrar');
        setAviso('');
      } catch {
        if (ativo) setAviso('Falha ao consultar o cadastro do operador.');
      } finally {
        if (ativo) setVerificando(false);
      }
    };
    void carregarOperador();
    return () => { ativo = false; };
  }, [open]);

  const ocupado = loading || trabalhando;
  const confirmar = async () => {
    const value = onlyDigits(codigo);
    if (value.length !== 6 || ocupado) return;
    await onConfirm(value);
  };

  const cadastrarEConfirmar = async () => {
    const pin = onlyDigits(codigo);
    if (pin.length !== 6) return toast.error('Crie um PIN de 6 dígitos.');
    if (pin !== onlyDigits(repeticao)) return toast.error('Os dois códigos não conferem.');
    if (!operador || ocupado) return;
    setTrabalhando(true);
    try {
      const { data, error } = await rpc.rpc('operador_operacao_configurar_pin', { p_pin: pin });
      if (error || !data?.ok) {
        toast.error(mensagemPin(data?.error || error?.message));
        return;
      }
      setOperador({ ...operador, codigo_emitido: true });
      setModo('confirmar');
      setRepeticao('');
      toast.success('PIN pessoal cadastrado. Confirmando sua operação.');
      await onConfirm(pin);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível confirmar a operação.');
    } finally {
      setTrabalhando(false);
    }
  };

  const reenviarPorEmail = async () => {
    if (!session?.access_token || !operador?.id || ocupado)
      return toast.error('Entre com sua conta operacional para recuperar o código.');
    if (!operador.email)
      return toast.error('Solicite ao administrador o vínculo do seu e-mail corporativo.');
    setTrabalhando(true);
    try {
      const response = await fetch('/api/operator-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ operador_id: operador.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok)
        throw new Error(data?.error || 'Não foi possível enviar o código.');
      setCodigo('');
      setModo('confirmar');
      setAviso('Novo código enviado ao e-mail corporativo cadastrado. O anterior foi invalidado.');
      toast.success('Código enviado por e-mail.');
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao enviar o código por e-mail.');
    } finally {
      setTrabalhando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !ocupado && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {modo === 'cadastrar'
              ? 'Primeiro acesso: cadastre um PIN pessoal de 6 números para autorizar suas operações.'
              : description}
          </DialogDescription>
        </DialogHeader>
        {verificando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando seu cadastro...
          </div>
        ) : (
          <div className="space-y-4">
            {operador && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Operador: <strong>{operador.nome}</strong>
              </p>
            )}
            {aviso && (
              <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">{aviso}</p>
            )}
            {modo === 'cadastrar' ? (
              <>
                <div>
                  <p className="mb-2 text-xs font-medium">Crie seu PIN individual</p>
                  <Input
                    autoFocus type="password" inputMode="numeric" autoComplete="new-password"
                    placeholder="6 números" value={codigo} disabled={ocupado}
                    onChange={(event) => setCodigo(onlyDigits(event.target.value))}
                    className="h-12 text-center text-lg font-bold tracking-[0.3em]"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium">Confirme o PIN</p>
                  <Input
                    type="password" inputMode="numeric" autoComplete="new-password"
                    placeholder="Repita os 6 números" value={repeticao} disabled={ocupado}
                    onChange={(event) => setRepeticao(onlyDigits(event.target.value))}
                    onKeyDown={(event) => { if (event.key === 'Enter') void cadastrarEConfirmar(); }}
                    className="h-12 text-center text-lg font-bold tracking-[0.3em]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Esse PIN identifica você no histórico. Não compartilhe com outras pessoas.
                </p>
                <Button className="h-12 w-full font-bold"
                  disabled={codigo.length !== 6 || repeticao.length !== 6 || ocupado}
                  onClick={() => void cadastrarEConfirmar()}>
                  {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Criar PIN e confirmar operação
                </Button>
              </>
            ) : (
              <>
                <Input
                  autoFocus type="password" inputMode="numeric" autoComplete="off"
                  placeholder="000000" value={codigo} disabled={ocupado}
                  onChange={(event) => setCodigo(onlyDigits(event.target.value))}
                  onKeyDown={(event) => { if (event.key === 'Enter') void confirmar(); }}
                  className="h-14 text-center text-2xl font-black tracking-[0.35em]"
                />
                <p className="text-center text-xs text-muted-foreground">
                  O PIN identifica quem executou a ação. Data e hora serão registradas automaticamente.
                </p>
                <Button className="h-12 w-full font-bold"
                  disabled={codigo.length !== 6 || ocupado} onClick={() => void confirmar()}>
                  {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Confirmar operação
                </Button>
                {operador && (
                  <Button variant="ghost" className="w-full text-xs"
                    disabled={ocupado} onClick={() => void reenviarPorEmail()}>
                    <Mail className="mr-2 h-4 w-4" /> Esqueci meu PIN — receber novo por e-mail
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
export default OperadorCodeDialog;
