# TOPAC — Sincronização, Frota, Protocolo e Anti-duplicidade

Estado inicial: EM EXECUÇÃO.

Escopo autorizado em 04/08/2026:

- anti-duplicidade documental no Supabase, com preservação de evidência em auditoria;
- leitura de PDF da Frota com RENAVAM e chassi obrigatórios;
- Protocolo sem upload próprio, sincronizado pela placa com a Frota;
- Leitura Inteligente de Texto no cadastro de Funcionários, reutilizando lógica compartilhada;
- testes de integração, build e Preview Vercel.

Governança:

- branch isolada a partir do merge `0d2d9a2dcb9f57a03ec16f3fee9c45e09ee5fd00`;
- Draft PR obrigatória;
- sem merge sem autorização expressa;
- alterações destrutivas no banco somente com auditoria e critério determinístico.
