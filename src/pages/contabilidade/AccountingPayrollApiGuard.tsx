import { useEffect } from 'react';

const OLD_ENDPOINT = '/api/accounting-payroll-flow';
const GUARDED_ENDPOINT = '/api/accounting-payroll-flow-v2';

export default function AccountingPayrollApiGuard() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const guardedFetch: typeof window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input === OLD_ENDPOINT) {
        return originalFetch(GUARDED_ENDPOINT, init);
      }
      if (input instanceof Request && new URL(input.url, window.location.origin).pathname === OLD_ENDPOINT) {
        const next = new Request(new URL(GUARDED_ENDPOINT, window.location.origin), input);
        return originalFetch(next, init);
      }
      return originalFetch(input, init);
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
    };
  }, []);

  return null;
}
