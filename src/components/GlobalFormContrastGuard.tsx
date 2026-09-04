import { useEffect } from 'react';

const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"]';
const LIGHT_CLASS = 'topac-light-control';

type Rgba = { r: number; g: number; b: number; a: number };

const parseColor = (value: string): Rgba | null => {
  const match = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/i);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] == null ? 1 : Number(match[4]),
  };
};

const effectiveBackground = (element: HTMLElement): Rgba | null => {
  let current: HTMLElement | null = element;
  while (current) {
    const parsed = parseColor(window.getComputedStyle(current).backgroundColor || '');
    if (parsed && parsed.a >= 0.55) return parsed;
    current = current.parentElement;
  }
  return parseColor(window.getComputedStyle(document.body).backgroundColor || '');
};

const channel = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const luminance = ({ r, g, b }: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const syncControl = (element: Element) => {
  if (!(element instanceof HTMLElement) || !element.matches(CONTROL_SELECTOR)) return;
  const bg = effectiveBackground(element);
  if (!bg) return;
  element.classList.toggle(LIGHT_CLASS, luminance(bg) >= 0.52);
};

const scan = (root: ParentNode) => {
  if (root instanceof Element) syncControl(root);
  root.querySelectorAll?.(CONTROL_SELECTOR).forEach(syncControl);
};

const GlobalFormContrastGuard = () => {
  useEffect(() => {
    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          syncControl(mutation.target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state'],
    });

    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Element) syncControl(event.target);
    };
    const onInput = (event: Event) => {
      if (event.target instanceof Element) syncControl(event.target);
    };

    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('input', onInput, true);
    window.addEventListener('resize', () => scan(document), { passive: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('input', onInput, true);
    };
  }, []);

  return null;
};

export default GlobalFormContrastGuard;
