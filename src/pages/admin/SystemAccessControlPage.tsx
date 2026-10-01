import React from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole, Power, RotateCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSystemAccessControl } from '@/hooks/useSystemAccessControl';
import { SYSTEM_ACCESS_MODULES, SYSTEM_OWNER_USER_ID } from '@/lib/systemAccessControl';

const SystemAccessControlPage: React.FC = () => {
  const { session } = useApp();
  const isMobile = useIsMobile();
  const { controls, loading, setRestricted, restoreAll } = useSystemAccessControl();
  const owner = session?.user?.id === SYSTEM_OWNER_USER_ID;

  if (!owner || !isMobile) return <Navigate to="/admin" replace />;

  const setOne = async (key: Parameters<typeof setRestricted>[0], restricted: boolean) => {
    try {
      await setRestricted(key, restricted, session?.user?.id);
      toast.success(restricted ? 'Acesso restringido.' : 'Acesso liberado.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível alterar o acesso.');
    }
  };

  const blockAll = async () => {
    try {
      await setRestricted('global', true, session?.user?.id);
      toast.success('Todos os acessos foram restringidos.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível restringir os acessos.');
    }
  };

  const releaseAll = async () => {
    try {
      await restoreAll(session?.user?.id);
      toast.success('Todos os acessos foram liberados.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível liberar os acessos.');
    }
  };

  const globalRestricted = Boolean(controls.global?.restricted);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 pb-8 text-white">
      <section className={`rounded-[22px] border p-4 ${globalRestricted ? 'border-red-500/35 bg-red-500/[.07]' : 'border-emerald-500/25 bg-emerald-500/[.05]'}`}>
        <div className="flex items-center gap-3">
          <div className={`grid h-12 w-12 place-items-center rounded-2xl border ${globalRestricted ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>
            {globalRestricted ? <LockKeyhole className="h-6 w-6" /> : <Power className="h-6 w-6" />}
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Owner Control</div>
            <h1 className="mt-1 text-xl font-black">Controle de Acesso</h1>
            <p className="mt-1 text-[11px] text-zinc-500">{globalRestricted ? 'Todos os acessos estão restritos.' : 'Sistema com acesso geral liberado.'}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={loading || globalRestricted}
          onClick={blockAll}
          className="min-h-[92px] rounded-2xl border border-red-500/35 bg-red-500/[.09] p-4 text-left disabled:opacity-40"
        >
          <ShieldAlert className="h-6 w-6 text-red-300" />
          <strong className="mt-3 block text-sm">RESTRICT ALL</strong>
          <span className="mt-1 block text-[10px] text-red-200/60">Restringir todos os acessos</span>
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={releaseAll}
          className="min-h-[92px] rounded-2xl border border-emerald-500/30 bg-emerald-500/[.08] p-4 text-left disabled:opacity-40"
        >
          <RotateCcw className="h-6 w-6 text-emerald-300" />
          <strong className="mt-3 block text-sm">RESTORE ALL</strong>
          <span className="mt-1 block text-[10px] text-emerald-200/60">Liberar tudo novamente</span>
        </button>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-fuchsia-500/20 bg-[#07070d]">
        <div className="border-b border-fuchsia-500/10 px-4 py-3">
          <h2 className="text-sm font-black">Módulos individuais</h2>
          <p className="mt-1 text-[10px] text-zinc-600">Toque em um módulo para restringir ou liberar somente ele.</p>
        </div>

        <div className="divide-y divide-white/[.06]">
          {SYSTEM_ACCESS_MODULES.map(item => {
            const restricted = Boolean(controls[item.key]?.restricted);
            return (
              <button
                key={item.key}
                type="button"
                disabled={loading}
                onClick={() => void setOne(item.key, !restricted)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left disabled:opacity-50"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${restricted ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/[.07] text-emerald-300'}`}>
                  <LockKeyhole className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[12px] text-white">{item.label}</strong>
                  <span className="mt-1 block text-[9px] leading-4 text-zinc-500">{item.detail}</span>
                </span>
                <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[.08em] ${restricted ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/25 bg-emerald-500/[.07] text-emerald-300'}`}>
                  {restricted ? 'Restricted' : 'Active'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="px-2 text-center text-[9px] leading-4 text-zinc-700">
        O celular desta conta administrativa permanece disponível para restaurar os acessos.
      </p>
    </div>
  );
};

export default SystemAccessControlPage;
