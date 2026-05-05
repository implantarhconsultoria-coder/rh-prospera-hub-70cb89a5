import React from 'react';

const FooterSobre: React.FC<{ variant?: 'light' | 'dark' }> = ({ variant = 'light' }) => {
  const cls = variant === 'dark'
    ? 'text-[10px] text-white/60'
    : 'text-[10px] text-muted-foreground';
  return (
    <div className={`text-center py-3 px-4 leading-relaxed ${cls}`}>
      © {new Date().getFullYear()} <strong>ImplantaRH ConsultoriaPRO</strong> — Responsável: Rodrigo de Souza Sabino.
      Todos os direitos reservados. Proibida cópia, reprodução, revenda ou engenharia reversa sem autorização expressa.
    </div>
  );
};

export default FooterSobre;
