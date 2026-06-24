import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';

const CUSTOM_FUNCAO_VALUE = '__topac_custom_funcao__';

const findFuncaoSelect = () => {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  return selects.find((select) => {
    const label = select.parentElement?.querySelector('label')?.textContent || '';
    return label.trim().toLowerCase().startsWith('funcao');
  }) || null;
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

const useCustomFuncaoOption = () => {
  useEffect(() => {
    const handleChange = (event: Event) => {
      const select = event.target as HTMLSelectElement | null;
      if (!(select instanceof HTMLSelectElement)) return;
      if (select.value !== CUSTOM_FUNCAO_VALUE) return;

      const typed = window.prompt('Digite a nova funcao/cargo para este pre-cadastro:');
      const funcao = String(typed || '').trim().replace(/\s+/g, ' ').toUpperCase();
      setSelectValueAndNotify(select, funcao);
    };

    ensureCustomFuncaoOption();
    const observer = new MutationObserver(ensureCustomFuncaoOption);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', handleChange, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('change', handleChange, true);
    };
  }, []);
};

const PreCadastroAdmissionalPage: React.FC = () => {
  useCustomFuncaoOption();
  return <PreCadastroAdmissionalOcrPage />;
};

export default PreCadastroAdmissionalPage;
