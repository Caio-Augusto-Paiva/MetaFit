import { useState, useEffect } from 'react';

/**
 * Hook para debounce de valores
 * @param value - valor a ser debounced
 * @param delay - delay em milissegundos (padrão: 300ms)
 * @returns valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}