import React, { useState } from 'react';
import { ArrowRight, Building2, KeyRound, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const FILIAL_ROLES = new Set(['filial_praia', 'filial_goiania']);

const FILIAL_LOGIN_ALIASES: Record<string, string> = {
  'adm.gyn@topac.com.br': 'ana.clara@topac.com.br',
  'comercial.go@topac.com.br': 'aldenei.pereira@topac.com.br',
};

export default function FilialLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const entrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const authEmail = FILIAL_LOGIN_ALIASES[normalizedEmail] || normalizedEmail;
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (authError || !authData.user) {
        toast.error(authError?.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos.'
          : authError?.message || 'Não foi possível entrar.');
        return;
      }

      // Sincroniza permissões antes de decidir a unidade.
      await (supabase as any).rpc('topac_aplicar_acesso_usuario', {
        p_user_id: authData.user.id,
      });

      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id);

      if (roleError) {
        await supabase.auth.signOut();
        toast.error('Não foi possível validar o perfil da filial.');
        return;
      }

      const roles = (roleRows || []).map((row: any) => String(row.role || ''));
      const filialRole = roles.find((role) => FILIAL_ROLES.has(role));

      if (!filialRole) {
        await supabase.auth.signOut();
        toast.error('Este login não possui acesso ao Portal das Filiais.');
        return;
      }

      // /filial usa o próprio perfil para resolver Praia Grande ou Goiânia.
      window.location.assign('/filial');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070c] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-[#373044] bg-[#0e1119] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3 border-b border-[#30283a] pb-5">
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
            <Building2 className="h-7 w-7 text-[#ffc400]" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-violet-400">TOPAC RH PRO</div>
            <h1 className="text-xl font-black">Portal das Filiais</h1>
            <p className="mt-1 text-xs text-zinc-400">Praia Grande e Goiânia • acesso separado pela sua conta.</p>
          </div>
        </div>

        <form onSubmit={entrar} className="space-y-4">
          <label className="block text-sm text-zinc-300">
            E-mail corporativo
            <span className="relative mt-1 block">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@topac.com.br"
                className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400"
              />
            </span>
          </label>

          <label className="block text-sm text-zinc-300">
            Senha
            <span className="relative mt-1 block">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400"
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc400] font-bold text-black hover:bg-[#ffda58] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Entrar na Filial
          </button>
        </form>

        <p className="mt-6 flex items-start gap-2 border-t border-[#30283a] pt-4 text-xs text-zinc-500">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          Este portal não abre a Central administrativa. O login libera somente a filial vinculada ao usuário.
        </p>
      </section>
    </main>
  );
}
