import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, Loader2, LockKeyhole, Mail, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** Entrada exclusiva do estoque do escritório; não carrega a interface administrativa. */
export default function EstoqueInternoLoginPage() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [loading,setLoading] = useState(false);

  const entrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha inválidos. Se ainda não criou sua conta, selecione Primeiro acesso.'
        : error.message);
      return;
    }
    window.location.assign('/estoque-interno');
  };

  return <main className="flex min-h-screen items-center justify-center bg-[#05070c] p-4 text-white">
    <section className="w-full max-w-md rounded-2xl border border-[#373044] bg-[#0e1119] p-7 shadow-2xl">
      <div className="mb-6 flex items-center gap-3 border-b border-[#30283a] pb-5">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3"><Package className="h-7 w-7 text-[#ffc400]"/></div>
        <div><div className="text-xs font-bold uppercase tracking-widest text-violet-400">TOPAC RH PRO</div>
          <h1 className="text-xl font-black">Estoque Interno • Escritório</h1>
          <p className="mt-1 text-xs text-zinc-400">Área de trabalho exclusiva dos colaboradores autorizados.</p>
        </div>
      </div>
      <form onSubmit={entrar} className="space-y-4">
        <label className="block text-sm text-zinc-300">E-mail corporativo
          <span className="relative mt-1 block"><Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/>
            <input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="nome@topac.com.br" className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400"/>
          </span>
        </label>
        <label className="block text-sm text-zinc-300">Senha
          <span className="relative mt-1 block"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-zinc-500"/>
            <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="Sua senha" className="h-11 w-full rounded-lg border border-[#41334f] bg-[#090b12] pl-10 pr-3 text-white outline-none focus:border-violet-400"/>
          </span>
        </label>
        <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc400] font-bold text-black hover:bg-[#ffda58] disabled:opacity-50">
          {loading?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>} Entrar no Estoque
        </button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <Link to="/cadastro" className="font-semibold text-violet-300 hover:underline">Primeiro acesso / criar senha</Link>
        <Link to="/recuperar-senha" className="font-semibold text-zinc-400 hover:underline">Esqueci minha senha</Link>
      </div>
      <p className="mt-6 flex items-start gap-2 border-t border-[#30283a] pt-4 text-xs text-zinc-500">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/>Esta área não dá acesso ao painel administrativo, RH ou ao almoxarifado operacional.
      </p>
    </section>
  </main>;
}
