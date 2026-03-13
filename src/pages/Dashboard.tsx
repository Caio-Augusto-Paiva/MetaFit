import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChefHat, Lightbulb, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAppDataContext } from '@/contexts/AppDataContext';
import { supabase, FoodItem } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateRecipeModal } from '@/components/CreateRecipeModal';

function fmt2(value: number): string {
  return Number(value || 0).toFixed(2);
}

const Dashboard = () => {
  const { user, profile, refreshProfile } = useAuthContext();
  const { getDailyData, ensureDateLoaded, addMeal, deleteMeal } = useAppDataContext();

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');
  const [hora, setHora] = useState(format(new Date(), 'HH:mm'));
  const [savingMeal, setSavingMeal] = useState(false);
  const [suggestion, setSuggestion] = useState<FoodItem | null>(null);
  const [weightInput, setWeightInput] = useState(profile?.peso?.toString() || '');
  const [savingWeight, setSavingWeight] = useState(false);
  const [estimatedWeight, setEstimatedWeight] = useState<number | null>(null);

  const {
    searchTerm,
    setSearchTerm,
    foods,
    loading: searchLoading,
    isEmpty,
    clearSearch,
  } = useFoodSearch({ userId: user?.id });

  useEffect(() => {
    setWeightInput(profile?.peso?.toString() || '');
  }, [profile?.peso]);

  useEffect(() => {
    if (!user) return;
    void ensureDateLoaded(date);
  }, [user, date, ensureDateLoaded]);

  useEffect(() => {
    const calculateEstimatedWeight = async () => {
      if (!user?.id || !profile?.peso) return;

      try {
        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const [{ data: yesterdayMeals, error: mealsError }, { data: yesterdayWorkouts, error: workoutsError }] = await Promise.all([
          supabase
            .from('meals')
            .select('quantidade_gramas, food_database(calorias_g)')
            .eq('user_id', user.id)
            .eq('data', yesterday),
          supabase
            .from('workouts')
            .select('calorias_gastas')
            .eq('user_id', user.id)
            .eq('data', yesterday),
        ]);

        if (mealsError) throw mealsError;
        if (workoutsError) throw workoutsError;

        const consumedYesterday = (yesterdayMeals || []).reduce((acc: number, meal: any) => {
          const caloriesPerGram = meal.food_database?.calorias_g || 0;
          return acc + caloriesPerGram * (meal.quantidade_gramas || 0);
        }, 0);

        const burnedYesterday = (yesterdayWorkouts || []).reduce((acc: number, workout: any) => {
          return acc + (workout.calorias_gastas || 0);
        }, 0);

        const meta = profile.calorias_meta || 2000;
        const daySurplus = consumedYesterday - burnedYesterday - meta;
        const deltaKg = daySurplus / 7700;

        setEstimatedWeight(profile.peso + deltaKg);
      } catch (err) {
        toast.error('Erro ao calcular evolucao de peso', {
          description: err instanceof Error ? err.message : 'Nao foi possivel calcular o peso estimado',
        });
      }
    };

    void calculateEstimatedWeight();
  }, [user?.id, profile?.peso, profile?.calorias_meta]);

  const { meals, workouts, loadingMeals, loadingWorkouts } = useMemo(() => getDailyData(date), [getDailyData, date]);

  const calcMacros = (food: FoodItem, qty: number) => {
    const safeQty = Number.isFinite(qty) ? qty : 0;
    return {
      cal: food.calorias_g * safeQty,
      prot: food.proteinas_g * safeQty,
      carb: food.carbos_g * safeQty,
      fat: food.gorduras_g * safeQty,
    };
  };

  const dailySummary = useMemo(() => {
    let cal = 0;
    let prot = 0;
    let carb = 0;
    let fat = 0;

    meals.forEach((meal) => {
      if (!meal.food_database) return;
      const macros = calcMacros(meal.food_database, meal.quantidade_gramas);
      cal += macros.cal;
      prot += macros.prot;
      carb += macros.carb;
      fat += macros.fat;
    });

    const burned = workouts.reduce((acc, workout) => acc + (workout.calorias_gastas || 0), 0);
    const meta = profile?.calorias_meta || 2000;
    const balance = meta - cal + burned;

    return {
      cal,
      prot,
      carb,
      fat,
      burned,
      meta,
      balance,
      isWithinGoal: balance >= 0,
      isOverLimit: balance < 0,
      protMeta: profile?.proteinas_meta,
      carbMeta: profile?.carbos_meta,
      fatMeta: profile?.gorduras_meta,
    };
  }, [meals, workouts, profile]);

  const addMealEntry = async () => {
    if (!selectedFood) return;

    try {
      setSavingMeal(true);
      const qty = Number(grams);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Quantidade em gramas deve ser maior que zero');
      }

      await addMeal({
        date,
        foodId: selectedFood.id,
        quantidadeGramas: qty,
        hora,
      });

      toast.success('Refeicao adicionada com sucesso');
      setSelectedFood(null);
      setGrams('100');
      clearSearch();
      setShowAdd(false);
    } catch (err) {
      toast.error('Erro ao adicionar refeicao', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setSavingMeal(false);
    }
  };

  const removeMealEntry = async (mealId: string) => {
    try {
      await deleteMeal({ date, mealId });
      toast.success('Refeicao removida');
    } catch (err) {
      toast.error('Erro ao remover refeicao', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    }
  };

  const updateWeight = async () => {
    if (!profile?.id) return;

    try {
      setSavingWeight(true);
      const parsedWeight = Number(weightInput);
      if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
        throw new Error('Peso deve ser um numero valido maior que zero');
      }

      const { error } = await supabase.from('users').update({ peso: parsedWeight }).eq('id', profile.id);
      if (error) throw error;

      refreshProfile();
      toast.success('Peso atualizado com sucesso');
    } catch (err) {
      toast.error('Erro ao atualizar peso', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setSavingWeight(false);
    }
  };

  const suggestFood = async () => {
    if (meals.length === 0) return;

    try {
      const lastMeal = meals[meals.length - 1];
      if (!lastMeal.food_database) return;

      const targetCal = lastMeal.food_database.calorias_g;
      const { data, error } = await supabase
        .from('food_database')
        .select('*')
        .gte('calorias_g', targetCal - 0.5)
        .lte('calorias_g', targetCal + 0.5)
        .neq('id', lastMeal.food_id)
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setSuggestion(data[0] as FoodItem);
      } else {
        setSuggestion(null);
        toast.info('Nenhum alimento similar encontrado');
      }
    } catch (err) {
      toast.error('Erro ao buscar sugestao', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    }
  };

  const closeAddModal = () => {
    setShowAdd(false);
    setSelectedFood(null);
    clearSearch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {format(new Date(`${date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto bg-secondary/50 text-sm"
        />
      </div>

      <div className="glass rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-40">
            <p className="text-xs text-muted-foreground">Peso atual (oficial)</p>
            <Input type="number" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} />
          </div>
          <Button onClick={updateWeight} disabled={savingWeight} className="mt-4">
            {savingWeight ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar peso
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Peso estimado com base no saldo calorico de ontem: {estimatedWeight ? `${fmt2(estimatedWeight)} kg` : 'indisponivel'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Consumidas', value: `${fmt2(dailySummary.cal)} kcal`, color: 'text-warning' },
          { label: 'Gastas', value: `${fmt2(dailySummary.burned)} kcal`, color: 'text-primary' },
          { label: 'Meta', value: `${fmt2(dailySummary.meta)} kcal`, color: 'text-muted-foreground' },
          {
            label: 'Saldo',
            value: `${dailySummary.balance > 0 ? '+' : ''}${fmt2(dailySummary.balance)} kcal`,
            color: dailySummary.isWithinGoal ? 'text-green-500' : 'text-red-500',
          },
        ].map((item) => (
          <div key={item.label} className="glass rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-lg font-bold font-mono ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {dailySummary.isWithinGoal ? (
        <div className="glass rounded-lg p-3 border border-green-500/30 bg-green-500/10 text-green-500 text-sm font-medium">
          Dentro da meta diaria
        </div>
      ) : (
        <div className="glass rounded-lg p-3 border border-red-500/30 bg-red-500/10 text-red-500 text-sm font-medium">
          Limite diario ultrapassado
        </div>
      )}

      <div className="glass rounded-lg p-4">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Macronutrientes</h4>
        <div className="grid grid-cols-3 gap-4 text-center text-xs">
          <div>
            <span className="text-muted-foreground">Proteinas</span>
            <p className="font-bold font-mono text-lg">{fmt2(dailySummary.prot)}g</p>
            <p className="text-muted-foreground">Meta: {fmt2(dailySummary.protMeta || 0)}g</p>
          </div>
          <div>
            <span className="text-muted-foreground">Carboidratos</span>
            <p className="font-bold font-mono text-lg">{fmt2(dailySummary.carb)}g</p>
            <p className="text-muted-foreground">Meta: {fmt2(dailySummary.carbMeta || 0)}g</p>
          </div>
          <div>
            <span className="text-muted-foreground">Gorduras</span>
            <p className="font-bold font-mono text-lg">{fmt2(dailySummary.fat)}g</p>
            <p className="text-muted-foreground">Meta: {fmt2(dailySummary.fatMeta || 0)}g</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Refeicoes</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={suggestFood} title="Sugerir alimento">
              <Lightbulb className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateRecipe(true)} title="Criar receita">
              <ChefHat className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        {suggestion && (
          <div className="glass rounded-lg p-3 border-primary/30 border animate-fade-in flex items-center justify-between">
            <div>
              <p className="text-xs text-primary font-medium">Sugestao de alimento similar</p>
              <p className="font-medium text-sm">{suggestion.nome}</p>
              <p className="text-xs text-muted-foreground">
                {fmt2(suggestion.calorias_g)} kcal/g | P:{fmt2(suggestion.proteinas_g)}g C:{fmt2(suggestion.carbos_g)}g G:{fmt2(suggestion.gorduras_g)}g
              </p>
            </div>
            <button onClick={() => setSuggestion(null)} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loadingMeals || loadingWorkouts ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : meals.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhuma refeicao registrada</p>
        ) : (
          meals.map((meal) => {
            const food = meal.food_database;
            if (!food) return null;
            const macros = calcMacros(food, meal.quantidade_gramas);
            return (
              <div key={meal.id} className="glass rounded-lg p-3 flex items-center justify-between animate-fade-in">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{meal.hora}</span>
                    <span className="font-medium text-sm">{food.nome}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt2(meal.quantidade_gramas)}g - {fmt2(macros.cal)} kcal - P:{fmt2(macros.prot)}g C:{fmt2(macros.carb)}g G:{fmt2(macros.fat)}g
                  </p>
                </div>
                <button onClick={() => void removeMealEntry(meal.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="glass rounded-xl p-5 w-full max-w-md space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Adicionar Alimento</h3>
              <button onClick={closeAddModal}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {!selectedFood ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar alimento ou receita..."
                    className="pl-9 bg-background/50"
                    autoFocus
                  />
                </div>

                {searchLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Buscando...</span>
                  </div>
                )}

                {isEmpty && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>Nenhum alimento encontrado</p>
                    <p className="text-xs mt-1">Tente buscar com outras palavras-chave</p>
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {foods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => setSelectedFood(food)}
                      className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <p className="font-medium text-sm">
                        {food.nome} {food.user_id && <span className="text-xs text-primary ml-2">(Sua receita)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt2(food.calorias_g)} kcal/g - P:{fmt2(food.proteinas_g)}g C:{fmt2(food.carbos_g)}g G:{fmt2(food.gorduras_g)}g
                      </p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="glass rounded-lg p-3">
                  <p className="font-medium">{selectedFood.nome}</p>
                  <p className="text-xs text-muted-foreground">{fmt2(selectedFood.calorias_g)} kcal/g</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Quantidade (g)</label>
                    <Input type="number" value={grams} onChange={(e) => setGrams(e.target.value)} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Horario</label>
                    <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="bg-background/50" />
                  </div>
                </div>
                {grams && (
                  <div className="text-sm text-muted-foreground">
                    {(() => {
                      const macros = calcMacros(selectedFood, Number(grams));
                      return `${fmt2(macros.cal)} kcal - P:${fmt2(macros.prot)}g C:${fmt2(macros.carb)}g G:${fmt2(macros.fat)}g`;
                    })()}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setSelectedFood(null)} className="flex-1">
                    Voltar
                  </Button>
                  <Button onClick={() => void addMealEntry()} disabled={savingMeal} className="flex-1 glow">
                    {savingMeal ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Registrar'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <CreateRecipeModal isOpen={showCreateRecipe} onClose={() => setShowCreateRecipe(false)} />
    </div>
  );
};

export default Dashboard;
