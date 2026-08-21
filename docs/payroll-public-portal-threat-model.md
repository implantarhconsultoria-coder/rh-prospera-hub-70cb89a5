# Blindagem do Portal de Holerite

## Dados públicos
A URL `/holerite` é fixa e não contém CPF, funcionário, empresa, competência, documento ou token individual.

## Autenticação
O backend exige a combinação exata de CPF, data de nascimento e últimos quatro dígitos do telefone/celular já cadastrado no RH. A resposta de falha é genérica para evitar enumeração de CPFs.

## Disponibilidade do documento
Mesmo com identidade válida, somente documentos atuais, conferidos pelo RH e com pagamento confirmado são elegíveis. O vínculo de empresa também é revalidado no backend.

## Sessão
O navegador recebe um token aleatório temporário. O banco guarda apenas SHA-256. A sessão expira em 30 minutos e pode ser revogada no logout.

## Rate limit
Tentativas de autenticação são registradas por hash do identificador e IP, com limite em janela de 15 minutos.

## PDF
O bucket é privado. O backend devolve URL assinada de curta duração. Antes da assinatura o arquivo é baixado novamente no servidor e seu SHA-256 é comparado ao hash registrado no upload.

## Assinatura
A assinatura só é aceita após abertura do documento e confirmação `LI E CONFERI`. O registro final inclui evidências técnicas, certificado e integridade do documento.

## Isolamento
A entrada `/holerite` é renderizada diretamente no bootstrap e não monta a aplicação administrativa nem as rotas do App dos Mecânicos.
