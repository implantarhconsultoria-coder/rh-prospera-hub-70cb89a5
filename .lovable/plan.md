

# Plano de Evolução — Topac RH Multiempresa PRO

## Visão Geral

Atualização incremental do projeto existente em 9 fases, sem refazer do zero, mantendo menu, identidade visual e fluxos atuais. Usa Lovable Cloud para autenticação real, banco de dados e armazenamento de arquivos.

---

## Fase 1 — Login Real com Autenticação Lovable Cloud

**O que muda:** Substituir login fake (admin/admin) por autenticação real com email/senha.

- Criar tabela `profiles` no banco (nome completo, email, telefone, cargo)
- Telas: Login, Cadastro, Recuperar Senha, Redefinir Senha
- Campos do cadastro: nome completo, email, telefone, senha, confirmação
- Proteger todas as rotas internas (só usuários logados acessam)
- Manter o mesmo visual do login atual (gradient, logo, estilo premium)
- Remover login hardcoded do AppContext, usar sessão real
- Adicionar Google OAuth como opção de login

---

## Fase 2 — Remover Campo "Responsável" de Todos os Documentos

- Remover campo digitável e validação de `responsavel` de: EPIPage, UniformePage
- Remover da interface e do `addDelivery`
- Manter apenas a linha de assinatura no documento impresso/PDF
- Aplicar a mesma regra em todos os novos documentos

---

## Fase 3 — Padronizar Visual de Todos os Documentos

Usar o layout da ficha de Uniformes como referência para todos os documentos (tela e impressão):
- Cabeçalho com empresa e CNPJ
- Título do documento
- Bloco de identificação do colaborador
- Tabela central com itens
- Termo/observação quando necessário
- Linhas de assinatura no final
- Rodapé padrão

Aplicar em: EPI, Uniformes, Recibos VR, Recibos VT, e todos os novos documentos.

---

## Fase 4 — Corrigir VR e VT

- Revisar dados de VR/VT dos funcionários de TOPAC MATRIZ, TOPAC PRAIA GRANDE, TOPAC GOIÂNIA e LMT (atualmente muitos estão com `vrAtivo: false, vtAtivo: false`)
- Corrigir vínculo por funcionário conforme dados reais
- Garantir que recibos VR e VT emitam corretamente com o padrão visual unificado
- Impressão/PDF funcionando

---

## Fase 5 — Novo Documento: Retirada de Combustível

- Nova página `/combustivel` no menu lateral (seção Operacional)
- Empresa padrão: TOPAC MATRIZ
- Selecionar funcionário → preenche automaticamente: nome, empresa, CNPJ, cargo, CPF, data
- Campos específicos: tipo de combustível (gasolina/diesel), quantidade (15L/20L), observações
- Mesmo padrão visual da ficha de Uniformes
- Impressão A4 com linhas de assinatura, sem campo de responsável

---

## Fase 6 — Novo Documento: Protocolo / Liberação de Documento

- Nova página `/protocolo` no menu lateral
- Empresa padrão: TOPAC MATRIZ
- Campos: empresa destinatária, local/canteiro, pessoa responsável pelo recebimento
- Identificação do ativo: placa, renavam, chassi, ano fabricação, ano modelo, patrimônio, exercício
- Observações e assinatura final
- Mesmo padrão visual, impressão A4

---

## Fase 7 — Novo Documento: Liberação de Locação de Compressores

- Nova página `/compressores` no menu lateral
- Empresa padrão: TOPAC MATRIZ
- Campos: dados do compressor, veículo, empresa contratante, pessoa que recebe, patrimônio, placa, renavam, chassi, ano, exercício, observações
- Gerar 2 vias na mesma impressão
- Mesmo padrão visual, impressão A4

---

## Fase 8 — Área Interna para PDFs de Veículos e Compressores

**Banco de dados:**
- Tabela `ativos` (tipo: veículo/compressor, descrição, placa, patrimônio, empresa, observação, status)
- Storage bucket `documentos-ativos` para upload de PDFs

**Interface:**
- Nova página `/documentos-ativos` no menu lateral
- Cadastro de ativos com upload de PDF
- Consulta por placa ou patrimônio
- Visualização e download do PDF vinculado
- Possibilidade de imprimir documento principal + PDF anexo

---

## Fase 9 — Revisão do Fechamento Mensal

**Problema:** Valores variáveis aparecem preenchidos sem lançamento real.

**Correção na função `generateDefaultEntries`:**
- `vrAplicado`, `vaAplicado`, `vtAplicado` → usar valor real do cadastro do funcionário (só `true` se o benefício estiver ativo)
- `insalubridadeAplicada` → só `true` se `emp.insalubridadeAtiva`
- Todos os campos variáveis iniciam zerados: faltas, atrasos, HE50, HE100, comissão, descontos, adiantamento
- `vtDesconto` inicia 0 (só calcula se vtAtivo e houver regra)
- Adiantamento fixo de 40% do salário só aparece no fechamento quando calculado, não como dado pré-preenchido na entry

**O que é fixo (vem da base):** salário, nome, cargo, empresa, matrícula, benefícios cadastrados
**O que é variável (não nasce preenchido):** faltas, atrasos, HE, comissão, descontos, adiantamento

**Manter:** layout atual, colunas, totais recalculados corretamente

---

## Resumo de Tabelas no Banco (Migrações)

| Tabela | Finalidade |
|--------|-----------|
| `profiles` | Dados do usuário logado (nome, email, telefone) |
| `ativos` | Cadastro de veículos e compressores |
| Storage: `documentos-ativos` | PDFs dos ativos |

---

## Itens do Menu Lateral (Adições)

Seção Operacional — adicionar:
- Retirada de Combustível (`/combustivel`)
- Protocolo de Documento (`/protocolo`)
- Locação de Compressores (`/compressores`)
- Documentos de Ativos (`/documentos-ativos`)

---

## O que NÃO será alterado

- Layout geral e identidade visual
- Menu existente (apenas adições)
- Módulos que já funcionam corretamente
- Rotas existentes
- Dados estáticos de funcionários e empresas (mantidos no código por enquanto)

---

## Ordem de Implementação

1. Login real + proteção de rotas
2. Remover campo responsável
3. Padronizar visual dos documentos
4. Corrigir VR/VT
5. Retirada de Combustível
6. Protocolo de Documento
7. Locação de Compressores
8. Área de PDFs de ativos
9. Revisão do fechamento

Cada fase será implementada e testada antes de passar para a próxima.

