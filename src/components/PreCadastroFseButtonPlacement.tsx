import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PRINT_BUTTON_TITLE = 'Abrir a ficha TOPAC FSE-2026 pronta para impressão';
const FSE_SLOT_ID = 'topac-pre-cadastro-fse-slot';
const PUBLIC_TOOLBAR_ID = 'topac-public-pre-cadastro-toolbar';
const PUBLIC_SUMMARY_ID = 'topac-public-pre-cadastro-summary';
const GENERAL_LINK = 'https://topacrh.pro/pre-cadastro';

type PublicRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  status: string;
  public_token: string | null;
  public_completed_at: string | null;
  public_seen_at: string | null;
  candidato_dados: Record<string, any> | null;
  dados_bancarios: Record<string, any> | null;
  transporte: Record<string, any> | null;
  ctps_tipo: string | null;
  pendencias_documentais: any[] | null;
  correcao_solicitada: Record<string, any> | null;
  created_at: string;
};

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
};

const transportLine = (value: Record<string, any> | undefined) => {
  if (!value) return 'Não informado';
  const labels: Array<[string, string]> = [
    ['onibus', 'ônibus municipal'],
    ['metro', 'metrô'],
    ['trem', 'trem'],
    ['intermunicipal', 'ônibus intermunicipal'],
  ];
  const parts = labels
    .map(([key, label]) => [Math.max(0, Number(value[key] || 0)), label] as const)
    .filter(([quantity]) => quantity > 0)
    .map(([quantity, label]) => `${quantity} ${label}`);
  return parts.length ? parts.join(' + ') : 'Nenhuma condução informada';
};

const copyText = async (text: string) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const findHeading = (text: string) => Array.from(document.querySelectorAll('h1,h2,h3')).find(
  node => clean(node.textContent).toLowerCase() === text.toLowerCase(),
) as HTMLElement | undefined;

const selectedPreCadastroId = () => {
  const fromQuery = new URLSearchParams(window.location.search).get('pre');
  if (fromQuery) return fromQuery;
  const selected = document.querySelector('button[data-pre-cadastro-id].border-primary') as HTMLElement | null;
  return selected?.getAttribute('data-pre-cadastro-id') || '';
};

