import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app-mecanico/pages/AbastecimentoPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260612120000_abastecimentos_vinculo_recibo_pdf.sql', 'utf8');

describe('fluxo completo do abastecimento mecânico', () => {
  it('executa painel antes da bomba e mantém correção manual recolhida', () => {
    expect(page).toContain('setStep("painel")');
    expect(page).toContain('setStep("bomba")');
    expect(page.indexOf('{step === "painel"')).toBeLessThan(page.indexOf('{step === "bomba"'));
    expect(page).toContain('Corrigir leitura');
    expect(page).toContain('Confirmar e gerar recibo');
  });

  it('gera, envia e vincula o PDF ao abastecimento salvo', () => {
    expect(page).toContain('gerarCupomAbastecimentoPdf');
    expect(page).toContain('app_mecanico_vincular_recibo_pdf');
    expect(page).toContain('Compartilhar PDF');
    expect(page).toContain('Visualizar PDF');
    expect(page).toContain('Baixar PDF');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS recibo_pdf_url text');
    expect(migration).toContain('AND acesso_externo_id = v.id');
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.app_mecanico_vincular_recibo_pdf(uuid, uuid, text)");
  });
});
