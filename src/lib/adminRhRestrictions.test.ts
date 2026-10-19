import { describe, expect, it } from 'vitest';
import { isAdminRhRestrito, isAssinaturaDigitalBlockedPath, isDashboardFinanceiroBlockedPath } from './adminRhRestrictions';

describe('restrições da administradora de RH', () => {
 it('identifica só o login individual da Daphine',()=>{
   expect(isAdminRhRestrito(' ADM1.MATRIZ@TOPAC.COM.BR ')).toBe(true);
   expect(isAdminRhRestrito('adm.matriz@topac.com.br')).toBe(false);
   expect(isAdminRhRestrito(null)).toBe(false);
 });
 it('bloqueia folha/assinatura mesmo com URL direta ou subrota',()=>{
   expect(isAssinaturaDigitalBlockedPath('/admin/folha-pagamento')).toBe(true);
   expect(isAssinaturaDigitalBlockedPath('/admin/folha-pagamento/documento')).toBe(true);
   expect(isAssinaturaDigitalBlockedPath('/admin/funcionarios')).toBe(false);
   expect(isAssinaturaDigitalBlockedPath('/admin/folha-pagamento-outro')).toBe(false);
   expect(isDashboardFinanceiroBlockedPath('/admin/diretoria')).toBe(true);
   expect(isDashboardFinanceiroBlockedPath('/admin/diretoria/financeiro')).toBe(true);
   expect(isDashboardFinanceiroBlockedPath('/admin/funcionarios')).toBe(false);
 });
});