const PreCadastroFseButtonPlacement = () => {
  useEffect(() => {
    const placeButton = () => {
      const printButton = document.querySelector(`button[title="${PRINT_BUTTON_TITLE}"]`) as HTMLButtonElement | null;
      if (!printButton) return;

      const slot = document.getElementById(FSE_SLOT_ID);
      if (slot) {
        if (printButton.parentElement !== slot) slot.appendChild(printButton);
      } else {
        const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Salvar');
        const actionBar = saveButton?.parentElement;
        if (!saveButton || !actionBar) return;
        if (printButton.parentElement !== actionBar || saveButton.nextElementSibling !== printButton) saveButton.insertAdjacentElement('afterend', printButton);
      }

      printButton.className = 'inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-primary/30 bg-primary/[0.07] px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-all hover:border-primary/55 hover:bg-primary/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
      printButton.style.position = 'static';
      printButton.style.inset = 'auto';
      printButton.style.margin = '0';
      printButton.style.zIndex = 'auto';
      printButton.style.width = '100%';

      const textNode = Array.from(printButton.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Ficha FSE-2026';
    };

    placeButton();
    const observer = new MutationObserver(placeButton);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(placeButton, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let rows: PublicRow[] = [];
    let notifiedIds = new Set<string>();
    let enhancing = false;

    const markSeen = async (id: string) => {
      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from('pre_cadastros_admissionais')
        .update({ public_seen_at: now })
        .eq('id', id);
      if (error) throw error;
      rows = rows.map(row => row.id === id ? { ...row, public_seen_at: now } : row);
    };

    const requestCorrection = async (row: PublicRow) => {
      const reason = window.prompt(`O que ${row.nome || 'o candidato'} precisa corrigir?`);
      if (!reason?.trim()) return;
      const { data: auth } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const correction = { observacao: reason.trim(), solicitada_em: now, solicitada_por: auth.user?.id || null };
      const { error } = await (supabase as any)
        .from('pre_cadastros_admissionais')
        .update({ status: 'correcao_solicitada', correcao_solicitada: correction, updated_at: now })
        .eq('id', row.id);
      if (error) throw error;
      rows = rows.map(item => item.id === row.id ? { ...item, status: 'correcao_solicitada', correcao_solicitada: correction } : item);
      const personalLink = `${GENERAL_LINK}?token=${encodeURIComponent(row.public_token || '')}`;
      await copyText(personalLink);
      toast.success('Correção solicitada. O link do candidato foi copiado para você enviar.');
      enhance();
    };

    const injectToolbar = () => {
      let toolbar = document.getElementById(PUBLIC_TOOLBAR_ID) as HTMLDivElement | null;
      if (!toolbar) {
        const heading = findHeading('Pre-cadastro Admissional');
        const hero = heading?.closest('.card-premium') || heading?.parentElement?.parentElement;
        if (!hero?.parentElement) return;
        toolbar = document.createElement('div');
        toolbar.id = PUBLIC_TOOLBAR_ID;
        toolbar.className = 'rounded-xl border border-primary/20 bg-primary/[0.04] p-3 sm:p-4';
        hero.insertAdjacentElement('afterend', toolbar);
      }

      const completed = rows.filter(row => !!row.public_completed_at && row.status !== 'cadastro_em_preenchimento');
      const unread = completed.filter(row => !row.public_seen_at);
      toolbar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:13px;font-weight:800">LINK DE PRÉ-CADASTRO DO CANDIDATO</div>
            <div style="margin-top:2px;font-size:12px;color:hsl(var(--muted-foreground))">Envie este mesmo link. O candidato preenche primeiro; empresa, cargo e salário ficam para o RH.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="topac-copy-public-link" type="button" class="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-semibold hover:bg-accent">Copiar link</button>
            <button id="topac-open-latest-public" type="button" class="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90" ${unread.length ? '' : 'disabled'}>${unread.length ? `${unread.length} novo${unread.length > 1 ? 's' : ''} recebido${unread.length > 1 ? 's' : ''}` : 'Nenhum novo'}</button>
          </div>
        </div>`;

      toolbar.querySelector<HTMLButtonElement>('#topac-copy-public-link')!.onclick = async () => {
        await copyText(GENERAL_LINK);
        toast.success('Link do pré-cadastro copiado.');
      };
      const latestButton = toolbar.querySelector<HTMLButtonElement>('#topac-open-latest-public');
      if (latestButton && unread.length) latestButton.onclick = async () => {
        const latest = unread[0];
        try { await markSeen(latest.id); } catch (error: any) { toast.error(error?.message || 'Não foi possível registrar a leitura.'); }
        window.location.href = `/admin/pre-cadastro-admissional?pre=${encodeURIComponent(latest.id)}`;
      };
    };

    const hideIncompletePublicDrafts = () => {
      const drafts = new Set(rows.filter(row => !row.public_completed_at && row.status === 'cadastro_em_preenchimento').map(row => row.id));
      document.querySelectorAll<HTMLElement>('button[data-pre-cadastro-id]').forEach(card => {
        const id = card.getAttribute('data-pre-cadastro-id') || '';
        if (drafts.has(id)) card.style.display = 'none';
        else if (card.style.display === 'none') card.style.removeProperty('display');
      });
    };

    const injectSelectedSummary = () => {
      const id = selectedPreCadastroId();
      const row = rows.find(item => item.id === id && !!item.public_completed_at);
      const old = document.getElementById(PUBLIC_SUMMARY_ID);
      if (!row) { old?.remove(); return; }

      let summary = old as HTMLDivElement | null;
      if (!summary) {
        const heading = findHeading('Conferencia admissional');
        const header = heading?.parentElement;
        if (!header?.parentElement) return;
        summary = document.createElement('div');
        summary.id = PUBLIC_SUMMARY_ID;
        summary.className = 'rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4';
        header.insertAdjacentElement('afterend', summary);
      }

      const c = row.candidato_dados || {};
      const b = row.dados_bancarios || {};
      const t = row.transporte || {};
      const pending = Array.isArray(row.pendencias_documentais) ? row.pendencias_documentais : [];
      const correctionOpen = row.status === 'correcao_solicitada';
      summary.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><div style="font-size:14px;font-weight:800">DADOS RECEBIDOS PELO CANDIDATO</div><div style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:2px">Finalizado em ${esc(formatDateTime(row.public_completed_at))}. O RH completa empresa + cargo/vaga + salário.</div></div>
          <span style="font-size:11px;font-weight:700;border-radius:999px;padding:5px 9px;background:${correctionOpen ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.12)'};color:${correctionOpen ? '#b45309' : '#047857'}">${correctionOpen ? 'CORREÇÃO SOLICITADA' : 'PRÉ-CADASTRO RECEBIDO'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:14px">
          <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:11px;background:hsl(var(--background))"><div style="font-size:10px;font-weight:700;color:hsl(var(--muted-foreground));text-transform:uppercase">Banco / PIX</div><div style="font-size:13px;margin-top:5px"><b>${esc(b.banco || '-')}</b><br>Ag. ${esc(b.agencia || '-')} · Conta ${esc(b.conta || '-')}${b.digito ? '-' + esc(b.digito) : ''}<br>PIX: ${esc(b.pix || '-')}</div></div>
          <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:11px;background:hsl(var(--background))"><div style="font-size:10px;font-weight:700;color:hsl(var(--muted-foreground));text-transform:uppercase">CTPS</div><div style="font-size:13px;margin-top:5px"><b>${esc(row.ctps_tipo || 'Não informado')}</b><br>${esc(c.pis ? `PIS/NIS: ${c.pis}` : 'PIS/NIS não informado')}</div></div>
          <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:11px;background:hsl(var(--background))"><div style="font-size:10px;font-weight:700;color:hsl(var(--muted-foreground));text-transform:uppercase">Vale-transporte</div><div style="font-size:13px;margin-top:5px">${t.usa_vt === false ? '<b>Não utiliza VT</b>' : `<b>IDA:</b> ${esc(transportLine(t.ida))}<br><b>VOLTA:</b> ${esc(transportLine(t.volta))}`}</div></div>
          <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:11px;background:hsl(var(--background))"><div style="font-size:10px;font-weight:700;color:hsl(var(--muted-foreground));text-transform:uppercase">Pendências permitidas</div><div style="font-size:13px;margin-top:5px">${pending.length ? pending.map((item: any) => esc(item?.label || item?.tipo || item)).join('<br>') : '<b>Nenhuma</b>'}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button id="topac-copy-candidate-link" type="button" class="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-semibold hover:bg-accent">Copiar link deste candidato</button>
          <button id="topac-request-correction" type="button" class="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100">Solicitar correção</button>
        </div>`;

      summary.querySelector<HTMLButtonElement>('#topac-copy-candidate-link')!.onclick = async () => {
        if (!row.public_token) return toast.error('Token deste candidato não foi encontrado.');
        await copyText(`${GENERAL_LINK}?token=${encodeURIComponent(row.public_token)}`);
        toast.success('Link individual do candidato copiado.');
      };
      summary.querySelector<HTMLButtonElement>('#topac-request-correction')!.onclick = () => void requestCorrection(row).catch((error: any) => toast.error(error?.message || 'Não foi possível solicitar a correção.'));

      if (!row.public_seen_at) void markSeen(row.id).then(() => injectToolbar()).catch(() => undefined);
    };

    const enhance = () => {
      if (disposed || enhancing) return;
      enhancing = true;
      try {
        hideIncompletePublicDrafts();
        injectToolbar();
        injectSelectedSummary();
      } finally { enhancing = false; }
    };

    const loadRows = async () => {
      const { data, error } = await (supabase as any)
        .from('pre_cadastros_admissionais')
        .select('id,nome,cpf,status,public_token,public_completed_at,public_seen_at,candidato_dados,dados_bancarios,transporte,ctps_tipo,pendencias_documentais,correcao_solicitada,created_at')
        .eq('origem_cadastro', 'link_publico')
        .order('created_at', { ascending: false });
      if (error || disposed) return;
      rows = data || [];
      const unread = rows.filter(row => row.public_completed_at && !row.public_seen_at && row.status !== 'cadastro_em_preenchimento');
      unread.slice(0, 3).forEach(row => {
        if (notifiedIds.has(row.id)) return;
        notifiedIds.add(row.id);
        toast.info(`Novo pré-cadastro recebido: ${row.nome || 'candidato'}`, {
          action: { label: 'Ver ficha', onClick: () => { window.location.href = `/admin/pre-cadastro-admissional?pre=${encodeURIComponent(row.id)}`; } },
          duration: 12000,
        });
      });
      enhance();
    };

    void loadRows();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    const refreshTimer = window.setInterval(() => void loadRows(), 15000);
    const enhanceTimer = window.setInterval(enhance, 800);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(refreshTimer);
      window.clearInterval(enhanceTimer);
      document.getElementById(PUBLIC_TOOLBAR_ID)?.remove();
      document.getElementById(PUBLIC_SUMMARY_ID)?.remove();
    };
  }, []);

  return null;
};

export default PreCadastroFseButtonPlacement;
