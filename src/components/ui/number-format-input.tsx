import * as React from 'react';
import { Input } from '@/components/ui/input';

const cleanNumberText = (value: string, allowNegative = false) => {
  const allowed = allowNegative ? /[^0-9,.-]/g : /[^0-9,.]/g;
  return String(value || '').replace(allowed, '');
};

export const parseBrazilianNumber = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = cleanNumberText(String(value || '').trim(), true);
  if (!raw || raw === '-' || raw === ',' || raw === '.') return 0;

  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/-/g, '');
  const hasComma = unsigned.includes(',');
  const hasDot = unsigned.includes('.');

  let normalized = unsigned;
  if (hasComma) {
    normalized = unsigned.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = unsigned.split('.');
    const last = parts[parts.length - 1] || '';
    const looksLikeThousands = parts.length > 2 || last.length === 3;
    normalized = looksLikeThousands ? unsigned.replace(/\./g, '') : unsigned;
  }

  const parsed = Number(`${negative ? '-' : ''}${normalized}`);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatBrazilianNumber = (
  value: number | null | undefined,
  decimals = 2,
  fixed = false,
) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  });
};

type FormattedNumberInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  decimals?: number;
  fixedDecimals?: boolean;
  allowNegative?: boolean;
};

export const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  ({ value, onValueChange, decimals = 2, fixedDecimals = false, allowNegative = false, onBlur, onFocus, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const [text, setText] = React.useState(formatBrazilianNumber(value, decimals, fixedDecimals));

    React.useEffect(() => {
      if (!focused) setText(formatBrazilianNumber(value, decimals, fixedDecimals));
    }, [value, decimals, fixedDecimals, focused]);

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onChange={(event) => {
          const next = cleanNumberText(event.target.value, allowNegative);
          setText(next);
          onValueChange(parseBrazilianNumber(next));
        }}
        onBlur={(event) => {
          setFocused(false);
          const parsed = parseBrazilianNumber(event.currentTarget.value);
          setText(formatBrazilianNumber(parsed, decimals, fixedDecimals));
          onValueChange(parsed);
          onBlur?.(event);
        }}
      />
    );
  },
);
FormattedNumberInput.displayName = 'FormattedNumberInput';

export const MoneyInput = React.forwardRef<HTMLInputElement, Omit<FormattedNumberInputProps, 'decimals' | 'fixedDecimals'>>(
  (props, ref) => <FormattedNumberInput {...props} ref={ref} decimals={2} fixedDecimals />,
);
MoneyInput.displayName = 'MoneyInput';

export const DecimalInput = React.forwardRef<HTMLInputElement, Omit<FormattedNumberInputProps, 'fixedDecimals'>>(
  (props, ref) => <FormattedNumberInput {...props} ref={ref} fixedDecimals={false} />,
);
DecimalInput.displayName = 'DecimalInput';
