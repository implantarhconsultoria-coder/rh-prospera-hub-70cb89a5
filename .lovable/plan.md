# Remoção do App Mecânico antigo

Objetivo: eliminar TODO o App Mecânico antigo (rotas, telas, layout, provider, redirects, botões de menu) sem mexer em login admin, filial, financeiro, faturamento, RH, almoxarifado, operacional ou nos demais acessos externos por PIN. Dados no banco permanecem intactos.

## O que será removido

### Rotas (em `src/App.tsx`)
- `/mecanico` (link único + `MecanicoRedirectPage`)
- `/m/:token` e todas as sub-rotas (`ponto`, `chamados`, `estoque`, `km`, `abastecimento`, `galoes`, `historico`)
- `/mecanico-ext/:acessoId` (`MecanicoExtRedirect`)
- `/acesso-mecanico` (tela de PIN do mecânico)
- Imports relacionados: `MecanicoLayout`, `MecanicoRedirectPage`, `MecanicoExtRedirect`, `MecanicoHomePage`, `MecanicoPontoPage`, `MecanicoChamadosPage`, `MecanicoEstoquePage`, `MecanicoKmPage`, `MecanicoAbastecimentoPage`, `MecanicoGaloesPage`, `MecanicoHistoricoPage`
- Redirecionamentos `/campo`, `/campo/*`, `/operacional`, `/operacional/*` que apontam para `/mecanico` → passam a ir para `/admin` (NotFound só aparece se usuário não tiver outro portal; não afeta os portais existentes pois `RoleRedirect` continua direcionando)
- Em `RoleRedirect`: tirar `tecnico_campo` e `operacional` apontando para `/mecanico` → mandar para `/admin` (admin só) ou manter, mas sem destino mecânico

### Arquivos deletados
- `src/components/MecanicoLayout.tsx`
- `src/context/TecnicoAppContext.tsx` (provider/hook antigo)
- `src/pages/MecanicoRedirectPage.tsx`
- `src/pages/MecanicoExtRedirect.tsx`
- `src/pages/mecanico/` (pasta inteira: Home, Ponto, Chamados, Estoque, Km, Abastecimento, Galoes, Historico)
- Edge function `supabase/functions/tecnico-app/` (lógica antiga de token), via `delete_edge_functions`

### Limpezas pontuais (manter o resto do arquivo intacto)
- `src/components/ModuleSwitcher.tsx`: remover entrada `App Mecânico` e bloco `effectiveRoles`/`operacional → tecnico_campo`
- `src/components/AppLayout.tsx` e `src/components/FilialLayout.tsx`: remover ramos `tecnico_campo`/`operacional` que redirecionam para `/mecanico`
- `src/pages/ConfiguracoesPage.tsx`: remover item "App Mecânico (link único…)"
- `src/pages/admin/AppOperacionalPage.tsx`: remover botão "👁 Visualizar App" que abre `/mecanico`
- `src/pages/admin/AcessosExternosPage.tsx`:
  - Remover opção `mecanico_externo` da lista de perfis e default do form
  - Remover branch `if (a.modulo === 'mecanico')` que abre `/acesso-mecanico`
- `src/pages/AcessoExternoPage.tsx`: remover entrada `mecanico` em `MODULOS`, default fallback e branch que carrega `funcionario_id` para mecânico/campo/operacional
- `src/hooks/useAcessoExternoFiltro.ts`: tirar `mecanico` da regex `EXT_ROUTE_RE`
- `src/components/ExternoLayout.tsx`: remover `mecanico` do comentário de módulos suportados (cosmético)
- `src/App.tsx`: remover constantes `EXT_ITEMS_MEC` e ícones usados só por ela (`Home, Clock, ClipboardList, Boxes, Gauge, Fuel, Container, History`) se não usados em outro lugar

### Mantido sem alteração
- Login admin, autenticação e roles
- Portais Admin, Filial, Financeiro, Faturamento, Operacional, Campo, Almoxarifado
- Demais acessos externos por PIN (`/acesso-financeiro`, `/acesso-filial`, `/acesso-almoxarifado`, `/acesso-operacional`, `/acesso-campo`, `/acesso-faturamento`)
- Tabelas e dados no banco (`tecnicos_campo`, registros de ponto/km/abastecimento etc.) — apenas deixam de ser usados pelo app removido
- Identidade visual

## Resultado esperado

- Nenhuma rota `/mecanico*`, `/m/:token`, `/mecanico-ext/*` ou `/acesso-mecanico` ativa
- Menu/seletor de módulos sem "App Mecânico"
- Página de Configurações sem o item App Mecânico
- Painel "App Operacional" sem botão "Visualizar App"
- Cadastro de acesso externo sem perfil "Mecânico Externo"
- Build limpo, demais portais funcionam normalmente
- Pronto para reconstruir o App Mecânico do zero em etapa futura
