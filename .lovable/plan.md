

# Correção crítica — Fluxo Ponto + Atestado → Fechamento automático

## Objetivo
Transformar a aba atual ("Importação para o Fechamento") de **"sobe arquivos"** para **"sobe → lê → cruza → confere → alimenta o fechamento"**, com tela de conferência dedicada, status visuais e relatório de divergências.

## O que vai ser corrigido

### 1. Persistir o cartão de ponto (hoje só fica em memória)
Criar tabela `cartoes_ponto` para armazenar cada cartão lido (funcionário, competência, dias com batidas, totais calculados, status de conferência, link do arquivo). Hoje, se o usuário recarrega a página, perde tudo. Vai persistir igual ao atestado.

### 2. Status de conferência visual em cada linha
Cada cartão vinculado vai mostrar um dos 4 status:
- **Pendente** (cinza) — lido mas não conferido
- **Conferido** (verde) — usuário validou
- **Divergente** (laranja) — falta sem atestado, batida inconsistente, OCR baixa confiança
- **Justificado** (azul) — falta coberta por atestado

### 3. Tela "Conferência de Ponto e Atestados" (nova rota dedicada)
Rota: `/admin/conferencia-ponto`  
Filtros: Empresa + Competência  
Mostra por funcionário:
| Funcionário | Dias trab. | Faltas no ponto | Atestados vinculados | Divergências | Status | Ações |
|---|---|---|---|---|---|---|
| João Silva | 20 | 2 | 1 atestado (3 dias) | 1 falta sem justificativa | ⚠️ Divergente | Ver detalhes / Conferir / Enviar p/ fechamento |

Botões no topo: **"Enviar tudo conferido p/ fechamento"** e **"Gerar Relatório de Divergências (PDF)"**.

### 4. Cruzamento automático ampliado
Hoje o cruzamento só roda quando o usuário clica. Vai passar a rodar:
- Automaticamente após salvar atestado (recalcula cartões da mesma competência/funcionário)
- Automaticamente após upload/leitura de cartão
- Classificando cada dia ausente em: `falta_justificada`, `falta_sem_justificativa`, `atestado_sem_falta_correspondente`

### 5. Alimentação do Fechamento sem digitação dupla
Botão "Enviar p/ fechamento" no detalhe de cada funcionário (e em massa). Já existe a lógica em `aplicarNoFechamento` — vai ganhar:
- Preview "antes vs. depois" antes de gravar
- Preserva campos manuais (adicionais, descontos diversos, comissão)
- Marca `lancamentos_mensais.observacoes` com origem ("Importado do cartão XYZ em DD/MM")
- Bloqueia reenvio se a competência estiver fechada (status `fechado`)

### 6. Tela manual assistida quando OCR falha
Quando a IA não consegue ler (confiança < 0.5 ou erro), em vez de marcar erro e parar:
- Mantém o arquivo anexado
- Abre formulário lado a lado com o PDF embutido
- Usuário digita batidas dia a dia (ou só faltas) e salva como cartão manual

### 7. Relatório de Divergências (PDF)
Gera lista por empresa/competência com:
- Faltas sem atestado (nome, data, dias)
- Atestados sem falta correspondente no ponto
- Cartões com batidas inconsistentes
- Cartões ignorados (Jerri, Rodrigo Sabino, Rodrigo Medrado, mecânicos de rua)

### 8. Estabilidade pós-save (regra crítica)
Em todos os botões "Salvar / Confirmar / Aplicar":
- Loading visível e botão desabilitado durante a operação
- Toast de sucesso ao terminar
- `await fetchData()` para atualizar lista sem reload manual
- ErrorBoundary já está protegendo contra tela branca (já implementado)

## Arquivos que serão alterados/criados

**Migration (banco):**
- Nova tabela `cartoes_ponto` (funcionario_id, company_id, competencia, arquivo_url, dias_json, totais, status_conferencia, divergencias_json, criado_por, RLS)
- Coluna `status_conferencia` em `atestados` (pendente/conferido/justificado)

**Código novo:**
- `src/pages/ConferenciaPontoPage.tsx` — tela de conferência consolidada
- `src/lib/divergenciasReport.ts` — geração do PDF de divergências
- `src/components/CartaoManualForm.tsx` — fallback manual quando OCR falha

**Código alterado:**
- `src/pages/ImportacaoFechamentoPage.tsx` — persistir cartões, classificação ampliada, status visuais, fallback manual
- `src/lib/pontoFechamento.ts` — adicionar classificação `atestado_sem_falta` e cálculo de status por funcionário
- `src/App.tsx` + `src/components/AppSidebar.tsx` — rota e link "Conferência de Ponto"
- `src/pages/FechamentoPage.tsx` — badge "Importado" nos lançamentos vindos do cartão

## O que NÃO será alterado
- Layout geral, menus, permissões existentes, regras de cálculo do Fechamento (HE, INSS, FGTS, IRRF, VR, VT)
- Exceções já implementadas (Jerri, Rodrigos, mecânicos, Marcelo HE 50%)
- Tolerância de 15 min (mantida)

## Risco de dados já salvos
**Nenhum.** A migration só **cria** uma tabela nova e **adiciona** coluna nova com default. Os atestados já salvos continuam intactos.

## Resultado esperado
1. Sobe atestados → ficam arquivados e marcados como "pendente"
2. Sobe cartões → ficam persistidos com status automático (Conferido / Divergente / Justificado)
3. Abre "Conferência de Ponto" → vê tudo consolidado por funcionário com divergências destacadas
4. Confere e clica "Enviar p/ Fechamento" → `lancamentos_mensais` é atualizado preservando dados manuais
5. Imprime "Relatório de Divergências" para revisão final

