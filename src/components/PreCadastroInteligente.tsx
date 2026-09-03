import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import { interpretarPreCadastroLivre, type SmartAdmissionResult } from '@/lib/preCadastroInteligente';

const PreCadastroInteligente: React.FC = () => {
  const { companies, employees } = useApp();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [, setResultado] = useState<SmartAdmissionResult | null>(null);

  const fechar = () => {
    setOpen(false);
  };

  const interpretar = () => {
    const resultado = interpretarPreCadastroLivre(texto, {
      companies: companies.map((company: any) => ({
        id: company.id,
        name: company.name || company.nome,
        razaoSocial: company.razaoSocial || company.razao_social,
      })),
      roles: Array.from(new Set(employees.map((employee: any) => String(employee.cargo || '').trim()).filter(Boolean))),
    });
    setResultado(resultado);
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-2 border border-violet-400/30 bg-violet-600 text-white shadow-sm hover:bg-violet-500"
      >
        <Sparkles className="h-4 w-4" />
        PREENCHIMENTO INTELIGENTE
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-violet-500/30 bg-background shadow-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-violet-500" />
              PREENCHIMENTO INTELIGENTE
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cole as informações do colaborador abaixo. Não é necessário organizar os dados.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              className="min-h-[300px] resize-y border-violet-500/20 bg-muted/20 leading-6 focus-visible:ring-violet-500"
              placeholder={`Exemplo:\n\nAmanda Oliveira Santos\nTOPAC Matriz\nsalário 2400\nVR 31 por dia\nVT sim\nadmissão 08/09/2026\nCPF 39118566895\n\nVocê pode informar os dados em qualquer ordem.`}
              autoFocus
            />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={fechar}>
                CANCELAR
              </Button>
              <Button type="button" variant="outline" onClick={() => setTexto('')} disabled={!texto}>
                LIMPAR
              </Button>
              <Button type="button" onClick={interpretar} disabled={!texto.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" />
                INTERPRETAR INFORMAÇÕES
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreCadastroInteligente;
