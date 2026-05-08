# Importação DN4 → Faturamento (com conferência)

Escopo: somente banco + módulo Faturamento. Não toca em RH, VR, VT, EPI, Uniformes, App Mecânico, Login.

## Visão geral do fluxo

```
PDF DN4  →  Upload (Faturamento/Importações DN4)
         →  Edge Function: parse-dn4 (extrai texto + classifica)
         →  Grava em tabelas STAGING (status=pendente_conferencia)
         →  Tela de Conferência (abas + edição + confirmar/ignorar)
         →  Promove para tabelas OFICIAIS do Faturamento
         →  Log de importação consolidado
```

Nada vai direto pra base oficial. Sempre passa por staging.

## 1. Banco de dados (migrations)

### Staging (todas com colunas comuns)
Colunas comuns em cada staging:
`id, importacao_id, arquivo_origem, pagina_origem, linha_original_extraida (jsonb), status (importado|pendente_conferencia|erro_leitura|confirmado|ignorado), mensagem_erro, data_importacao, usuario_importacao, created_at, updated_at`.

- `staging_clientes_dn4` — codigo_dn4, nome_razao_social, cpf_cnpj, inscricao_estadual, endereco, bairro, cidade, uf, cep, empresa_origem, filial_origem, status_cliente
- `staging_representantes_dn4` — codigo_dn4, nome, cpf_cnpj, endereco, cidade, uf, email, telefone, tipo_pessoa, empresa_origem, filial_origem
- `staging_equipamentos_dn4` — codigo_equipamento, numero_patrimonio, descricao, tipo_equipamento, grupo, filial_opera, situacao, numero_serie, valor_venda, valor_compra, valor_mercado, valor_indenizacao
- `staging_historico_locacao_dn4` — numero_os, pedido, cliente_nome, cliente_cpf_cnpj, quantidade, item, patrimonio, descricao_equipamento, periodo_texto, data_inicio, data_fim, valor_pedido_periodo, valor_diaria_periodo, valor_faturado_periodo, numero_nf, filial, cliente_id_resolvido, equipamento_id_resolvido

### Oficiais (criadas se não existirem; senão mescladas)
- `clientes_faturamento` — codigo_dn4, nome_razao_social, cpf_cnpj (único quando informado), inscricao_estadual, endereco, bairro, cidade, uf, cep, empresa_origem, filial_origem, status, created_at, updated_at
- `representantes_faturamento` — codigo_dn4, nome, cpf_cnpj, endereco, cidade, uf, email, telefone, tipo_pessoa, empresa_origem, filial_origem (única por codigo_dn4+nome)
- `equipamentos_faturamento` — codigo_equipamento, numero_patrimonio (único), descricao, tipo_equipamento, grupo, filial_opera, situacao, numero_serie, valor_venda, valor_compra, valor_mercado, valor_indenizacao
- `equipamentos_faturamento_historico` — equipamento_id, alterado_por, alterado_em, dados_antes (jsonb), dados_depois (jsonb)
- `historico_locacao_faturamento` — numero_os, pedido, cliente_id, equipamento_id, patrimonio, quantidade, item, descricao_equipamento, periodo_texto, data_inicio, data_fim, valor_pedido_periodo, valor_diaria_periodo, valor_faturado_periodo, numero_nf, filial. Único por (numero_os, pedido, patrimonio, data_inicio, data_fim).

### Log
- `importacoes_dn4` — id, arquivo, usuario_id, iniciado_em, finalizado_em, total_lidos, total_confirmados, total_pendentes, total_erros, status

### Segurança / RLS
- RLS ativo em todas. Acesso restrito a roles `admin` e `faturamento` via `has_role()`.
- Trigger `updated_at` padrão.
- Trigger no UPDATE de `equipamentos_faturamento` grava em `equipamentos_faturamento_historico`.
- Nenhum DELETE automático em base oficial.

### Storage
- Bucket privado `dn4-imports` para guardar os PDFs originais. Policies para admin/faturamento.

## 2. Edge function `parse-dn4`

