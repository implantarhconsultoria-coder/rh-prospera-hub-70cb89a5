# Portal único de holerite — critérios de aceite

Escopo exclusivo da Plataforma TOPAC Web.

- URL pública única: `/holerite`.
- A página pública não monta `App`, `BrowserRouter`, painel administrativo ou App dos Mecânicos.
- Identidade obrigatória: CPF + data de nascimento + últimos 4 dígitos de celular/telefone cadastrado.
- CPF isolado nunca libera documento.
- Empresas habilitadas: TOPAC MATRIZ, ALQUI e LMT, validadas também no backend por código e CNPJ.
- Holerite só aparece quando o documento estiver conferido e existir comprovante de pagamento confirmado.
- Storage de documentos permanece privado.
- URL do PDF é assinada e temporária.
- Sessão pública dura 30 minutos e o token de sessão só é persistido como SHA-256.
- Rate limit: máximo de 8 tentativas por IP e 5 por identificador em janela de 15 minutos.
- Antes da assinatura: registro de abertura e confirmação `LI E CONFERI`.
- Assinatura revalida SHA-256 do PDF antes de gravar.
- Evidências: identidade, data/hora, IP, user-agent, navegador/dispositivo, versão e SHA-256.
- Certificado PDF e dossiê administrativo preservados.
- Nenhuma dependência de WhatsApp, Evolution, Meta, SMS ou OTP no fluxo ativo.
- Endpoints legados de envio/cobrança retornam `legacy_message_flow_disabled`.
- Nenhum arquivo do App dos Mecânicos é alterado nesta branch.
