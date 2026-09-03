import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, Mail, MessageCircle, Wrench, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ADMIN_EMAIL = 'adm.matriz@topac.com.br';
const TECH_EMAIL = 'implantarh.consultoria@gmail.com';
const WHATSAPP = '5511971535944';

const TOPICS = [
  'Acesso / login / troca de módulo',
  'Funcionários / dados cadastrais',
  'Dados bancários / envio ao Financeiro',
  'Fechamento / folha / cálculos',
  'VR / VT',
  'Assinatura Digital / documento não aparece',
  'Recibo de garagem / comprovante',
  'Filial / empresa ou unidade incorreta',
  'App Mecânico / ponto / abastecimento',
  'Operacional / chamados / protocolo',
  'Almoxarifado / estoque',
  'Frota / documentos',
  'Etiquetas / impressão',
  'Outro problema',
] as const;

const SupportCenter: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [details, setDetails] = useState('');

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('topac:open-support', handler);
    return () => window.removeEventListener('topac:open-support', handler);
  }, []);

  const body = useMemo(() => [
    `Assunto: ${topic}`,
    `Tela: ${location.pathname}`,
    '',
    details.trim() || 'Descreva aqui o que aconteceu.',
  ].join('\n'), [details, location.pathname, topic]);

  const openMail = (technical = false) => {
    const to = technical ? TECH_EMAIL : ADMIN_EMAIL;
    const subject = `${technical ? '[SUPORTE TÉCNICO]' : '[TOPAC RH PRO]'} ${topic}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const openWhatsapp = () => {
    const text = `TOPAC RH PRO — SUPORTE\n\n${body}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 left-4 z-[55] flex h-10 items-center gap-2 rounded-full border border-violet-500/35 bg-[#070a0f]/95 px-3 text-xs font-semibold text-zinc-200 shadow-xl backdrop-blur transition hover:border-violet-400 hover:text-white"
        aria-label="Abrir suporte TOPAC RH PRO"
      >
        <Headphones className="h-4 w-4 text-violet-400" />
        Suporte
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-violet-400/30 bg-[#05080d] text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white"><Headphones className="h-5 w-5 text-violet-400" /> Central de Suporte TOPAC RH PRO</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Qual é o assunto?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TOPICS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTopic(item)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${topic === item ? 'border-violet-400 bg-violet-500/15 text-white' : 'border-zinc-800 bg-black/20 text-zinc-300 hover:border-zinc-600'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">O que aconteceu? <span className="normal-case font-normal">(opcional)</span></label>
              <textarea
                value={details}
                onChange={event => setDetails(event.target.value)}
                rows={5}
                placeholder="Ex.: não consigo finalizar, documento não apareceu, valor divergente, tela abriu empresa errada..."
                className="w-full resize-y rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
              />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/20 p-3 text-xs text-zinc-400">
              <strong className="text-zinc-200">Atendimento operacional:</strong> e-mail da Matriz ou WhatsApp corporativo. Para falha técnica mais grave, use o botão de suporte técnico.
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => openMail(false)} className="justify-start"><Mail className="mr-2 h-4 w-4" /> E-mail Matriz</Button>
              <Button type="button" variant="outline" onClick={openWhatsapp} className="justify-start"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</Button>
              <Button type="button" onClick={() => openMail(true)} className="justify-start bg-violet-600 text-white hover:bg-violet-500"><Wrench className="mr-2 h-4 w-4" /> Suporte técnico</Button>
            </div>

            <div className="grid gap-1 text-[11px] text-zinc-500">
              <span>Operacional: {ADMIN_EMAIL}</span>
              <span>WhatsApp: +55 11 97153-5944</span>
              <span>Técnico: {TECH_EMAIL}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SupportCenter;
