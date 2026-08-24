# Correção — matching automático de comprovantes pelo nome do recebedor

Escopo exclusivo: FECHAMENTO → PAGAMENTO → SUBIR COMPROVANTES.

Objetivo: comprovantes bancários com CPF mascarado devem ser identificados prioritariamente pelo campo `nome do recebedor:` / `nome do recebedor.`. O nome extraído deve ser normalizado e comparado com os funcionários da empresa/competência; nomes longos truncados pelo banco podem ser aceitos quando houver uma única correspondência segura. Diferenças pequenas entre valor do comprovante e líquido do holerite não podem invalidar um match de nome seguro.

Resultado esperado: upload em lote → leitura página por página/OCR → match automático → vínculo ao holerite → pagamento confirmado. A lista manual fica somente para casos realmente ambíguos ou sem correspondência segura.

Não alterar holerites, cálculos, funcionários, empresas, permissões ou outros módulos.
