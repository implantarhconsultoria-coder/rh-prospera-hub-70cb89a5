# TOPAC RH PRO — Protocolo de alterações e publicação

Vigência solicitada por Rodrigo: 24/09/2026, 17h30 (America/Sao_Paulo).

## Regra central
Qualquer mudança de código, configuração, banco de dados, RLS, funções SQL, Edge Functions, integrações, credenciais, jobs, templates, frontend, APIs, permissões, rotas ou módulos do App dos Mecânicos deve ser preparada fora da produção. Nenhum agente, automação, desenvolvedor ou ferramenta deve publicar ou aplicar mudança no ambiente real sem autorização expressa posterior de Rodrigo para a mudança específica. A palavra "atualizar" refere-se somente ao pacote/módulo explicitamente discutido; não libera automaticamente outras mudanças pendentes.

## Operação existente
Produção, acesso administrativo do proprietário, trabalhadores, históricos, documentos, ponto e abastecimentos existentes permanecem funcionando. A regra restringe novas configurações e implantações, não o uso normal do sistema pelos usuários autorizados. Não desligar serviços, restringir o administrador, alterar vínculos de CNPJ nem descartar dados por causa desse congelamento.

## Fluxo obrigatório
1. Diagnosticar impacto, dependências, rollback, segurança e compatibilidade com o que já funciona.
2. Criar mudança em branch de trabalho separada de main.
3. Testar em Preview + projeto de Supabase separado da produção, com dados de teste e armazenamento isolado; nunca executar operações de escrita de teste no banco real.
4. Testar regressões nos módulos afetados, inclusive desktop/mobile e perfis administrativos e de funcionário.
5. Registrar relatório de testes, arquivos/consultas afetados, migrações propostas e plano de reversão.
6. Aguardar aprovação explícita de Rodrigo para o pacote identificado.
7. Só após aprovação: backup/snapshot apropriado, execução controlada de migrações, implantação e smoke tests não destrutivos em produção.
8. Em falha: rollback da aplicação e plano específico de reversão de banco; nunca pressupor que rollback da Vercel restaura o Supabase.

## Portões técnicos ainda a ativar em interfaces administrativas
- Proteger GitHub main contra push direto e exigir PR e verificações; conferir GitHub Actions que fazem git push main ou aplicam mudanças.
- Impedir deploy automático para Production na Vercel; verificar Deploy Hooks, CLI, integrações e automações de publicação.
- Separar variáveis de ambiente e chaves de Preview das de Production.
- Remover credenciais de produção de ações de teste e condicionar migrações ao processo de release.
- Verificar outros repositórios/projetos que publicam o mesmo sistema.

Este arquivo expressa a política; não substitui a ativação dos bloqueios efetivos no GitHub, Vercel e Supabase.
