# TOPAC RH PRO — Conferência objetiva do parecer do Dr. Marcelo

**Origem:** manifestação do Dr. Marcelo Ribeiro Penteado Silva, 15/09/2026, páginas 1–4 do documento digitalizado enviado pelo administrador.  
**Escopo:** responder apenas aos questionamentos desse parecer.  
**Estado:** proposta de implementação na branch de revisão. Este documento não afirma certificação jurídica, homologação nem publicação em produção.

## 1. Matriz de perguntas e evidências exigidas

| Item do parecer | Pergunta | O que comprovar no sistema | Situação / trabalho |
|---|---|---|---|
| Assinatura a | Nome, registro, segurança, autoria e integridade | Nome do produto; identificação do operador; documento e versão; autoria autenticada; hash do arquivo; registro do aceite e método efetivamente utilizado | Implementada nesta branch: validação *no servidor* da verificação facial quando o perfil facial já está ativo; evento deve coincidir com funcionário, empresa, documento e sessão e ter ocorrido depois da leitura e nos últimos 5 min. Certificado passa a declarar se o método foi manual ou manual + facial. PENDENTE: comprovação de origem confiável do cadastro facial e prova de vida antiapresentação; análise jurídica da questão do registro do sistema. |
| Assinatura b | Onde estão os arquivos e como recuperar após deixar o sistema? | Recuperação por empresa/funcionário, cópia fora do sistema, manifesto de integridade | Implementada nesta branch: botão de dossiê chama exportação completa do servidor, não apenas o holerite selecionado; PDF, índice e manifesto JSON com hashes. PENDENTE: destino externo independente e teste de restauração sem acesso ao Supabase. |
| Assinatura c | Guarda e capacidade dos comprovantes de pagamentos | Comprovante por documento, status de confirmação, armazenamento, capacidade, política de retenção | Implementada nesta branch: inclui anexos bancários encontrados, distinguindo confirmados e não confirmados no manifesto. PENDENTE: previsão de capacidade, retenção e teste de recuperação externa. |
| Assinatura d | VR e VT enviados foram gerados dentro do sistema? | Demonstração da origem e do documento gerado | Já existem módulos de benefícios/recibos. PENDENTE: ensaio em ambiente isolado e exemplos separados por VR e VT; não afirmar que todo modelo legado veio desse fluxo. |
| Assinatura e | Sistema conversa com fechamento mensal, emite recibos e envia para assinatura? | Fluxo documentado folha -> recibo -> disponibilização -> leitura -> aceite -> histórico | Já existem upload/geração, vínculo de funcionário, portal, assinatura e arquivo. PENDENTE: teste integrado de ponta a ponta e conferência dos documentos opcionais, sem presumir que anexo bancário equivale automaticamente a pagamento confirmado. |
| Assinatura f | Sistema faz só assinatura? | Inventário objetivo de funcionalidades | RH, folha, benefícios, arquivo e demais módulos devem ser descritos como funcionalidades distintas; contabilidade e pagamentos são operações que podem ocorrer fora da plataforma. |
| Assinatura g | Três empresas e denominação correta | Empresa/CNPJ correto por empregado, documento, certificado, dossiê e permissão | Os escopos atuais suportam cinco CNPJs. PENDENTE: testar todos os CNPJs e proibir exportação cruzada entre empresa e empregado. |
| Assinatura h | O telefone é do empregado? Assina o próprio empregado ou terceiro? | Procedimento de autenticação; vínculo com telefone; prova do ato individual | PENDENTE: OTP para número de contato *previamente confirmado por meio independente* ou cadastramento presencial supervisionado pelo RH. Quatro últimos dígitos do telefone não atestam posse. Cadastro facial inicial sob login manual não equivale, sozinho, a prova robusta de identidade; evento biométrico ainda confia em descritor informado pelo cliente. |
| Assinatura i | Uso de celular pessoal e custeio | Política aprovada pelo jurídico e meios alternativos | PENDENTE decisão administrativa/jurídica: acesso pelo equipamento da empresa ou forma alternativa, termos e eventual custeio. Não introduzir aceites trabalhistas retroativos ou automáticos. |
| Jornada a–f | Manual/eletrônico, marcação diária, contabilidade, arquivos, correções e autoria do ponto | Declaração da modalidade oficial, registros originais, histórico de ajuste, relatórios para contabilidade, autoria do registro | **PROJETO SEPARADO.** Não transformar automaticamente o aplicativo em REP-P. Resolver após definição formal do modelo adotado. |
| Recomendações finais | Comprovantes e pastas por empregado fora do sistema | Dossiê por empregado/empresa, manifesto e cópia independente | Dossiê completo preparado nesta branch; retenção externa e restauração continuam pendentes. |

## 2. Fundamentos e seus limites

- MP nº 2.200-2/2001, art. 10, §§ 1º e 2º: a ICP-Brasil possui presunção específica; outros meios de autoria e integridade são admitidos nos termos do § 2º. Não declarar o certificado de evidências da TOPAC como ICP-Brasil. Fonte: https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm
- CLT, art. 464 e parágrafo único: distinguir recibo do empregado e comprovante de depósito com força de recibo nas condições legais. Fonte: https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm
- LGPD, arts. 5º, II, e 11: dado biométrico de pessoa natural é sensível; selecionar base legal adequada e política de guarda/acesso com o advogado. Fonte: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Lei nº 14.063/2020, art. 4º: classificação e características de assinaturas são referência técnica; capítulo II não regula indistintamente operações privadas entre particulares (art. 2º, parágrafo único). Fonte: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm

## 3. Provas técnicas que devem acompanhar a entrega ao jurídico

1. Teste de pessoa autenticada tentando assinar documento de outro empregado, de outro CNPJ, de outra sessão e após expiração da verificação facial (todas as tentativas devem falhar).
2. Assinatura legítima com documento e certificado de evidências, hashes, horários UTC/Brasília e método **efetivamente** utilizado.
3. Recuperação de dossiê completo por empregado: PDF, índice sem truncar após 32 documentos e manifesto JSON com hash do PDF e dos anexos. Divergência de hash deve aparecer como divergência, não como arquivo íntegro.
4. Exibição separada de comprovante anexado e pagamento confirmado; anexar não prova, sozinho, a realização de pagamento.
5. Testes por cada empresa, inclusive desligado/sócio/pro-labore conforme a regra vigente, e ensaio de restauração independente.

## 4. Restrições inegociáveis de publicação

- Não mudar a configuração `payroll_module_company_config.enabled` nem reativar o portal dos empregados sem autorização explícita do administrador.
- Não rodar migrations, scripts de correção, testes com escrita nem operações de exclusão em Supabase Production.
- Não fazer merge na main nem deploy em Vercel Production sem aprovação expressa sobre este pacote.
- Preservar as assinaturas já existentes, acesso de administrador/diretor ao arquivo e geração de benefícios com portal de assinatura pausado.
- A publicação técnica não substitui o parecer final do Dr. Marcelo sobre o procedimento operacional, uso de celular pessoal, base legal biométrica e guarda independente.