- Recebe `{ importacao_id, storage_path }`.
- Baixa o PDF, extrai texto (pdfjs no edge ou via OCR já existente se necessário).
- Heurística por tipo de relatório DN4 (clientes / representantes / equipamentos / histórico de locação) detectando cabeçalhos.
- Para cada linha: monta registro, aplica validações básicas, define status:
  - `pendente_conferencia` por padrão
  - `erro_leitura` se faltar campo obrigatório
- Resolve vínculos quando possível (cliente por CPF/CNPJ, equipamento por patrimônio).
- Insere em staging em batches.
- Atualiza contadores em `importacoes_dn4`.

## 3. Promoção staging → oficial (RPC `dn4_confirmar_registros`)

Recebe lista de IDs por tipo. Para cada:

- Cliente: UPSERT por cpf_cnpj; se vazio, match por nome+cidade; conflito → mantém `pendente_conferencia`. Preserva `codigo_dn4`.
- Representante: UPSERT por (codigo_dn4, nome).
- Equipamento: UPSERT por numero_patrimonio. Trigger grava histórico de alteração.
- Histórico de locação: INSERT se não existir chave única; tenta resolver cliente_id e equipamento_id; se faltar vínculo → `pendente_conferencia` (não promove).

Marca staging como `confirmado` (ou `ignorado`).

## 4. UI — módulo Faturamento

Nova rota: `/faturamento/importacoes-dn4`
Adicionar item “Importações DN4” no `FaturamentoLayout` (mobile + desktop).

### Tela `ImportacoesDN4Page`
- Header com botão **Nova Importação** (upload de 1+ PDFs).
- Lista das importações (data, arquivo, totais, status).
- Clicar abre detalhes com abas:
  - **Clientes** | **Representantes** | **Equipamentos** | **Histórico de Locação** | **Pendências** | **Erros**
- Em cada aba (tabela editável):
  - Visualizar campos extraídos
  - Editar inline antes de confirmar
  - Ações: Confirmar, Ignorar, Confirmar todos válidos, Exportar erros (CSV)
- Mantém visual próximo do padrão DN4 (colunas: código, razão social, CPF/CNPJ, cidade/UF / código, patrimônio, descrição, situação, filial, valores / OS, pedido, cliente, patrimônio, período, valor diário, valor faturado, NF).

### Tela `ClientesFaturamento`, `EquipamentosFaturamento` (consulta pós-import)
Páginas de consulta simples reutilizando `clientes_faturamento` e `equipamentos_faturamento` para a equipe ver o resultado consolidado, com busca por código/patrimônio/CPF/descrição. (Histórico de locação consultável por OS e patrimônio.)

## 5. Reuso pós-importação

Os módulos existentes de Contratos, Medições, Faturas e Pendências passam a poder usar `clientes_faturamento`, `equipamentos_faturamento` e `historico_locacao_faturamento` como fonte. Sem alterar fluxos atuais — apenas expor seletores/consultas.

## 6. Segurança e logs
- Toda importação cria 1 linha em `importacoes_dn4` com contadores atualizados ao fim.
- Nenhum dado existente apagado automaticamente.
- Conflitos viram `pendente_conferencia` com `mensagem_erro` explicando.
- RLS por role; PDFs em bucket privado.

## Ordem de execução
1. Migration: tabelas staging + oficiais + log + RLS + triggers + bucket.
2. Edge function `parse-dn4` + deploy.
3. RPC `dn4_confirmar_registros`.
4. UI Faturamento: rota, item de menu, tela de importações com abas.
5. Telas de consulta (clientes/equipamentos/histórico) — leves, padrão DN4.
6. QA: subir 1 PDF de cada tipo, conferir, confirmar, validar gravação oficial.

## Pontos a confirmar com você
- Posso te pedir 1 PDF de cada tipo (clientes, representantes, equipamentos, histórico) para calibrar o parser? Os PDFs DN4 que você já enviou ainda estão acessíveis nesta conversa ou precisa reenviar?
- Os relatórios DN4 vêm em layout fixo (colunas) ou variam por filial? Isso muda a estratégia do parser (regex de colunas vs. OCR).
