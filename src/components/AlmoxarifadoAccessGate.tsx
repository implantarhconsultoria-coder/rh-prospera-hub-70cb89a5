import React, { useEffect, useState } from 'react';
import { Clock3, LockKeyhole, Monitor } from 'lucide-react';

export type AlmoxarifadoAccessState = {
  checking: boolean;
  allowed: boolean;
  mobile: boolean;
  outsideHours: boolean;
  nowLabel: string;
};

const saoPauloParts = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = String(map.weekday || '');
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  return { weekday, minutes: hour * 60 + minute, hour, minute };
};

const isMobileOrTablet = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
  const ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const uaDataMobile = Boolean((navigator as any).userAgentData?.mobile);
  return mobileUA || ipadOS || uaDataMobile;
};

const getAccessState = (): AlmoxarifadoAccessState => {
  const mobile = isMobileOrTablet();
  const { weekday, minutes, hour, minute } = saoPauloParts();
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const isFriday = weekday === 'Fri';
  const start = 7 * 60; // 30 min antes do expediente das 07:30
  const end = isFriday ? 17 * 60 : 18 * 60; // sexta 16:30 + 30min; seg-qui 17:30 + 30min
  const outsideHours = weekend || minutes < start || minutes > end;
  const nowLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { checking: false, allowed: !mobile && !outsideHours, mobile, outsideHours, nowLabel };
};

export const useAlmoxarifadoAccess = () => {
  const [state, setState] = useState<AlmoxarifadoAccessState>({
    checking: true,
    allowed: false,
    mobile: false,
    outsideHours: false,
    nowLabel: '--:--',
  });

  useEffect(() => {
    const refresh = () => setState(getAccessState());
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return state;
};

export const AlmoxarifadoAccessGate: React.FC<{ state: AlmoxarifadoAccessState }> = ({ state }) => {
  if (state.checking) {
    return (
      <div className="grid min-h-[520px] place-items-center bg-background px-4">
        <div className="text-sm font-medium text-muted-foreground">Validando acesso ao Almoxarifado...</div>
      </div>
    );
  }

  const mobile = state.mobile;
  return (
    <div className="grid min-h-[620px] place-items-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-7 shadow-card md:p-10">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            {mobile ? <Monitor className="h-7 w-7" /> : <LockKeyhole className="h-7 w-7" />}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-primary">TOPAC RH PRO • ALMOXARIFADO</div>
            <h1 className="mt-2 text-2xl font-black text-foreground md:text-3xl">
              {mobile ? 'Acesso exclusivo pelo computador' : 'Almoxarifado fechado neste horário'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {mobile
                ? 'O módulo de Almoxarifado não está disponível em celular ou tablet. Utilize um computador autorizado.'
                : `O acesso ao Almoxarifado fica indisponível fora da janela de expediente. Horário de Brasília agora: ${state.nowLabel}.`}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4">
          <div className="flex items-center gap-2 font-bold text-accent-foreground"><Clock3 className="h-4 w-4" /> Janela de acesso</div>
          <div className="mt-2 grid gap-1 text-sm text-foreground sm:grid-cols-2">
            <div><b>Segunda a quinta:</b> 07:00 às 18:00</div>
            <div><b>Sexta-feira:</b> 07:00 às 17:00</div>
            <div className="sm:col-span-2"><b>Sábado e domingo:</b> sem acesso</div>
          </div>
        </div>
      </div>
    </div>
  );
};
