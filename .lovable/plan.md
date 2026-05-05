## Plano de execução — Pente fino + acessos de teste + editabilidade

Sigo a fila já definida sem abrir nova pergunta. Itens novos desta rodada estão integrados.

### 1. Acessos de teste (FAT e FINANCEIRO) — prioridade alta
Como o Supabase Auth exige e-mail, vou criar duas contas internas com e-mail "técnico" mas login amigável:
- **fat@topac.local** — senha `TOPAC2026` — role nova `faturamento`
- **fin@topac.local** — senha `TOPAC2026` — role nova `financeiro`

Na tela de login, aceitar o atalho **`FAT`** e **`FIN`** (sem @) e converter automaticamente para o e-mail interno antes de chamar `signInWithPassword`. Assim o usuário digita só `FAT` / `FIN` + senha.

Migration:
- Adicionar valores `faturamento` e `financeiro` ao enum `app_role`.
- Criar/garantir as contas via edge function `provision-test-user` (já existe) chamada uma vez, e inserir as roles em `user_roles`.
- Criar policies `SELECT` para essas roles nas tabelas `clientes_fat`, `contratos`, `contrato_equipamentos`, `titulos_receber`, `titulos_pagar`, `contas_bancarias`, `categorias_financeiras`, `centros_custo`, `cobrancas_tentativas`, `conciliacoes`, `movimentacoes_bancarias`, `recebimentos`, `pagamentos` (somente leitura nesta fase de teste — evita estragar dados enquanto o pessoal só está olhando).

Roteamento:
- `RoleRedirect` envia `faturamento` → `/faturamento` e `financeiro` → `/financeiro`.
- Layouts de Faturamento e Financeiro ficam acessíveis com essas roles (além de admin).

### 2. Links dos portais visíveis e copiáveis
Adicionar bloco **"Links de acesso"** em `/admin/configuracoes` (seção nova "Acessos de teste e portais"), com botão Copiar para cada link:
- Plataforma admin: `/admin`
- Filial Praia Grande: `/filial`
- Filial Goiânia: `/filial`
- App Operacional / Mecânicos: `/mecanico` (e link individual por técnico já gerado em `/admin/app-operacional`)
- Campo: `/campo`
- Faturamento: `/faturamento` (login `FAT` / `TOPAC2026`)
- Financeiro: `/financeiro` (login `FIN` / `TOPAC2026`)

URL base = `window.location.origin` (funciona tanto em preview quanto no domínio publicado `https://implantarhprpro.com`).

### 3. Prestadores totalmente editável
Refatorar `PrestadoresPage`:
- Adicionar botão **Editar** em cada linha → abre painel lateral com TODOS os campos editáveis: nome, CPF, função, empresa pagadora (select), valor diário/quinzenal, próximo pagamento (date), status (ativo/inativo), banco/titular/tipo conta/agência/conta, observação, dias de trabalho, dias trabalhados, valor a pagar, data de referência.
- Botão **Excluir** com confirmação.
- Botão **Recibo** já existente: garantir que pega dados atualizados.
- Persistir via `supabase.from('prestadores').update(...)` — sem voltar ao valor antigo.
- Histórico de pagamentos: tabela `prestadores_pagamentos` (já existe ou criar) listada abaixo, editável e excluível.

### 4. Compras editável
Em `ComprasPage`: adicionar coluna ações com **Editar** (abre dialog reaproveitando o de criação, pré-preenchido) e **Excluir**. Permite alterar item, quantidade, fornecedor, valor estimado, valor real, observação, status e datas.

Policies já permitem UPDATE/DELETE para admin; adicionar DELETE para filial dona.

### 5. Editabilidade geral nos demais módulos
Auditar e garantir botão Editar/Excluir nos cards/linhas de:
- Almoxarifado (itens, entradas, saídas) — já existe, validar.
- Combustível (lançamentos do admin) — adicionar editar/excluir.
- Protocolos — adicionar editar/excluir.
- Avisos de férias — adicionar editar/excluir.
- Documentos de veículos — adicionar editar/excluir.
- Folha de pagamento e Rescisão — campos editáveis antes de gerar PDF (já estão).
- Fechamento — soft-delete já existe; garantir que UPDATE em campo individual persiste (já está corrigido em wave 1).

Padrão: reaproveitar Dialog + form controlado, `supabase.update().eq('id', x)`, refresh local imediato.

### 6. Continuação da fila já definida
- Build estável: ok (já corrigido).
- Telas quebradas (uniformes/atestados/importar-fechamento/conferência-ponto): trocar `<table>` aninhadas dentro de `<div>` com `whitespace` por estruturas válidas; envolver listas dinâmicas com `key` estável; usar `ItemCombobox`/`EmployeeCombobox` onde houver busca; eliminar `insertBefore` causados por translate.
- Marca d'água: já removida via `vite.config.ts`. Adicionar `<meta name="lovable-badge" content="false">` por garantia.
- Impressão/PDF: revisar `printInPage.ts` para usar `@media print { body * { visibility: hidden } .print-sheet, .print-sheet * { visibility: visible } }` — isola área de impressão.
- Importações separadas: já estão (atestados em `/admin/atestados`, fechamento em `/admin/importar-fechamento`).
- Arquivamento automático: ao gerar PDF (folha, rescisão, recibo), inserir registro em `documentos_funcionario` com `arquivo_url` do storage.
- Busca fácil: integrar `EmployeeCombobox` em ASO, EPI, Uniforme, Atestados, Folha, Rescisão.
- Estoque/almoxarifado: ajustar lógica de **recarga** (ItemCombobox + "lançar manualmente" para item não cadastrado, sem travar).
- Monitoramento: tela já existe; garantir consulta em `activity_log` com "online agora" (last_activity_at > now()-5min) e histórico por pessoa.
- Bloqueio por horário: tabela `config_acesso_horario` com flag `enabled=false` por padrão; admin (você) sempre liberado via `acesso_excepcional` ou bypass por role admin.
- Módulos visíveis no menu: Combustível, Doc. Veículos, Protocolo, Liberação, Aviso Férias, Compras, Folha, Rescisão — já roteados; revisar `AppSidebar` para garantir que aparecem.

### 7. Resumo das mudanças técnicas
- **Migration nova**: extender enum `app_role` (+ faturamento, +financeiro), policies SELECT, tabela `config_acesso_horario` (se não existir).
- **Edge function**: chamar `provision-test-user` para criar `fat@topac.local` e `fin@topac.local`.
- **Front**:
  - `LoginPage`: alias `FAT`/`FIN` → e-mail interno.
  - `App.tsx` + `RoleRedirect`: roteamento das novas roles.
  - `ConfiguracoesPage`: bloco "Links de acesso" com copy-to-clipboard.
  - `PrestadoresPage`: edição completa + exclusão.
  - `ComprasPage`: edição + exclusão.
  - Diversos módulos: botão editar/excluir consistente.
  - `index.css`: regras de impressão isoladas.
  - `useUserRole`: incluir `faturamento` e `financeiro` na lista de prioridade.

### Entrega final
Devolverei:
- Lista do que foi corrigido.
- Acessos criados (FAT / FIN).
- Links prontos para copiar/testar.
- Pendências de validação visual (telas que dependem de dados reais para conferir).

Sem questionários intermediários.