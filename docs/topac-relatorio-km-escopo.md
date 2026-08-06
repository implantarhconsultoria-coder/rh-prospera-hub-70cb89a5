# TOPAC — Reestruturação do Relatório de Quilometragem

Escopo executivo implementado:

- cálculo sequencial por veículo/placa;
- KM inicial derivado da leitura anterior válida do mesmo veículo, inclusive fora do período selecionado;
- KM final preservado integralmente;
- total rodado calculado sem valores negativos;
- registros cancelados, testes e exclusões fora da sequência válida;
- separação por empresa, colaborador/mecânico e placa;
- quebra de página corporativa por grupo;
- cabeçalho do grupo repetido quando a sequência continua em outra página;
- colunas completas: Data, Placa, KM Inicial, KM Final, Total rodado e Motivo/Rota;
- Motivo/Rota com quebra automática de linha, sem corte por limite de caracteres;
- visualização em tela, PDF A4 paisagem, CSV e preparação de e-mail;
- indicadores para primeira leitura sem base e para KM inconsistente.

Validação concluída:

- TOPAC CI #58 aprovado;
- lint do escopo aprovado;
- testes do escopo aprovados;
- build completo aprovado;
- Validate production build #156 aprovado;
- dois Previews Vercel em estado READY;
- migration `topac_relatorio_quilometragem_corporativo` aplicada no Supabase;
- função disponível somente a usuários autenticados autorizados;
- cinco leituras reais e quatro placas processadas na base atual;
- zero total de KM negativo retornado.

Governança:

- desenvolvimento isolado na PR #69;
- PR permanece em Draft e sem merge;
- nenhuma alteração foi integrada à `main`.
