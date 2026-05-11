# Pacote Geral TOPAC RH PRO — Plano de Execução

São 32 blocos de mudanças que tocam quase todos os módulos. Para **não quebrar o que já funciona** (login/PIN, App Mecânico, RH, VR/VT, EPI, Faturamento, Financeiro, Almoxarifado, QRCode), vou executar em **6 fases**. Cada fase é entregável e testável isoladamente. Você aprova → eu executo a fase → você valida → seguimos.

---

## FASE 1 — Segurança e Permissões (crítico, bloqueante)
Itens 2, 3, 4, 5, 7, 31

- Corrigir UNIQUE constraint de `acessos_externos` por `funcionario_id`/`cpf` (não por PIN).
- Bloquear EPI/Uniformes para externos, filiais e almoxarifado (menu **e** rota direta `/epi`, `/uniformes`, `/admin/epi`, `/entrega-epi`, etc.).
- Bloquear aprovação/liberação de carga para externos — só admin libera.
- Reforçar isolamento por filial (Goiânia só Goiânia, Praia só Praia).
- Guard de rota universal: redireciona + aviso "Acesso não permitido".

## FASE 2 — Acesso Único por CPF/PIN + Configurações Básicas
Itens 1, 18-A, 18-B (parcial), 19 (parcial)

- Consolidar tela `/acesso` único: PIN → identifica usuário → abre módulos liberados.
- Reorganizar Configurações: seção "Links" mostra só o link único + admin + mecânico.
- Painel de Permissões básico (ver/editar liberações por usuário).
- Foto de perfil + tema claro/escuro (sem mexer no layout aprovado).

## FASE 3 — Almoxarifado Goiânia + Fluxo de Carga
Itens 4, 5, 6

- Almoxarifado Goiânia separado (Ilma, Aldenei) — mesma UI, escopo filial.
- Fluxo de Solicitação de Carga com status (Rascunho → Solicitado → Pendente → Aprovado/Recusado → Liberado → Finalizado).
- Externo só cria/acompanha; admin aprova/libera/finaliza.

## FASE 4 — Documentos, PDFs e Histórico
Itens 8, 9, 10, 11, 12, 13, 15, 29

- Pente fino em todos os PDFs: nunca abrir branco; mensagem padrão "Nenhum registro encontrado".
- Funcionários clicáveis em todas as listas → abre cadastro.
- Histórico Documental do funcionário: cada card com Ver/Baixar/Editar/Excluir.
- Histórico geral puxando EPI, Uniformes, VR/VT, Férias, ASO, Atestados, Abastecimentos, Cargas.
- Corrigir fotos do App Mecânico (URL/storage consistente, preview, fallback claro).
- Corrigir Relatório de Abastecimento (hoje em branco).
- Corrigir Fechamentos por Filial (ALQUI x outras): regra única — ou prévia para todas, ou valor só após fechado.

## FASE 5 — App Mecânico Histórico + Lançamento
Itens 14, 16, 17, 20 (parcial)

- Tela completa do mecânico: ponto/abastecimento/KM/chamados/fotos/GPS clicáveis.
- Botão "Gerar lançamento" no ponto → alimenta Lançamentos Mensais e Fechamento.
- Tipos: atraso, falta, HE 50%/100%, saída antecipada, ajuste manual, ocorrência.
- Ações Ver/Editar/Excluir/Cancelar com confirmação e log em QRCode/Abastecimento.

## FASE 6 — Importações Reais (Faturamento, Financeiro, Almoxarifado)
Itens 21, 22, 23, 24, 25, 26, 27, 28, 30

- Importação aceita PDF (texto nativo), Excel `.xlsx/.xls`, CSV.
- Botões: Abrir, Conferir, Reprocessar, Ver erro (real, não "Erro técnico"), Excluir, Baixar original, Confirmar, Corrigir pendências.
- Conferência inteligente: novos / atualizados / duplicados / pendências / erros — editar antes de salvar.
- Deduplicação por regras (CPF/CNPJ; patrimônio; OS+pedido+patrimônio+período+NF).
- Importação no Financeiro (a pagar/receber, fornecedores, vencimentos).
- Importação no Almoxarifado (itens, estoque, movimentações).
- Log/Monitoramento geral (login, criação, edição, exclusão, importação, erro, impressão).

---

## Detalhes técnicos (referência)

- Permissões: helper `useAcessoExternoFiltro` + guard de rota em `App.tsx` por path-prefix; tabela `acessos_externos` com `UNIQUE(funcionario_id)` e `UNIQUE(cpf_clean)` parcial; RLS reforçada.
- PDFs: padronizar via `src/lib/pdfGenerator.ts` com fallback "sem dados".
- Importações: ampliar `parse-dn4` (renomear internamente para `parse-import`) com handlers `.xlsx` (`xlsx`/`exceljs`) e `.csv` (`papaparse`); tabelas de staging por domínio; RPC `confirmar_importacao(id)`.
- Logs: tabela `audit_log(user_id, modulo, acao, entidade, entidade_id, payload, created_at)` + trigger genérico onde aplicável.
- Storage: validar bucket `app-mecanico-fotos` público + signed URLs onde privado; corrigir caminhos órfãos.

---

## Pergunta antes de começar

Confirma que sigo nessa ordem? Se quiser, posso **inverter Fase 1 ↔ Fase 6** (priorizar importação) ou **começar só pelo bloqueio EPI/Uniformes + UNIQUE constraint** (mais urgentes pelo histórico recente). Diga "ok fase 1" ou indique outra ordem.
