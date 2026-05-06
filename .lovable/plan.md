## Objetivo

Corrigir o travamento da tela "Link inválido ou expirado" (rotas `/m/:token`, e qualquer link antigo de `/campo`, `/operacional`, `/mecanico`, `/acesso`) adicionando botões de saída. Sem mexer em layout dos módulos, cálculos, autenticação ou criação de acessos.

## Arquivo único a alterar

`src/context/TecnicoAppContext.tsx` — bloco do `if (error || !tecnico)` (linhas 127–139). Hoje só mostra ícone + texto, sem nenhuma ação. É o único lugar do projeto que renderiza essa mensagem (`rg` confirmou).

## O que será feito

Substituir o bloco de erro por uma tela com os mesmos visuais (mesma cor de fundo, ícone, tipografia) acrescentando 3 botões fixos + 1 condicional para admin:

1. **Ir para Login** → `window.location.href = '/login'`
2. **Voltar ao Início**:
   - Se `userRole === 'admin'` → `/admin`
   - Caso contrário → `/login`
3. **Limpar sessão e tentar novamente**:
   - `await supabase.auth.signOut()`
   - `localStorage.clear()`
   - `sessionStorage.clear()`
   - `window.location.href = '/login'`
4. **Abrir Painel Admin** (só renderiza se `userRole === 'admin'`) → `/admin`

Para detectar admin, usar o hook `useApp()` (`src/hooks/useApp.ts`) já presente no projeto, que expõe `userRole` e `session`. Importar `supabase` de `@/integrations/supabase/client`.

## Cobertura das rotas antigas

- `/m/:token` — usa `TecnicoAppProvider`, então já é coberto pela alteração.
- `/mecanico` — `MecanicoRedirectPage` já trata token ausente com lista/aviso próprio (não usa a tela de "link inválido"); nada a mudar lá.
- `/campo`, `/operacional`, `/acesso` — não renderizam essa mensagem específica; quem renderiza é só o provider do app mecânico. Se o usuário cair em link antigo `/m/<token-velho>`, a nova tela permitirá sair.

## Detalhes técnicos

- Manter `loading` state inalterado (apenas o spinner).
- Manter o texto "Link inválido ou expirado" e a frase explicativa atuais.
- Botões usando classes Tailwind já adotadas no projeto (`bg-primary`, `bg-white/10`, `border border-white/15`, `rounded-xl`, `py-2.5 px-4 text-sm font-semibold`) para não criar novo padrão visual.
- Botão "Limpar sessão" deve ser `async` e tolerante a falha do `signOut` (try/catch silencioso, sempre redireciona).
- Sem nova rota, sem novo componente, sem mudança em router, sem mudança em RLS/edge functions.

## Fora do escopo (não tocar)

- `src/App.tsx`, `AppLayout`, `CampoLayout`, `OperacionalLayout`, `MecanicoLayout`, `MecanicoRedirectPage`, `AguardandoAcesso`.
- Qualquer cálculo (`pontoCalc`, `rescisaoCalc`, etc.).
- Tabelas/migrations Supabase, roles, edge functions.
- Login, signup, recuperar/redefinir senha.
