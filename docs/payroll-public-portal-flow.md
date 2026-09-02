# Fluxo final

1. RH seleciona TOPAC MATRIZ, ALQUI ou LMT no módulo Pagamento.
2. RH sobe holerite(s) PDF e comprovante(s) PDF/ZIP.
3. Plataforma tenta vincular os documentos aos funcionários e mantém casos duvidosos para conferência manual.
4. RH confirma o holerite.
5. RH confirma o pagamento.
6. O holerite passa a ficar elegível no portal único `/holerite`.
7. O funcionário recebe o mesmo endereço público usado por todos.
8. O funcionário informa CPF, data de nascimento e últimos 4 dígitos do telefone cadastrado.
9. Backend valida identidade, CNPJ habilitado, holerite conferido e pagamento confirmado.
10. O funcionário visualiza apenas o próprio holerite.
11. O funcionário registra `LI E CONFERI`.
12. O funcionário confirma a assinatura eletrônica.
13. O backend revalida SHA-256, grava evidências e gera certificado.
14. O painel administrativo passa a exibir assinatura e permite gerar dossiê e consolidado.

Não existe envio automático de WhatsApp, OTP, SMS ou cobrança no fluxo final.
