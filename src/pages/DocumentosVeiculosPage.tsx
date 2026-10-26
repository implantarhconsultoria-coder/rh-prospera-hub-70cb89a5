import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FrotaCadastroInteligente from '@/components/frota/FrotaCadastroInteligente';
import FrotaHistoricoDocumentos from '@/components/frota/FrotaHistoricoDocumentos';
import DocumentosVeiculosPageLegacy from './DocumentosVeiculosPageLegacy';

const DocumentosVeiculosPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [buscaDocumento, setBuscaDocumento] = useState('');
  const protectLegacyDelete = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button');
    if (!button || !button.querySelector('svg.lucide-trash-2')) return;
    const confirmed = window.confirm('Excluir definitivamente este ativo da Frota? O documento deixará de aparecer na lista. Esta ação não pode ser desfeita.');
    if (!confirmed) { event.preventDefault(); event.stopPropagation(); }
  };
  return (
    <div className="space-y-5 animate-fade-in">
      <style>{`.frota-documentos-sem-manutencao .card-premium:has(svg.lucide-wrench){display:none!important}`}</style>
      <FrotaCadastroInteligente onSaved={() => setRefreshKey(current => current + 1)} />

      <section aria-label="Pesquisar documentos da Frota" className="card-premium space-y-3 border border-primary/30 p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Search className="h-5 w-5 text-primary" />
            Buscar documento da Frota
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesquise em documentos atuais e versões anteriores por placa, RENAVAM, patrimônio, chassi, descrição ou empresa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Buscar documentos por placa, RENAVAM, patrimônio, chassi, descrição ou empresa"
            type="search"
            autoComplete="off"
            value={buscaDocumento}
            onChange={(event) => setBuscaDocumento(event.target.value)}
            placeholder="Digite placa, RENAVAM, patrimônio, chassi ou nome do veículo..."
            className="h-12 min-w-[220px] flex-1"
          />
          {buscaDocumento && (
            <Button type="button" variant="outline" className="h-12" onClick={() => setBuscaDocumento('')}>
              <X className="mr-2 h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {buscaDocumento.trim()
            ? 'Resultados filtrados automaticamente nas duas listas abaixo.'
            : 'Comece a digitar para localizar rapidamente o documento.'}
        </p>
      </section>

      <FrotaHistoricoDocumentos key={`hist-${refreshKey}`} busca={buscaDocumento} />
      <div className="frota-documentos-sem-manutencao" onClickCapture={protectLegacyDelete}>
        <DocumentosVeiculosPageLegacy key={refreshKey} searchValue={buscaDocumento} onSearchChange={setBuscaDocumento} />
      </div>
    </div>
  );
};
export default DocumentosVeiculosPage;