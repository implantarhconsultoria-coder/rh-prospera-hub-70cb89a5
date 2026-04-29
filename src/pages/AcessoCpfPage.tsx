import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Wrench } from 'lucide-react';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/tecnico-app`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

/**
 * AcessoCpfPage — link único permanente (ex.: Goiânia).
 * Recebe CPF, resolve o token salvo no banco e redireciona para /m/:token.
 * Permite uso simultâneo: cada CPF abre uma sessão isolada do app.
 */
const AcessoCpfPage: React.FC = () => {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setErro('Informe um CPF válido com 11 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
        cache: 'no-store',
        body: JSON.stringify({ action: 'resolver_cpf', token: '', payload: { cpf: digits } }),
      });
      const data = await res.json();
      if (!res.ok || !data?.token) {
        const reason = data?.error || 'invalid_token';
        if (reason === 'cpf_invalido') setErro('CPF inválido.');
        else if (reason === 'funcionario_nao_encontrado') setErro('CPF não encontrado. Verifique com o administrador.');
        else if (reason === 'tecnico_nao_encontrado') setErro('Este CPF ainda não está vinculado ao app. Fale com o administrador.');
        else if (reason === 'blocked_link') setErro('Link bloqueado. Verifique com o administrador.');
        else if (reason === 'revoked_link') setErro('Link revogado. Solicite um novo link ao administrador.');
        else setErro('Link inválido ou bloqueado. Verifique com o administrador.');
        setLoading(false);
        return;
      }
      navigate(`/m/${data.token}`, { replace: true });
    } catch {
      setErro('Falha de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF</p>
            <h1 className="text-lg font-bold font-display leading-tight">App Operacional</h1>
          </div>
        </div>
        <p className="text-xs text-white/60 mb-4">
          Informe seu CPF para abrir o aplicativo. Este é um link permanente — cada CPF abre uma sessão isolada.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {erro && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-blue-600 hover:opacity-90 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/30 transition-opacity flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar no app
          </button>
        </form>
        <p className="text-center text-[10px] text-white/30 mt-5">
          Topac · acesso por link permanente
        </p>
      </div>
    </div>
  );
};

export default AcessoCpfPage;
