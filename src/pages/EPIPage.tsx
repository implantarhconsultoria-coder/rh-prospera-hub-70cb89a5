import React, { useState } from 'react';
import { ClipboardCheck, ClipboardList, ChevronDown, HardHat } from 'lucide-react';
import EpiDailyDeliveryPage from '@/pages/EpiDailyDeliveryPage';
import EPIManagementPage from '@/pages/EPIManagementPage';
import ProtocoloEntregaLivrePage from '@/pages/ProtocoloEntregaLivrePage';

type Mode = 'daily' | 'management' | 'protocol';

const EPI_CARDS = [
  {key:'daily',label:'Entrega diária de EPI',description:'Registrar entrega e imprimir',icon:HardHat},
  {key:'management',label:'Gestão semestral / fichas',description:'Solicitações, entregas e controle',icon:ClipboardCheck},
  {key:'protocol',label:'Protocolo de entrega livre',description:'Gerar comprovante de materiais',icon:ClipboardList},
] as const;

const EPIPage: React.FC = () => {
  // Abrir a ficha específica quando há deep link; as visitas normais iniciam fechadas.
  const [mode,setMode] = useState<Mode|null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('ficha') || params.has('solicitacao') ? 'management' : null;
  });
  const toggle=(key:Mode)=>setMode(current=>current===key?null:key);

  return <div className="space-y-4">
    <div className="card-premium p-5">
      <h1 className="text-xl font-black">Entrega de EPI</h1>
      <p className="mt-1 text-sm text-muted-foreground">Selecione um card para abrir; toque novamente para fechar.</p>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 no-print" aria-label="Seções de EPI">
      {EPI_CARDS.map(item=>{
        const Icon=item.icon,active=mode===item.key;
        return <button key={item.key} type="button" aria-expanded={active} aria-pressed={active}
          onClick={()=>toggle(item.key)}
          className={`flex min-h-[110px] flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:border-violet-400 ${active?'border-violet-500 bg-[#241a32]':'border-[#30283a] bg-[#0d1017]'}`}>
          <div className="flex w-full items-center justify-between"><Icon className={`h-5 w-5 ${active?'text-[#ffc400]':'text-violet-400'}`}/><ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${active?'rotate-180':''}`}/></div>
          <div><div className="text-sm font-bold text-white">{item.label}</div><div className="mt-1 text-[11px] text-zinc-400">{item.description}</div></div>
        </button>;
      })}
    </div>
    {mode==='daily'&&<EpiDailyDeliveryPage />}
    {mode==='management'&&<EPIManagementPage />}
    {mode==='protocol'&&<ProtocoloEntregaLivrePage />}
  </div>;
};

export default EPIPage;
