import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Link2, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const ROOT_ID = 'topac-pre-cadastro-actions';
const REACT_ID = 'topac-pre-cadastro-react-actions';
const FSE_ID = 'topac-pre-cadastro-fse-slot';
const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');

const fieldByLabel = (labelText: string) => {
  const labels = Array.from(document.querySelectorAll('label')) as HTMLLabelElement[];
  const wanted = labelText.toLowerCase();
  const label = labels.find(node => clean(node.textContent).toLowerCase().replace(/\s*\*$/, '') === wanted);
  if (!label) return '';
  const input = label.querySelector('input,textarea,select') || label.parentElement?.querySelector('input,textarea,select');
  return clean((input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value);
};

const selectedCardData = () => {
  const selected = document.querySelector('button.border-primary') as HTMLButtonElement | null;
  const text = clean(selected?.textContent);
  const cpf = text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11}/)?.[0] || '';
  const name = clean(selected?.querySelector('.font-semibold')?.textContent);
  const id = selected?.dataset?.preCadastroId || '';
  return { id, cpf, name };
};

const ensureMounts = () => {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'no-print fixed bottom-4 right-4 z-[65] grid w-[min(390px,calc(100vw-2rem))] grid-cols-1 gap-2 rounded-2xl border border-violet-500/35 bg-[#06090d]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,.60),0_0_34px_rgba(124,44,255,.16)] backdrop-blur-xl sm:grid-cols-2';

    const reactMount = document.createElement('div');
    reactMount.id = REACT_ID;
    reactMount.className = 'min-w-0';

    const fseSlot = document.createElement('div');
    fseSlot.id = FSE_ID;
    fseSlot.className = 'min-w-0';

    root.append(reactMount, fseSlot);
    document.body.appendChild(root);
  }
  return document.getElementById(REACT_ID);
};

const normalizeWhatsapp = (value: string) => {
  let phone = digits(value);
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone;
};

export default function PreCadastroCandidateActions() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState('');

  useEffect(() => {
    const place = () => setMount(ensureMounts());
    place();
    const timer = window.setInterval(place, 600);
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      document.getElementById(ROOT_ID)?.remove();
    };
  }, []);

  const createLink = async () => {
    const selected = selectedCardData();
    const cpf = fieldByLabel('CPF') || selected.cpf;
    const phone = fieldByLabel('Celular') || fieldByLabel('Telefone');
    const name = fieldByLabel('Nome') || selected.name || 'candidato';

    if (!selected.id && digits(cpf).length !== 11) return toast.error('Selecione o pré-cadastro antes de gerar a ficha digital.');
    if (digits(phone).length < 10) return toast.error('Informe o celular/WhatsApp do candidato no pré-cadastro.');

    setBusy(true);
    const popup = window.open('about:blank', '_blank');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão administrativa não encontrada.');

      const response = await fetch('/api/pre-cadastro-candidato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'admin_create', preCadastroId: selected.id || undefined, cpf: digits(cpf), telefone: digits(phone) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        const message = data?.error === 'celular_candidato_obrigatorio'
          ? 'Informe o celular do candidato.'
          : data?.error === 'salve_empresa_funcao_antes_do_link'
            ? 'Salve a empresa e a função antes de enviar a ficha. Isso garante a geração automática da guia ASO.'
            : (data?.error || 'Não foi possível gerar o link.');
        throw new Error(message);
      }

      setLastLink(data.url);
      const message = [
        `Olá, ${name}.`, '',
        'A TOPAC iniciou seu processo de pré-cadastro admissional.',
        'Abra o link abaixo no celular, preencha a Ficha de Solicitação de Emprego e anexe os documentos que já tiver.', '',
        data.url, '',
        'Ao concluir a ficha, o próprio sistema mostrará a etapa final de documentos. A contratação só seguirá quando os itens obrigatórios estiverem completos.',
      ].join('\n');
      const wa = `https://wa.me/${normalizeWhatsapp(phone)}?text=${encodeURIComponent(message)}`;
      if (popup) popup.location.href = wa;
      else window.open(wa, '_blank', 'noopener,noreferrer');
      try { await navigator.clipboard.writeText(data.url); } catch {}
      toast.success('Ficha digital criada. WhatsApp aberto e link copiado.');
    } catch (error: any) {
      if (popup) popup.close();
      toast.error(error?.message || 'Não foi possível preparar a ficha.');
    } finally {
      setBusy(false);
    }
  };

  const copyLast = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  if (!mount) return null;
  return createPortal(
    <div className="flex h-full flex-col gap-2">
      <Button
        type="button"
        className="min-h-11 w-full border border-violet-400/40 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_10px_28px_rgba(124,58,237,.25)] hover:from-violet-500 hover:to-indigo-500"
        disabled={busy}
        onClick={() => void createLink()}
      >
        {busy ? <Send className="h-4 w-4 animate-pulse" /> : <Link2 className="h-4 w-4" />}
        {busy ? 'Preparando ficha...' : 'Enviar ficha por link'}
      </Button>
      {lastLink && (
        <button type="button" onClick={() => void copyLast()} className="flex items-center justify-center gap-2 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
          <Copy className="h-3.5 w-3.5" />Copiar link novamente
        </button>
      )}
    </div>,
    mount,
  );
}
