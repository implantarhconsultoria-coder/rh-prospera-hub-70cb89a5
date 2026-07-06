# Frota - Licenciamento com RENAVAM

## Status
Pendente de implementação na plataforma.

## Módulo
Frota

## Rotina afetada
**Imprimir Lote** / impressão de Licenciamento.

## Objetivo
Ajustar a plataforma para que, no lugar do comportamento atual de **Imprimir Lote**, o sistema gere a impressão de **Licenciamento** no padrão definido.

## Campos mínimos no relatório
- Placa
- Veículo
- RENAVAM
- Final da placa
- Status do licenciamento
- Vencimento/competência
- Valor

## Regra de agrupamento para impressão
Cada grupo deve iniciar em folha separada:

1. Finais 1/2
2. Finais 3/4
3. Finais 5/6
4. Finais 7/8
5. Final 9
6. Final 0

## Regra de vencimento por final de placa

| Final da placa | Prazo limite |
|---|---|
| 1 e 2 | 31 de julho |
| 3 e 4 | 31 de agosto |
| 5 e 6 | 30 de setembro |
| 7 e 8 | 31 de outubro |
| 9 | 30 de novembro |
| 0 | 31 de dezembro |

## Regra funcional
A plataforma deve identificar automaticamente o último dígito da placa e aplicar:

- grupo de impressão correspondente;
- prazo de vencimento correspondente;
- quebra de página por grupo.

## Comportamento esperado
Ao clicar em **Imprimir Lote** ou opção equivalente dentro de **Frota/Licenciamento**, o sistema deve gerar a impressão de Licenciamento com:

- somente dados de Licenciamento;
- RENAVAM visível para cada veículo;
- agrupamento por finais de placa;
- vencimento calculado conforme final da placa;
- cada grupo iniciando em folha separada.

## Critério de aceite
A demanda será considerada concluída quando o usuário conseguir, pela própria plataforma, imprimir o relatório de Licenciamento da Frota com RENAVAM, vencimento correto e separação por folha/grupo.

## Issue relacionada
GitHub Issue #41
