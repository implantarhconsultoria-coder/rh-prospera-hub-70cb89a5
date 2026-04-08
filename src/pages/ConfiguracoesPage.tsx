import React from 'react';
import { Building2, Shield, Code, Award } from 'lucide-react';

const ConfiguracoesPage: React.FC = () => {
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold font-display text-foreground">Sobre a Plataforma</h1>
      </div>

      <div className="card-premium p-6 space-y-6">
        <div className="text-center pb-5 border-b border-border">
          <div className="w-20 h-20 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl font-bold text-accent-foreground font-display">T</span>
          </div>
          <h2 className="text-xl font-bold font-display text-foreground">Topac RH Multiempresa PRO</h2>
          <p className="text-sm text-muted-foreground mt-1">Plataforma de Gestão de Recursos Humanos</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Code className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Desenvolvido por</p>
              <p className="text-sm text-muted-foreground">ImplantaRH ConsultoriaPRO</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Award className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Versão</p>
              <p className="text-sm text-muted-foreground">1.0.0 — Multiempresa PRO</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Direitos Autorais</p>
              <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ImplantaRH ConsultoriaPRO. Todos os direitos reservados.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Finalidade</p>
              <p className="text-sm text-muted-foreground">Gestão completa de RH: folha, benefícios, EPI, uniformes, relatórios e controle multiempresa.</p>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-center text-xs text-muted-foreground mt-4">
          <p>Sistema de uso exclusivo da empresa contratante.</p>
          <p className="mt-1">Suporte técnico: ImplantaRH ConsultoriaPRO</p>
        </div>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
