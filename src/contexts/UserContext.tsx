import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAppDataContext } from '@/contexts/AppDataContext';
import { AppUser, WeightHistoryPoint, supabase } from '@/lib/supabase';

type ConsumedTotals = {
  calorias: number;
  proteinas: number;
  carbos: number;
  gorduras: number;
};

type UserContextType = {
  profile: AppUser | null;
  updateUserProfile: (payload: Partial<Pick<AppUser, 'nome' | 'peso' | 'objetivo' | 'tmb_base' | 'alteracao_calorica_alvo' | 'treina_atualmente' | 'tipo_treino' | 'calorias_meta' | 'proteinas_meta' | 'carbos_meta' | 'gorduras_meta'>>) => Promise<AppUser>;
  updateWeightAndTrack: (newWeight: number) => Promise<void>;
  weightHistory: WeightHistoryPoint[];
  loadingWeightHistory: boolean;
  refreshWeightHistory: () => Promise<void>;
  getConsumedTotals: (date: string) => ConsumedTotals;
};

type WeightHistoryRow = {
  id?: string;
  user_id?: string;
  peso?: number;
  weight?: number;
  peso_kg?: number;
  created_at?: string;
  recorded_at?: string;
  data_registro?: string;
  data?: string;
  date?: string;
};

const UserContext = createContext<UserContextType | null>(null);

function toWeightHistoryPoint(row: WeightHistoryRow): WeightHistoryPoint | null {
  const value = row.peso ?? row.weight ?? row.peso_kg;
  const date = row.created_at ?? row.recorded_at ?? row.data_registro ?? row.data ?? row.date;
  const id = row.id;
  const userId = row.user_id;

  if (!id || !userId || !Number.isFinite(value) || !date) return null;

  return {
    id,
    user_id: userId,
    peso: Number(value),
    date,
  };
}

function sortWeightHistory(points: WeightHistoryPoint[]): WeightHistoryPoint[] {
  return [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function looksLikeMissingColumnError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('pgrst204')
  );
}

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, updateProfile } = useAuthContext();
  const { getDailyData } = useAppDataContext();

  const [weightHistory, setWeightHistory] = useState<WeightHistoryPoint[]>([]);
  const [loadingWeightHistory, setLoadingWeightHistory] = useState(false);

  const refreshWeightHistory = useCallback(async () => {
    if (!user?.id) {
      setWeightHistory([]);
      return;
    }

    setLoadingWeightHistory(true);
    try {
      const tryCreatedAt = await supabase
        .from('weight_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      let rows: WeightHistoryRow[] | null = null;
      let error = tryCreatedAt.error;

      if (!error) {
        rows = (tryCreatedAt.data as WeightHistoryRow[]) || [];
      } else if (looksLikeMissingColumnError(error)) {
        const tryRecordedAt = await supabase
          .from('weight_history')
          .select('*')
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: true });

        if (!tryRecordedAt.error) {
          rows = (tryRecordedAt.data as WeightHistoryRow[]) || [];
          error = null;
        } else {
          const fallback = await supabase
            .from('weight_history')
            .select('*')
            .eq('user_id', user.id);

          rows = (fallback.data as WeightHistoryRow[]) || [];
          error = fallback.error;
        }
      }

      if (error) throw error;

      const parsed = (rows || [])
        .map(toWeightHistoryPoint)
        .filter((item): item is WeightHistoryPoint => item !== null);

      setWeightHistory(sortWeightHistory(parsed));
    } finally {
      setLoadingWeightHistory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshWeightHistory();
  }, [refreshWeightHistory]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`weight-history-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weight_history', filter: `user_id=eq.${user.id}` },
        () => {
          void refreshWeightHistory();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, refreshWeightHistory]);

  const insertWeightHistoryPoint = useCallback(async (newWeight: number) => {
    if (!user?.id) {
      throw new Error('Usuario nao autenticado');
    }

    const nowIso = new Date().toISOString();
    const fallbackDate = nowIso.slice(0, 10);

    const attempts: Array<Record<string, unknown>> = [
      { user_id: user.id, peso: newWeight, recorded_at: nowIso },
      { user_id: user.id, peso: newWeight, data_registro: fallbackDate },
      { user_id: user.id, peso: newWeight },
    ];

    let lastError: unknown;
    for (const payload of attempts) {
      const { data, error } = await supabase
        .from('weight_history')
        .insert(payload)
        .select('*')
        .single();

      if (!error && data) {
        const parsed = toWeightHistoryPoint(data as WeightHistoryRow);
        if (parsed) {
          setWeightHistory((prev) => sortWeightHistory([...prev.filter((item) => item.id !== parsed.id), parsed]));
        } else {
          void refreshWeightHistory();
        }
        return;
      }

      lastError = error;
      if (!looksLikeMissingColumnError(error)) {
        break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Nao foi possivel registrar o historico de peso');
  }, [user?.id, refreshWeightHistory]);

  const updateWeightAndTrack = useCallback(async (newWeight: number) => {
    await updateProfile({ peso: newWeight });
    await insertWeightHistoryPoint(newWeight);
  }, [updateProfile, insertWeightHistoryPoint]);

  const value = useMemo<UserContextType>(() => ({
    profile,
    updateUserProfile: updateProfile,
    updateWeightAndTrack,
    weightHistory,
    loadingWeightHistory,
    refreshWeightHistory,
    getConsumedTotals: (date: string) => {
      const { meals } = getDailyData(date);

      return meals.reduce<ConsumedTotals>(
        (acc, meal) => {
          if (!meal.food_database) return acc;
          acc.calorias += meal.food_database.calorias_g * meal.quantidade_gramas;
          acc.proteinas += meal.food_database.proteinas_g * meal.quantidade_gramas;
          acc.carbos += meal.food_database.carbos_g * meal.quantidade_gramas;
          acc.gorduras += meal.food_database.gorduras_g * meal.quantidade_gramas;
          return acc;
        },
        { calorias: 0, proteinas: 0, carbos: 0, gorduras: 0 }
      );
    },
  }), [profile, updateProfile, updateWeightAndTrack, weightHistory, loadingWeightHistory, refreshWeightHistory, getDailyData]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export function useUserContext() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUserContext must be used within UserProvider');
  }
  return ctx;
}
