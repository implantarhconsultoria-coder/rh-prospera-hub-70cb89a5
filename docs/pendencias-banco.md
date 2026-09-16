# Operações dependentes de banco

Não implementar por suposição de schema. Aplicar após acesso ao projeto Supabase:

- tabela/registro do PDF diário assinado com vínculo simultâneo ao histórico do almoxarifado e funcionário;
- autorização excepcional de operação fora do horário e auditoria do autorizador/operador;
- fechamento mensal persistido;
- arquivamento transacional do documento anterior da frota quando novo documento for publicado;
- persistência/normalização de chassi e RENAVAM extraídos do PDF quando necessário.
