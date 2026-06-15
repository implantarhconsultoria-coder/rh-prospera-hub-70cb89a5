import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app-mecanico/pages/AbastecimentoPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260612120000_abastecimentos_vinculo_recibo_pdf.sql', 'utf8');
const storageMigration = readFileSync('supabase/migrations/20260612153000_app_mecanico_storage_upload_permissions.sql', 'utf8');
const functionsConfig = readFileSync('supabase/config.toml', 'utf8');
const ocrFunction = readFileSync('supabase/functions/ocr-bomba-combustivel/index.ts', 'utf8');

describe('fluxo completo do abastecimento mecânico', () => {

  it('mantém a resolução do PR sem marcadores e preserva o fluxo mais novo', () => {
    expect(page).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(page).toContain('normalizeOdometerOcrResult');
    expect(page).toContain('normalizePumpOcrResult');
    expect(page).toContain('setStep("form")');
    expect(page).toContain('Refazer bomba');
    expect(page).toContain('Refazer painel');
    expect(page).toContain('app_mecanico_registrar_abastecimento_posto');
    expect(page).toContain('gerarCupomAbastecimentoPdf');
    expect(page).toContain('app_mecanico_vincular_recibo_pdf');
    expect(page).toContain('Compartilhar PDF');
    expect(page).toContain('Visualizar PDF');
  });

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

  it('permite OCR externo com chave publicável e restringe uploads ao acesso mecânico ativo', () => {
    expect(functionsConfig).toContain('[functions.ocr-bomba-combustivel]');
    expect(functionsConfig).toMatch(/\[functions\.ocr-bomba-combustivel\]\s+verify_jwt = false/);
    expect(ocrFunction).toContain('hasValidPublishableKey(req)');
    expect(ocrFunction).toContain('req.headers.get("apikey")');
    expect(storageMigration).toContain("acesso.modulo = 'mecanico'");
    expect(storageMigration).toContain("acesso.status = 'ativo'");
    expect(storageMigration).toContain("v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')");
  });

});
