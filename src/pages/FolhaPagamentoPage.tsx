import React, { useEffect, useMemo, useState } from 'react';
import { Building2, FileSignature } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PayrollSignatureModule from '@/components/payroll/PayrollSignatureModule';
import BenefitSignatureGenerator from '@/components/payroll/BenefitSignatureGenerator';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const SIGNATURE_COMPANIES = [
  { cnpj: '07291648000103', label: 'TOPAC MATRIZ' },
  { cnpj: '07291648000294', label: 'TOPAC PRAIA GRANDE' },
  { cnpj: '07291648000375', label: 'TOPAC GOIÂNIA' },
  { cnpj: '14464586000150', label: 'ALQUI' },
  { cnpj: '21967711000100', label: 'LMT' },
] as const;

const FolhaPagamentoPage: React.FC = () => {
  const { companies } = useApp();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  const signatureCompanies = useMemo(() => SIGNATURE_COMPANIES
    .map(config => {
      const company = companies.find(c => digits(c.cnpj) === config.cnpj);
      return company ? { ...company, signatureLabel: config.label } : null;
    })
    .filter(Boolean) as Array<(typeof companies)[number] & { signatureLabel: string }>, [companies]);

  useEffect(() => {
    if (!signatureCompanies.length) return;
    if (!selectedCompany || !signatureCompanies.some(company => company.id === selectedCompany)) {
      setSelectedCompany(signatureCompanies[0].id);
    }
  }, [signatureCompanies, selectedCompany]);

  const selectedCompanyData = signatureCompanies.find(company => company.id === selectedCompany);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
          <FileSignature className="w-6 h-6" /> Assinatura Digital
        </h1>
        <p className="text-sm text-muted-foreground">Holerites, comprovantes, VR e VT para conferência e assinatura.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {signatureCompanies.map(company => {
          const active = company.id === selectedCompany;
          return (
            <button
              key={company.id}
              type="button"
              onClick={() => setSelectedCompany(company.id)}
              className={`card-premium p-3 text-left transition-all hover:ring-2 hover:ring-primary/30 ${active ? 'ring-2 ring-primary/60 bg-primary/10' : ''}`}
            >
              <Building2 className="w-4 h-4 text-primary mb-2" />
              <span className="block text-xs font-semibold text-foreground">{company.signatureLabel}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">Clique para abrir</span>
            </button>
          );
        })}
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label className="text-xs text-muted-foreground">Competência do documento</label>
          <Input type="month" value={competencia} onChange={event => setCompetencia(event.target.value)} />
        </div>
        <div className="pb-2 text-xs text-muted-foreground">
          Empresa aberta: <strong className="text-foreground">{selectedCompanyData?.signatureLabel || '—'}</strong>
        </div>
      </Card>

      {selectedCompany ? (
        <>
          <PayrollSignatureModule companyId={selectedCompany} competencia={competencia} />
          <BenefitSignatureGenerator companyId={selectedCompany} competencia={competencia} />
        </>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">Carregando empresas habilitadas para assinatura...</Card>
      )}
    </div>
  );
};

export default FolhaPagamentoPage;
