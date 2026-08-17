import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mapCompany, mapEmployee } from '@/types/database';
import { EPI_RESPONSIBILITY_TEXT } from '@/lib/epiRules';
import { toast } from 'sonner';

const normalizeText = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const dateBr = (value?: string | null) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const findFichasSection = () => {
  const heading = Array.from(document.querySelectorAll('h2')).find(node => normalizeText(node.textContent || '') === 'FICHAS NOMINAIS');
  if (!heading) return null;
  const section = heading.closest('.space-y-3') as HTMLElement | null;
  if (!section) return null;
  const list = Array.from(section.children).find(child => child instanceof HTMLElement && child.classList.contains('divide-y')) as HTMLElement | undefined;
  return list ? { heading, section, list } : null;
};

const EpiBulkPrintEnhancer = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRef = useRef<Set<string>>(new Set());
  const loadingDataRef = useRef(false);
  const loadedRef = useRef(false);

  useEffect(() => { selectedRef.current = new Set(selectedIds); }, [selectedIds]);

  const loadData = useCallback(async () => {
    if (loadingDataRef.current || loadedRef.current) return;
    loadingDataRef.current = true;
    try {
      const [employeesRes, companiesRes] = await Promise.all([
        supabase.from('funcionarios').select('*').order('nome'),
        supabase.from('empresas').select('*').order('nome'),
      ]);
      if (employeesRes.error) throw employeesRes.error;
      if (companiesRes.error) throw companiesRes.error;
      setEmployees((employeesRes.data || []).map(mapEmployee));
      setCompanies((companiesRes.data || []).map(mapCompany));
      loadedRef.current = true;
    } catch (error) {
      console.error('Falha ao carregar dados para impressão em lote de EPI:', error);
    } finally {
      loadingDataRef.current = false;
    }
  }, []);

  const printSelected = useCallback(async () => {
    const ids = Array.from(selectedRef.current);
    if (!ids.length) {
      toast.error('Selecione pelo menos um funcionário para imprimir.');
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('epi_entregas')
        .select('*')
        .in('funcionario_id', ids)
        .neq('status', 'cancelada')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const latestByEmployee = new Map<string, any>();
      (data || []).forEach((row: any) => {
        if (!latestByEmployee.has(String(row.funcionario_id))) latestByEmployee.set(String(row.funcionario_id), row);
      });

      const missing = ids.filter(id => !latestByEmployee.has(id));
      if (missing.length) {
        const names = missing.map(id => employees.find(employee => employee.id === id)?.name || id).join(', ');
        toast.error(`${missing.length} selecionado(s) ainda não possuem ficha emitida: ${names}. Prepare as fichas antes de imprimir.`);
        return;
      }

      const orderedDeliveries = ids.map(id => latestByEmployee.get(id)).filter(Boolean);
      const employeeMap = new Map(employees.map(employee => [employee.id, employee]));
      const companyMap = new Map(companies.map(company => [company.id, company]));

      const sheets = orderedDeliveries.map((delivery: any) => {
        const employee = employeeMap.get(String(delivery.funcionario_id));
        const company = companyMap.get(String(delivery.company_id));
        const items = Array.isArray(delivery.itens) ? delivery.itens : [];
        const printDate = delivery.data_entrega || delivery.data_prevista;
        const term = delivery.termo_responsabilidade || EPI_RESPONSIBILITY_TEXT;
        const rows = items.map((item: any) => `
          <tr>
            <td><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(item.grupo || '')}</small></td>
            <td class="center">${escapeHtml(item.ca || '—')}</td>
            <td class="center">${escapeHtml(item.tamanho || '—')}</td>
            <td class="center">${escapeHtml(item.quantidade ?? '')}</td>
            <td>${escapeHtml(item.observacao || '—')}</td>
          </tr>`).join('');

        return `
          <section class="sheet">
            <header>
              <div><h1>${escapeHtml(delivery.empresa_nome)}</h1><p>CNPJ: ${escapeHtml(company?.cnpj || '—')}</p></div>
              <div class="right"><strong>FICHA DE ENTREGA DE EPI</strong><p>Data da Entrega: ${escapeHtml(dateBr(printDate))}</p><p>Ciclo: Semestral</p></div>
            </header>
            <div class="employee-box">
              <div class="box-title">DADOS DO COLABORADOR</div>
              <div class="employee-grid">
                <div><span>Nome:</span> <strong>${escapeHtml(delivery.funcionario_nome)}</strong></div>
                <div><span>Função:</span> ${escapeHtml(delivery.cargo || '—')}</div>
                <div><span>CPF:</span> ${escapeHtml(employee?.cpf || '—')}</div>
                <div><span>RG:</span> ${escapeHtml(employee?.rg || '—')}</div>
                <div><span>Matrícula:</span> ${escapeHtml(employee?.registro || '—')}</div>
                <div><span>Empresa:</span> ${escapeHtml(delivery.empresa_nome)}</div>
                <div><span>CNPJ:</span> ${escapeHtml(company?.cnpj || '—')}</div>
                <div><span>Unidade:</span> ${escapeHtml(company?.city || delivery.empresa_nome)}</div>
                <div><span>Admissão:</span> ${escapeHtml(dateBr(employee?.dataAdmissao))}</div>
              </div>
            </div>
            <table><thead><tr><th>Item / Descrição</th><th>CA</th><th>Tamanho</th><th>Qtd</th><th>Observação</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="term"><div class="box-title">TERMO DE RESPONSABILIDADE</div><p>${escapeHtml(term)}</p></div>
            ${delivery.status === 'entregue' ? `<div class="cycle"><strong>Controle semestral:</strong> entrega efetiva em ${escapeHtml(dateBr(delivery.data_entrega))} · próxima organização/reposição em ${escapeHtml(dateBr(delivery.proxima_reposicao))}.</div>` : ''}
            <div class="signatures"><div><div class="line"><strong>${escapeHtml(delivery.funcionario_nome)}</strong><small>Colaborador</small></div></div><div><div class="line"><strong>&nbsp;</strong><small>Responsável pela Entrega</small></div></div></div>
          </section>`;
      }).join('');

      const win = window.open('', '_blank');
      if (!win) {
        toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups e tente novamente.');
        return;
      }

      win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fichas EPI selecionadas</title><style>
        @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:'Segoe UI',Arial,sans-serif;font-size:11px}.sheet{width:100%;min-height:272mm;break-after:page;page-break-after:always;padding:0}.sheet:last-child{break-after:auto;page-break-after:auto}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}header h1{font-size:17px;margin:0 0 3px}header p,.right p{font-size:10px;margin:2px 0}.right{text-align:right}.right strong{font-size:13px}.employee-box,.term,.cycle{border:1px solid #999;border-radius:5px;padding:9px;margin-bottom:12px}.box-title{font-size:9px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:6px}.employee-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 10px;font-size:10px}.employee-grid span{color:#666}table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:9.5px}th{background:#e5e7eb;border:1px solid #999;padding:5px;text-align:left}td{border:1px solid #cbd5e1;padding:5px;vertical-align:top}td small{display:block;color:#64748b;font-size:8px;margin-top:2px}.center{text-align:center}.term p{font-size:10px;line-height:1.4;text-align:justify;margin:0}.cycle{font-size:9.5px;padding:7px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:48px;text-align:center}.line{border-top:1px solid #000;padding-top:4px}.line strong{display:block;font-size:10px}.line small{display:block;color:#666;font-size:8px;margin-top:2px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
      </style></head><body>${sheets}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script></body></html>`);
      win.document.close();
      win.focus();
    } catch (error: any) {
      console.error('Falha ao imprimir fichas de EPI selecionadas:', error);
      toast.error(error?.message || 'Não foi possível montar a impressão das fichas selecionadas.');
    }
  }, [companies, employees]);

  useEffect(() => {
    const cleanupInjected = () => {
      document.querySelectorAll('[data-epi-bulk-control="true"]').forEach(node => node.remove());
      document.querySelectorAll('[data-epi-bulk-toolbar="true"]').forEach(node => node.remove());
    };

    const sync = () => {
      const found = findFichasSection();
      if (!found) return;
      void loadData();
      if (!employees.length) return;

      const companyNameById = new Map(companies.map(company => [company.id, company.name]));
      const employeesByKey = new Map<string, any>();
      employees.forEach(employee => {
        const companyName = companyNameById.get(employee.companyId) || '';
        employeesByKey.set(`${normalizeText(employee.name)}|${normalizeText(companyName)}`, employee);
      });

      Array.from(found.list.children).forEach(child => {
        if (!(child instanceof HTMLElement)) return;
        const nameNode = child.querySelector('p.font-semibold');
        const metaNode = nameNode?.nextElementSibling as HTMLElement | null;
        const name = String(nameNode?.textContent || '').trim();
        const companyName = String(metaNode?.textContent || '').split('·')[0]?.trim() || '';
        const employee = employeesByKey.get(`${normalizeText(name)}|${normalizeText(companyName)}`) || employees.find(item => normalizeText(item.name) === normalizeText(name));
        if (!employee) return;

        let control = child.querySelector('[data-epi-bulk-control="true"]') as HTMLLabelElement | null;
        if (!control) {
          control = document.createElement('label');
          control.dataset.epiBulkControl = 'true';
          control.className = 'no-print flex shrink-0 items-center justify-center self-stretch px-1 cursor-pointer';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.dataset.employeeId = employee.id;
          input.setAttribute('aria-label', `Selecionar ${employee.name} para impressão`);
          input.className = 'h-5 w-5 cursor-pointer accent-[hsl(var(--primary))]';
          input.addEventListener('change', () => {
            setSelectedIds(current => {
              const next = new Set(current);
              if (input.checked) next.add(employee.id); else next.delete(employee.id);
              return Array.from(next);
            });
          });
          control.appendChild(input);
          child.insertBefore(control, child.firstChild);
        }
        const input = control.querySelector('input') as HTMLInputElement | null;
        if (input) input.checked = selectedRef.current.has(employee.id);
      });

      let toolbar = found.section.querySelector('[data-epi-bulk-toolbar="true"]') as HTMLDivElement | null;
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.dataset.epiBulkToolbar = 'true';
        toolbar.className = 'no-print flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between';
        found.list.insertAdjacentElement('beforebegin', toolbar);
      }

      toolbar.innerHTML = '';
      const counter = document.createElement('div');
      counter.className = 'text-sm font-semibold text-foreground';
      counter.textContent = `${selectedRef.current.size} funcionário(s) selecionado(s)`;

      const actions = document.createElement('div');
      actions.className = 'flex flex-wrap gap-2';
      const makeButton = (label: string, primary = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = primary
          ? 'inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
          : 'inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
        button.textContent = label;
        return button;
      };

      const selectVisible = makeButton('Selecionar todos visíveis');
      selectVisible.onclick = () => {
        const ids = Array.from(found.list.querySelectorAll<HTMLInputElement>('input[data-employee-id]')).map(input => input.dataset.employeeId).filter(Boolean) as string[];
        setSelectedIds(ids);
      };
      const clear = makeButton('Limpar seleção');
      clear.onclick = () => setSelectedIds([]);
      const print = makeButton(`Imprimir selecionados (${selectedRef.current.size})`, true);
      print.disabled = selectedRef.current.size === 0;
      print.onclick = () => void printSelected();

      actions.append(selectVisible, clear, print);
      toolbar.append(counter, actions);
    };

    sync();
    const observer = new MutationObserver(sync);
    const root = document.getElementById('root') || document.body;
    observer.observe(root, { childList: true, subtree: true });
    const interval = window.setInterval(sync, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      cleanupInjected();
    };
  }, [companies, employees, loadData, printSelected, selectedIds]);

  return null;
};

export default EpiBulkPrintEnhancer;
