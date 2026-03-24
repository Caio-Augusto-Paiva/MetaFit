import { useState, useEffect, useRef } from 'react';
import { supabase, FoodItem } from '@/lib/supabase';
import { useDebounce } from './useDebounce';
import { toast } from 'sonner';

interface UseFoodSearchOptions {
  userId?: string;
  includeUserRecipes?: boolean;
  limit?: number;
}

export function useFoodSearch(options: UseFoodSearchOptions = {}) {
  const { userId, includeUserRecipes = true, limit = 15 } = options;
  const searchOptionsRef = useRef({ userId, includeUserRecipes, limit });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    searchOptionsRef.current = { userId, includeUserRecipes, limit };
  }, [userId, includeUserRecipes, limit]);

  useEffect(() => {
    let cancelled = false;

    const searchFoods = async () => {
      const normalizedTerm = debouncedSearchTerm.trim();

      // 1. Trava inicial
      if (normalizedTerm.length < 2) {
        if (!cancelled) {
          setFoods([]);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      const { userId: currentUserId, includeUserRecipes: shouldIncludeUserRecipes, limit: currentLimit } = searchOptionsRef.current;
      const cacheKey = `food-search:${normalizedTerm.toLowerCase()}:${currentUserId ?? 'anon'}:${shouldIncludeUserRecipes ? 'with-user' : 'global-only'}:${currentLimit}`;

      if (!cancelled) {
        setIsLoading(true);
        setError(null);
      }

      let cacheHit = false;

      // 2. Tenta ler o Cache sem interromper a função
      try {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const parsedCache = JSON.parse(cachedData) as FoodItem[];
          if (Array.isArray(parsedCache)) {
            if (!cancelled) setFoods(parsedCache);
            cacheHit = true;
          }
        }
      } catch (cacheError) {
        console.warn('Erro ao ler o cache:', cacheError);
        localStorage.removeItem(cacheKey);
      }

      // 3. Se não achou no cache, bate no Supabase
      if (!cacheHit) {
        try {
          let query = supabase
            .from('food_database')
            .select('*')
            .ilike('nome', `%${normalizedTerm}%`)
            .limit(currentLimit);

          if (shouldIncludeUserRecipes && currentUserId) {
            query = query.or(`user_id.is.null,user_id.eq.${currentUserId}`);
          } else {
            query = query.is('user_id', null);
          }

          const { data, error: searchError } = await query.order('nome');
          
          if (searchError) throw searchError;

          if (!cancelled) {
            setFoods(data || []);
          }

          // Salva no cache silenciosamente
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data || []));
          } catch (e) {
            // Ignora erro de limite de memória do navegador
          }

        } catch (err) {
          console.error(err);
          const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar alimentos';
          if (!cancelled) {
            setError(errorMessage);
            toast.error('Erro na busca', { description: errorMessage });
            setFoods([]);
          }
        }
      }

      // 4. Garantia absoluta de desligar o loading (sem usar finally)
      if (!cancelled) {
        setIsLoading(false);
      }
    };

    void searchFoods();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchTerm]);

  const clearSearch = () => {
    setSearchTerm('');
    setFoods([]);
    setError(null);
    setIsLoading(false);
  };

  return {
    searchTerm,
    setSearchTerm,
    foods,
    loading: isLoading,
    error,
    clearSearch,
    hasResults: foods.length > 0,
    isEmpty: debouncedSearchTerm.length >= 2 && !isLoading && foods.length === 0
  };
}