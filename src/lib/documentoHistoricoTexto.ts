/**
 * Prepara texto livre apenas no envio, sem alterar espaços ou quebras de linha
 * enquanto a pessoa está digitando.
 */
export const prepareDocumentTextForSave = (value: string): string => value.trim();
