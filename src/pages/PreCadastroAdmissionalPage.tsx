import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';

const CUSTOM_FUNCAO_VALUE = '__topac_custom_funcao__';
const ASO_DATE_INPUT_ID = 'topac-aso-data-exame';
const ASO_DATE_STORAGE_KEY = 'topac_pre_cadastro_data_exame_aso';
const MULTI_UPLOAD_ATTR = 'data-topac-multi-upload';
const SYNTHETIC_CHANGE_ATTR = 'data-topac-synthetic-change';

const findFuncaoSelect = () => {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  return selects.find((select) => {
    const label = select.parentElement?.querySelector('label')?.textContent || '';
    return label.trim().toLowerCase().startsWith('funcao');
  }) || null;
};

const findFichaInput = () => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  return inputs.find((input) => {
    const containerText = input.parentElement?.textContent?.toLowerCase() || '';
    return containerText.includes('ficha de solicitacao de emprego');
  }) || null;
};

const ensureMultiDocumentUpload = () => {
  const input = findFichaInput();
  if (!input) return;
  input.multiple = true;
  input.accept = '.pdf,image/*';
  input.setAttribute(MULTI_UPLOAD_ATTR, 'true');
  input.setAttribute('title', 'Selecione CNH, RG, CPF, certidao, comprovante de residencia e demais documentos de uma vez');

  const label = input.closest('div')?.querySelector('label');
  if (label && !label.textContent?.includes('Documentos pessoais')) {
    label.textContent = 'Documentos pessoais para leitura automatica';
  }

  const helperId = 'topac-multi-upload-helper';
  if (!document.getElementById(helperId)) {
    const helper = document.createElement('p');
    helper.id = helperId;
    helper.className = 'mt-2 text-xs text-muted-foreground';
    helper.textContent = 'Selecione todos os arquivos de uma vez. O sistema le cada documento e combina os dados encontrados.';
    input.insertAdjacentElement('afterend', helper);
  }
};

const ensureCustomFuncaoOption = () => {
  const select = findFuncaoSelect();
  if (!select) return;
  if (Array.from(select.options).some((option) => option.value === CUSTOM_FUNCAO_VALUE)) return;

  const option = document.createElement('option');
  option.value = CUSTOM_FUNCAO_VALUE;
  option.textContent = '+ Digitar nova funcao';
  select.appendChild(option);
};

const setSelectValueAndNotify = (select: HTMLSelectElement, value: string) => {
  if (value && !Array.from(select.options).some((option) => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const getSavedAsoDate = () => {
  try {
    return window.localStorage.getItem(ASO_DATE_STORAGE_KEY) || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const getSelectedAsoDate = () => {
  const input = document.getElementById(ASO_DATE_INPUT_ID) as HTMLInputElement | null;
  return input?.value || getSavedAsoDate();
};

const isAsoActionButton = (target: EventTarget | null) => {
  const element = target instanceof Element ? target.closest('button') : null;
  const text = element?.textContent?.toLowerCase() || '';
  return text.includes('gerar guia aso') || text.includes('enviar guia aso');
};

const withAsoDateForCurrentClick = (dateValue: string) => {
  if (!dateValue) return;

  const RealDate = window.Date;
  const fixedNow = new RealDate(`${dateValue}T12:00:00`);

  const PatchedDate = function DateOverride(this: unknown, ...args: any[]) {
    if (this instanceof PatchedDate) {
      return args.length ? new (RealDate as any)(...args) : new RealDate(fixedNow.getTime());
    }
    return args.length ? (RealDate as any)(...args) : new RealDate(fixedNow.getTime()).toString();
  } as any;

  PatchedDate.UTC = RealDate.UTC;
  PatchedDate.parse = RealDate.parse;
  PatchedDate.now = () => fixedNow.getTime();
  PatchedDate.prototype = RealDate.prototype;

  window.Date = PatchedDate;
  window.setTimeout(() => {
    window.Date = RealDate;
  }, 0);
};

const ensureAsoDateInput = () => {
  if (document.getElementById(ASO_DATE_INPUT_ID)) return;

  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const gerarButton = buttons.find((button) => (button.textContent || '').toLowerCase().includes('gerar guia aso'));
  const toolbar = gerarButton?.parentElement;
  if (!toolbar) return;

  const wrapper = document.createElement('label');
  wrapper.className = 'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-background';
  wrapper.setAttribute('title', 'Data que aparecera na guia ASO gerada');

  const span = document.createElement('span');
  span.textContent = 'Data exame';
  span.className = 'text-xs text-muted-foreground whitespace-nowrap';

  const input = document.createElement('input');
  input.id = ASO_DATE_INPUT_ID;
  input.type = 'date';
  input.value = getSavedAsoDate();
  input.className = 'bg-transparent text-sm outline-none min-w-[132px]';
  input.addEventListener('change', () => {
    try {
      window.localStorage.setItem(ASO_DATE_STORAGE_KEY, input.value);
    } catch {
      // O valor atual da tela continua valendo.
    }
  });

  wrapper.appendChild(span);
  wrapper.appendChild(input);
  toolbar.insertBefore(wrapper, gerarButton);
};

const useTopacEnhancements = () => {
  useEffect(() => {
    const handleChange = async (event: Event) => {
      const target = event.target;

      if (target instanceof HTMLSelectElement && target.value === CUSTOM_FUNCAO_VALUE) {
        const typed = window.prompt('Digite a nova funcao/cargo para este pre-cadastro:');
        const funcao = String(typed || '').trim().replace(/\s+/g, ' ').toUpperCase();
        setSelectValueAndNotify(target, funcao);
        return;
      }

      if (!(target instanceof HTMLInputElement) || target.type !== 'file') return;
      if (!target.hasAttribute(MULTI_UPLOAD_ATTR)) return;
      if (target.hasAttribute(SYNTHETIC_CHANGE_ATTR)) return;

      const files = Array.from(target.files || []);
      if (files.length <= 1) return;

      event.stopImmediatePropagation();
      event.preventDefault();

      for (const file of files) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        target.files = transfer.files;
        target.setAttribute(SYNTHETIC_CHANGE_ATTR, 'true');
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.removeAttribute(SYNTHETIC_CHANGE_ATTR);
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }

      target.value = '';
    };

    const applyEnhancements = () => {
      ensureCustomFuncaoOption();
      ensureAsoDateInput();
      ensureMultiDocumentUpload();
    };

    applyEnhancements();
    const observer = new MutationObserver(applyEnhancements);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', handleChange, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('change', handleChange, true);
    };
  }, []);
};

const useSelectableAsoDate = () => {
  useEffect(() => {
    const handleAsoClick = (event: MouseEvent) => {
      if (!isAsoActionButton(event.target)) return;
      withAsoDateForCurrentClick(getSelectedAsoDate());
    };

    ensureAsoDateInput();
    const observer = new MutationObserver(ensureAsoDateInput);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleAsoClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleAsoClick, true);
    };
  }, []);
};

const PreCadastroAdmissionalPage: React.FC = () => {
  useTopacEnhancements();
  useSelectableAsoDate();
  return <PreCadastroAdmissionalOcrPage />;
};

export default PreCadastroAdmissionalPage;
