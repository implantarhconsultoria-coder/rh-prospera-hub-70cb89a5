import React, { useState } from 'react';
import { Archive, HardHat, Tags, Users } from 'lucide-react';
import EquipmentLabelGenerator from '@/components/EquipmentLabelGenerator';
import EmployeeLabelsStandalone from '@/components/labels/EmployeeLabelsStandalone';
import FolderLabelsStandalone from '@/components/labels/FolderLabelsStandalone';
import CabinetLabelsStandalone from '@/components/labels/CabinetLabelsStandalone';

type Tab = 'equipamentos' | 'funcionarios' | 'pastas' | 'armarios';

const cards: Array<{ id: Tab; title: string; description: string; icon: React.ElementType }> = [
  { id: 'equipamentos', title: 'Equipamentos', description: 'Catálogo TOPAC com patrimônio, série e impressão.', icon: HardHat },
  { id: 'funcionarios', title: 'Funcionários A4', description: 'Etiquetas por empresa, competência ou seleção manual.', icon: Users },
  { id: 'pastas', title: 'Pasta A-Z', description: 'Nomes em 2,5 × 1 cm, individual, empresas ou todos.', icon: Tags },
  { id: 'armarios', title: 'Armário 20 × 8', description: 'Etiquetas grandes de organização e arquivo.', icon: Archive },
];

const EtiquetasPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('equipamentos');
  const current = cards.find((item) => item.id === tab)!;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#a855f7]">TOPAC RH PRO</div>
        <h1 className="mt-1 text-2xl font-black text-white">ETIQUETAS</h1>
        <p className="mt-1 text-sm text-zinc-500">Central exclusiva para criação e impressão de todas as etiquetas. Nenhuma ferramenta desta área fica misturada com Fechamento ou Almoxarifado.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          const active = item.id === tab;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} className={`group rounded-xl border p-4 text-left transition ${active ? 'border-[#ffc400] bg-gradient-to-br from-[#211833] to-[#0d0b12] shadow-[0_0_28px_rgba(255,196,0,.08)]' : 'border-[#30263b] bg-[#080b10] hover:border-violet-500/70 hover:bg-[#0d0d13]'}`}>
              <div className={`grid h-10 w-10 place-items-center rounded-lg ${active ? 'bg-[#ffc400] text-black' : 'bg-violet-500/10 text-violet-400'}`}><Icon className="h-5 w-5" /></div>
              <div className="mt-3 font-black text-white">{item.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{item.description}</div>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-[#30263b] bg-[#06090d] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)]">
        <div className="mb-5 border-b border-[#27212e] pb-4">
          <h2 className="text-lg font-black text-white">{current.title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{current.description}</p>
        </div>
        {tab === 'equipamentos' && <EquipmentLabelGenerator embedded />}
        {tab === 'funcionarios' && <EmployeeLabelsStandalone />}
        {tab === 'pastas' && <FolderLabelsStandalone />}
        {tab === 'armarios' && <CabinetLabelsStandalone />}
      </section>
    </div>
  );
};

export default EtiquetasPage;
