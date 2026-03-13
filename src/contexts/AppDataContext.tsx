import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Meal, Workout, supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';

function normalizeWorkout(workout: Workout): Workout {
  return {
    ...workout,
    tipo: workout.tipo ?? workout.tipo_atividade ?? '',
    duracao_min: workout.duracao_min ?? workout.duracao_minutos ?? 0,
  };
}

type DailyData = {
  meals: Meal[];
  workouts: Workout[];
  loadingMeals: boolean;
  loadingWorkouts: boolean;
};

type AppDataContextType = {
  getDailyData: (date: string) => DailyData;
  ensureDateLoaded: (date: string) => Promise<void>;
  refreshDate: (date: string) => Promise<void>;
  addMeal: (payload: {
    date: string;
    foodId: string;
    quantidadeGramas: number;
    hora: string;
  }) => Promise<void>;
  deleteMeal: (payload: { date: string; mealId: string }) => Promise<void>;
  addWorkout: (payload: {
    date: string;
    tipo: string;
    duracaoMin: number;
    caloriasGastas: number;
  }) => Promise<void>;
  deleteWorkout: (payload: { date: string; workoutId: string }) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextType | null>(null);

function storageKey(userId: string) {
  return `fittrack-app-data-${userId}`;
}

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [workoutsByDate, setWorkoutsByDate] = useState<Record<string, Workout[]>>({});
  const [loadingMealsByDate, setLoadingMealsByDate] = useState<Record<string, boolean>>({});
  const [loadingWorkoutsByDate, setLoadingWorkoutsByDate] = useState<Record<string, boolean>>({});
  const mealsByDateRef = useRef<Record<string, Meal[]>>({});
  const workoutsByDateRef = useRef<Record<string, Workout[]>>({});

  useEffect(() => {
    mealsByDateRef.current = mealsByDate;
  }, [mealsByDate]);

  useEffect(() => {
    workoutsByDateRef.current = workoutsByDate;
  }, [workoutsByDate]);

  const persistSnapshot = useCallback((nextMeals: Record<string, Meal[]>, nextWorkouts: Record<string, Workout[]>) => {
    if (!user?.id) return;
    try {
      sessionStorage.setItem(
        storageKey(user.id),
        JSON.stringify({ mealsByDate: nextMeals, workoutsByDate: nextWorkouts })
      );
    } catch {
      // Ignore sessionStorage failures to avoid blocking UI.
    }
  }, [user?.id]);

  const hydrateFromSession = useCallback(() => {
    if (!user?.id) return;
    try {
      const raw = sessionStorage.getItem(storageKey(user.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        mealsByDate?: Record<string, Meal[]>;
        workoutsByDate?: Record<string, Workout[]>;
      };
      setMealsByDate(parsed.mealsByDate || {});
      setWorkoutsByDate(parsed.workoutsByDate || {});
      mealsByDateRef.current = parsed.mealsByDate || {};
      workoutsByDateRef.current = parsed.workoutsByDate || {};
    } catch {
      // Ignore invalid session cache and keep app functional.
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setMealsByDate({});
      setWorkoutsByDate({});
      setLoadingMealsByDate({});
      setLoadingWorkoutsByDate({});
      return;
    }

    hydrateFromSession();
  }, [user?.id, hydrateFromSession]);

  const fetchMealsForDate = useCallback(async (date: string) => {
    if (!user?.id) return;

    setLoadingMealsByDate((prev) => ({ ...prev, [date]: true }));
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*, food_database(*)')
        .eq('user_id', user.id)
        .eq('data', date)
        .order('hora');

      if (error) throw error;

      const nextMealsList = (data as Meal[]) || [];
      setMealsByDate((prev) => {
        const nextMeals = { ...prev, [date]: nextMealsList };
        persistSnapshot(nextMeals, workoutsByDateRef.current);
        return nextMeals;
      });
    } catch (err) {
      toast.error('Erro ao carregar refeicoes', {
        description: err instanceof Error ? err.message : 'Falha ao buscar refeicoes do dia',
      });
    } finally {
      setLoadingMealsByDate((prev) => ({ ...prev, [date]: false }));
    }
  }, [user?.id, persistSnapshot]);

  const fetchWorkoutsForDate = useCallback(async (date: string) => {
    if (!user?.id) return;

    setLoadingWorkoutsByDate((prev) => ({ ...prev, [date]: true }));
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('data', date)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const nextWorkoutsList = ((data as Workout[]) || []).map(normalizeWorkout);
      setWorkoutsByDate((prev) => {
        const nextWorkouts = { ...prev, [date]: nextWorkoutsList };
        persistSnapshot(mealsByDateRef.current, nextWorkouts);
        return nextWorkouts;
      });
    } catch (err) {
      toast.error('Erro ao carregar treinos', {
        description: err instanceof Error ? err.message : 'Falha ao buscar treinos do dia',
      });
    } finally {
      setLoadingWorkoutsByDate((prev) => ({ ...prev, [date]: false }));
    }
  }, [user?.id, persistSnapshot]);

  const ensureDateLoaded = useCallback(async (date: string) => {
    const needsMeals = mealsByDate[date] === undefined;
    const needsWorkouts = workoutsByDate[date] === undefined;

    await Promise.all([
      needsMeals ? fetchMealsForDate(date) : Promise.resolve(),
      needsWorkouts ? fetchWorkoutsForDate(date) : Promise.resolve(),
    ]);
  }, [mealsByDate, workoutsByDate, fetchMealsForDate, fetchWorkoutsForDate]);

  const refreshDate = useCallback(async (date: string) => {
    await Promise.all([fetchMealsForDate(date), fetchWorkoutsForDate(date)]);
  }, [fetchMealsForDate, fetchWorkoutsForDate]);

  useEffect(() => {
    if (!user?.id) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    void ensureDateLoaded(today);
  }, [user?.id, ensureDateLoaded]);

  const addMeal = useCallback(async (payload: { date: string; foodId: string; quantidadeGramas: number; hora: string }) => {
    if (!user?.id) return;

    const { error } = await supabase.from('meals').insert({
      user_id: user.id,
      food_id: payload.foodId,
      quantidade_gramas: payload.quantidadeGramas,
      data: payload.date,
      hora: payload.hora,
    });

    if (error) throw error;
    await fetchMealsForDate(payload.date);
  }, [user?.id, fetchMealsForDate]);

  const deleteMeal = useCallback(async (payload: { date: string; mealId: string }) => {
    const { error } = await supabase.from('meals').delete().eq('id', payload.mealId);
    if (error) throw error;
    await fetchMealsForDate(payload.date);
  }, [fetchMealsForDate]);

  const addWorkout = useCallback(async (payload: { date: string; tipo: string; duracaoMin: number; caloriasGastas: number }) => {
    if (!user?.id) return;

    const primaryPayload = {
      user_id: user.id,
      data: payload.date,
      tipo_atividade: payload.tipo,
      duracao_minutos: payload.duracaoMin,
      calorias_gastas: payload.caloriasGastas,
    };

    const legacyPayload = {
      user_id: user.id,
      data: payload.date,
      tipo: payload.tipo,
      duracao_min: payload.duracaoMin,
      calorias_gastas: payload.caloriasGastas,
    };

    const { error: primaryError } = await supabase.from('workouts').insert(primaryPayload);

    if (primaryError) {
      const message = String(primaryError.message || '').toLowerCase();
      const looksLikeMissingColumn =
        message.includes('column') ||
        message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('pgrst204');

      if (!looksLikeMissingColumn) {
        throw primaryError;
      }

      const { error: legacyError } = await supabase.from('workouts').insert(legacyPayload);
      if (legacyError) {
        throw legacyError;
      }
    }

    await fetchWorkoutsForDate(payload.date);
  }, [user?.id, fetchWorkoutsForDate]);

  const deleteWorkout = useCallback(async (payload: { date: string; workoutId: string }) => {
    const { error } = await supabase.from('workouts').delete().eq('id', payload.workoutId);
    if (error) throw error;
    await fetchWorkoutsForDate(payload.date);
  }, [fetchWorkoutsForDate]);

  const getDailyData = useCallback((date: string): DailyData => {
    return {
      meals: mealsByDate[date] ?? [],
      workouts: workoutsByDate[date] ?? [],
      loadingMeals: loadingMealsByDate[date] ?? false,
      loadingWorkouts: loadingWorkoutsByDate[date] ?? false,
    };
  }, [mealsByDate, workoutsByDate, loadingMealsByDate, loadingWorkoutsByDate]);

  const value = useMemo<AppDataContextType>(() => ({
    getDailyData,
    ensureDateLoaded,
    refreshDate,
    addMeal,
    deleteMeal,
    addWorkout,
    deleteWorkout,
  }), [getDailyData, ensureDateLoaded, refreshDate, addMeal, deleteMeal, addWorkout, deleteWorkout]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export function useAppDataContext() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppDataContext must be used within AppDataProvider');
  }
  return ctx;
}
