## Diagnóstico

A tela 404 "Oops! Page not found" do screenshot **não** é a tela "Link inválido ou expirado" — é o `NotFound` do React Router. Causa raiz:

1. Em `src/App.tsx`, o `AuthGate` (autenticado) **não tem rota `/login` nem `/index`**. Qualquer URL fora do conjunto admin/filial/faturamento/financeiro cai em `<Route path="*" element={<NotFound />} />` → tela cinza com "404".
2. O botão "Ir para Login" / "Limpar sessão" que adicionei na tela de link inválido manda para `/login`. Como essa rota não existe, o usuário (já autenticado, ex.: admin) cai no 404 e não consegue voltar.
3. Mesma coisa quando o navegador chega em `/index` (rota literal vista no print) — não há mapeamento.
4. Para usuário **não** autenticado, `AuthGate` já renderiza `LoginPage` em `path="*"`, então `/login` funcionaria; o problema só ocorre quando há sessão.

Resumindo: o "ninguém entra, nem o admin" é causado pelas redireções do app baterem em `/login` quando o admin já está logado, gerando 404.

## Correção (1 arquivo)

`src/App.tsx` — dentro do `AuthGate` autenticado, adicionar duas rotas de compatibilidade que delegam ao `RoleRedirect`:

```tsx
<Route path="/" element={<RoleRedirect />} />
<Route path="/index" element={<Navigate to="/" replace />} />
<Route path="/login" element={<Navigate to="/" replace />} />
```

Efeitos:
- Admin logado que cair em `/login` ou `/index` → vai para `/` → `RoleRedirect` → `/admin`.
- Filial/operacional/etc. seguem para o portal correto via `RoleRedirect`.
- Usuário não autenticado continua vendo `LoginPage` (nada muda no fluxo de login).

## Fora do escopo

Não mexer em: `LoginPage`, layouts dos portais, `useUserRole`, RLS, edge functions, cálculos. Sem novas tabelas. Sem mudança visual.
