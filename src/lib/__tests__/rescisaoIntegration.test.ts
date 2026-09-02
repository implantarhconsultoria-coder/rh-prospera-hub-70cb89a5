import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRescisaoPdfName } from '@/lib/rescisaoPdf';

const page = readFileSync(resolve(process.cwd(), 'src/pages/RescisaoPage.tsx'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260807113000_rescisoes_motor_periodos_auditavel.sql'), 'utf8');

describe('integração do módulo de rescisões', () => {
  it('remove o conceito de meses estimados da interface principal', () => {
    expect(page).not.toContain('Meses de férias vencidas estimados');
    expect(page).not.toContain('feriasVencidasMeses');
    expect(page).toContain('Férias calculadas automaticamente');
    expect(page).toContain('Ver memória de cálculo');
  });

  it('persiste memória e auditoria sem duplicar a tabela de férias', () => {
    expect(page).toContain("from('ferias_avisos')");
    expect(page).toContain("from('rescisao_historico')");
    expect(page).toContain('periodos_ferias_json');
    expect(migration).toContain('alter table if exists public.ferias_avisos');
    expect(migration).not.toContain('create table if not exists public.rescisao_ferias');
  });

  it('mantém descontos detalhados e alterações manuais auditadas', () => {
    expect(page).toContain('Adiantamento de 13º');
    expect(page).toContain('Vale-transporte');
    expect(page).toContain('Vale-refeição');
    expect(page).toContain('Empréstimos');
    expect(page).toContain('Pensão');
    expect(page).toContain('Danos/descontos autorizados');
    expect(page).toContain('Valor alterado manualmente');
  });

  it('padroniza o nome da memória de cálculo', () => {
    expect(buildRescisaoPdfName('TOPAC', 'Adalto Jacinto', '2026-08')).toBe('TOPAC_RH_MemoriaRescisao_AdaltoJacinto_Agosto2026.pdf');
  });
});
