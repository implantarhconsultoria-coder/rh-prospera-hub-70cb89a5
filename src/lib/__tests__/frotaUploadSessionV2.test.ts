import { describe, expect, it } from 'vitest';
import { parseMultipartBody } from '../../../api/frota-upload-v2';

describe('Frota upload V2', () => {
  it('preserva o PDF binário e o JSON extraído no multipart/form-data', () => {
    const boundary = '----topacBoundary123';
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff, 0x01, 0x02]);
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="A10.149-CUI-4B29.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`,
    );
    const middle = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="extracted"\r\n\r\n` +
      JSON.stringify({ placa: 'CUI4B29', patrimonio: 'A10.149' }) +
      `\r\n--${boundary}--\r\n`,
    );
    const body = Buffer.concat([head, pdfBytes, middle]);

    const parts = parseMultipartBody(body, `multipart/form-data; boundary=${boundary}`);
    const file = parts.find((part) => part.name === 'file');
    const extracted = parts.find((part) => part.name === 'extracted');

    expect(file?.filename).toBe('A10.149-CUI-4B29.pdf');
    expect(file?.contentType).toBe('application/pdf');
    expect(file?.data.equals(pdfBytes)).toBe(true);
    expect(JSON.parse(extracted?.data.toString('utf8') || '{}')).toEqual({
      placa: 'CUI4B29',
      patrimonio: 'A10.149',
    });
  });
});
