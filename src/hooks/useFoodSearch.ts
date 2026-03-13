import { useState, useEffect } from 'react';
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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    const searchFoods = async () => {
      if (debouncedSearchTerm.length < 2) {
        setFoods([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('food_database')
          .select('*')
          .ilike('nome', `%${debouncedSearchTerm}%`)
          .limit(limit);

        if (includeUserRecipes && userId) {
          // Buscar alimentos globais (user_id IS NULL) OU receitas do usuário (user_id = userId)
          query = query.or(`user_id.is.null,user_id.eq.${userId}`);
        } else {
          // Apenas alimentos globais
          query = query.is('user_id', null);
        }

        const { data, error: searchError } = await query.order('nome');
        
        if (searchError) {
          throw searchError;
        }
        
        setFoods(data || []);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar alimentos';
        setError(errorMessage);
        toast.error('Erro na busca', {
          description: errorMessage
        });
        setFoods([]);
      } finally {
        setLoading(false);
      }
    };

    searchFoods();
  }, [debouncedSearchTerm, userId, includeUserRecipes, limit]);

  const clearSearch = () => {
    setSearchTerm('');
    setFoods([]);
    setError(null);
  };

  return {
    searchTerm,
    setSearchTerm,
    foods,
    loading,
    error,
    clearSearch,
    hasResults: foods.length > 0,
    isEmpty: debouncedSearchTerm.length >= 2 && !loading && foods.length === 0
  };
}