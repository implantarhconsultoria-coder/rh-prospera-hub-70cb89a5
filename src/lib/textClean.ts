type Replacement = string | ((substring: string, ...args: string[]) => string);

const replaceText = (value: string) => {
  let text = value;

  const pairs: Array<[string, string]> = [
    ['\u00c3\u00a1', '\u00e1'], ['\u00c3\u00a0', '\u00e0'], ['\u00c3\u00a2', '\u00e2'], ['\u00c3\u00a3', '\u00e3'], ['\u00c3\u00a4', '\u00e4'],
    ['\u00c3\u0081', '\u00c1'], ['\u00c3\u0080', '\u00c0'], ['\u00c3\u0082', '\u00c2'], ['\u00c3\u0083', '\u00c3'], ['\u00c3\u0084', '\u00c4'],
    ['\u00c3\u00a9', '\u00e9'], ['\u00c3\u00aa', '\u00ea'], ['\u00c3\u00ab', '\u00eb'], ['\u00c3\u0089', '\u00c9'], ['\u00c3\u008a', '\u00ca'], ['\u00c3\u008b', '\u00cb'],
    ['\u00c3\u00ad', '\u00ed'], ['\u00c3\u00ae', '\u00ee'], ['\u00c3\u00af', '\u00ef'], ['\u00c3\u008d', '\u00cd'], ['\u00c3\u008e', '\u00ce'], ['\u00c3\u008f', '\u00cf'],
    ['\u00c3\u00b3', '\u00f3'], ['\u00c3\u00b4', '\u00f4'], ['\u00c3\u00b5', '\u00f5'], ['\u00c3\u00b6', '\u00f6'],
    ['\u00c3\u0093', '\u00d3'], ['\u00c3\u0094', '\u00d4'], ['\u00c3\u0095', '\u00d5'], ['\u00c3\u0096', '\u00d6'],
    ['\u00c3\u00ba', '\u00fa'], ['\u00c3\u00bc', '\u00fc'], ['\u00c3\u009a', '\u00da'], ['\u00c3\u009c', '\u00dc'],
    ['\u00c3\u00a7', '\u00e7'], ['\u00c3\u0087', '\u00c7'],
    ['\u00c2\u00ba', '\u00ba'], ['\u00c2\u00aa', '\u00aa'], ['\u00c2\u00b0', '\u00b0'],
    ['\u00e2\u0080\u0093', '-'], ['\u00e2\u0080\u0094', '-'], ['\u00e2\u0080\u00a6', '...'],
    ['\u00e2\u0080\u0099', "'"], ['\u00e2\u0080\u0098', "'"], ['\u00e2\u0080\u009c', '"'], ['\u00e2\u0080\u009d', '"'],
  ];

  for (const [broken, fixed] of pairs) {
    text = text.split(broken).join(fixed);
  }

  const contextualPairs: Array<[RegExp, Replacement]> = [
    [/CONCEI\uFFFD+O/gi, (match) => (match === match.toUpperCase() ? 'CONCEICAO' : 'Conceicao')],
    [/JO\uFFFDO/gi, (match) => (match === match.toUpperCase() ? 'JOAO' : 'Joao')],
    [/MEC\uFFFDNICO/gi, (match) => (match === match.toUpperCase() ? 'MECANICO' : 'Mecanico')],
    [/S\uFFFDNIOR/gi, (match) => (match === match.toUpperCase() ? 'SENIOR' : 'Senior')],
    [/T\uFFFDCNICO/gi, (match) => (match === match.toUpperCase() ? 'TECNICO' : 'Tecnico')],
    [/FUN\uFFFD+O/gi, (match) => (match === match.toUpperCase() ? 'FUNCAO' : 'Funcao')],
  ];

  for (const [pattern, replacement] of contextualPairs) {
    text = text.replace(pattern, replacement as any);
  }

  return text.replace(/\uFFFD+/g, '');
};

export const cleanText = (value: unknown): string =>
  replaceText(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();

export const cleanDocumentText = (value: unknown): string =>
  replaceText(String(value ?? ''));

export const cleanNullableText = (value: unknown, fallback = ''): string =>
  cleanText(value) || fallback;
