import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Brain, Loader2, Plus, RefreshCw, Save, Send, Target, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAppDataContext } from '@/contexts/AppDataContext';
import { FoodItem, UserGoal, supabase } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AutoDietMeal {
  nome: string;
  food: FoodItem;
  gramas: number;
  calorias: number;
  proteinas: number;
  carbos: number;
  gorduras: number;
  hora: string;
}

interface NutritionistItem {
  id: string;
  food: FoodItem;
  gramas: number;
  hora: string;
}

function fmt2(value: number): string {
  return Number(value || 0).toFixed(2);
}

function mealMacros(food: FoodItem, grams: number) {
  return {
    calorias: food.calorias_g * grams,
    proteinas: food.proteinas_g * grams,
    carbos: food.carbos_g * grams,
    gorduras: food.gorduras_g * grams,
  };
}

function buildAutoDietPlan(foods: FoodItem[], goals: { calorias: number; proteinas: number; carbos: number; gorduras: number }): AutoDietMeal[] {
  const validFoods = foods.filter((food) => food.calorias_g > 0);
  if (validFoods.length < 4) {
    throw new Error('Base de alimentos insuficiente para gerar plano');
  }

  const proteinDense = [...validFoods].sort((a, b) => (b.proteinas_g / (b.calorias_g || 1)) - (a.proteinas_g / (a.calorias_g || 1)))[0];
  const carbDense = [...validFoods].sort((a, b) => (b.carbos_g / (b.calorias_g || 1)) - (a.carbos_g / (a.calorias_g || 1)))[0];
  const fatDense = [...validFoods].sort((a, b) => (b.gorduras_g / (b.calorias_g || 1)) - (a.gorduras_g / (a.calorias_g || 1)))[0];

  const balanced = [...validFoods].sort((a, b) => {
    const scoreA = Math.abs(a.proteinas_g - 0.08) + Math.abs(a.carbos_g - 0.1) + Math.abs(a.gorduras_g - 0.03);
    const scoreB = Math.abs(b.proteinas_g - 0.08) + Math.abs(b.carbos_g - 0.1) + Math.abs(b.gorduras_g - 0.03);
    return scoreA - scoreB;
  })[0];

  const slots: Array<{ nome: string; alvoCalorias: number; hora: string; food: FoodItem }> = [
    { nome: 'Cafe da Manha', alvoCalorias: goals.calorias * 0.25, hora: '07:30', food: carbDense },
    { nome: 'Almoco', alvoCalorias: goals.calorias * 0.35, hora: '12:30', food: proteinDense },
    { nome: 'Lanche', alvoCalorias: goals.calorias * 0.15, hora: '16:30', food: balanced },
    { nome: 'Jantar', alvoCalorias: goals.calorias * 0.25, hora: '20:00', food: fatDense },
  ];

  const initialPlan = slots.map((slot) => {
    const gramas = Math.max(30, slot.alvoCalorias / slot.food.calorias_g);
    const macros = mealMacros(slot.food, gramas);
    return {
      nome: slot.nome,
      food: slot.food,
      gramas,
      calorias: macros.calorias,
      proteinas: macros.proteinas,
      carbos: macros.carbos,
      gorduras: macros.gorduras,
      hora: slot.hora,
    };
  });

  const totalCalorias = initialPlan.reduce((acc, item) => acc + item.calorias, 0);
  const correctionFactor = goals.calorias > 0 && totalCalorias > 0 ? goals.calorias / totalCalorias : 1;

  return initialPlan.map((meal) => {
    const adjustedGramas = meal.gramas * correctionFactor;
    const adjustedMacros = mealMacros(meal.food, adjustedGramas);
    return {
      ...meal,
      gramas: adjustedGramas,
      calorias: adjustedMacros.calorias,
      proteinas: adjustedMacros.proteinas,
      carbos: adjustedMacros.carbos,
      gorduras: adjustedMacros.gorduras,
    };
  });
}

const Diet = () => {
  const { user, profile, refreshProfile } = useAuthContext();
  const { addMeal } = useAppDataContext();

  const [manualGoals, setManualGoals] = useState({
    calorias_meta: profile?.calorias_meta?.toString() || '',
    proteinas_meta: profile?.proteinas_meta?.toString() || '',
    carbos_meta: profile?.carbos_meta?.toString() || '',
    gorduras_meta: profile?.gorduras_meta?.toString() || '',
    objetivo: (profile?.objetivo || 'manutencao') as UserGoal,
  });

  const [savingManualGoals, setSavingManualGoals] = useState(false);

  const [aiMeals, setAiMeals] = useState<AutoDietMeal[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [sendingAIToMeals, setSendingAIToMeals] = useState(false);

  const [nutritionistItems, setNutritionistItems] = useState<NutritionistItem[]>([]);
  const [showNutritionistSearch, setShowNutritionistSearch] = useState(false);
  const [selectedNutritionistFood, setSelectedNutritionistFood] = useState<FoodItem | null>(null);
  const [nutritionistGrams, setNutritionistGrams] = useState('100');
  const [nutritionistHour, setNutritionistHour] = useState('12:00');
  const [sendingNutritionistPlan, setSendingNutritionistPlan] = useState(false);

  const {
    searchTerm,
    setSearchTerm,
    foods,
    loading: searchingFoods,
    isEmpty,
    clearSearch,
  } = useFoodSearch({ userId: user?.id });

  useEffect(() => {
    setManualGoals({
      calorias_meta: profile?.calorias_meta?.toString() || '',
      proteinas_meta: profile?.proteinas_meta?.toString() || '',
      carbos_meta: profile?.carbos_meta?.toString() || '',
      gorduras_meta: profile?.gorduras_meta?.toString() || '',
      objetivo: (profile?.objetivo || 'manutencao') as UserGoal,
    });
  }, [profile?.calorias_meta, profile?.proteinas_meta, profile?.carbos_meta, profile?.gorduras_meta, profile?.objetivo]);

  const currentGoalLabel = profile?.objetivo === 'perda' ? 'Perda de Gordura' : profile?.objetivo === 'ganho' ? 'Ganho de Massa' : 'Manutencao';

  const aiTotals = useMemo(() => {
    return aiMeals.reduce(
      (acc, meal) => {
        acc.calorias += meal.calorias;
        acc.proteinas += meal.proteinas;
        acc.carbos += meal.carbos;
        acc.gorduras += meal.gorduras;
        return acc;
      },
      { calorias: 0, proteinas: 0, carbos: 0, gorduras: 0 }
    );
  }, [aiMeals]);

  const nutritionistTotals = useMemo(() => {
    return nutritionistItems.reduce(
      (acc, item) => {
        const macros = mealMacros(item.food, item.gramas);
        acc.calorias += macros.calorias;
        acc.proteinas += macros.proteinas;
        acc.carbos += macros.carbos;
        acc.gorduras += macros.gorduras;
        return acc;
      },
      { calorias: 0, proteinas: 0, carbos: 0, gorduras: 0 }
    );
  }, [nutritionistItems]);

  const saveManualGoals = async () => {
    if (!profile?.id) return;

    const calorias = Number(manualGoals.calorias_meta);
    const proteinas = Number(manualGoals.proteinas_meta);
    const carbos = Number(manualGoals.carbos_meta);
    const gorduras = Number(manualGoals.gorduras_meta);

    if (!Number.isFinite(calorias) || calorias <= 0) {
      toast.error('Calorias totais devem ser um numero valido maior que zero');
      return;
    }

    setSavingManualGoals(true);
    try {
      const payload: Record<string, any> = {
        calorias_meta: calorias,
        objetivo: manualGoals.objetivo,
        proteinas_meta: Number.isFinite(proteinas) && proteinas > 0 ? proteinas : null,
        carbos_meta: Number.isFinite(carbos) && carbos > 0 ? carbos : null,
        gorduras_meta: Number.isFinite(gorduras) && gorduras > 0 ? gorduras : null,
      };

      const { error } = await supabase.from('users').update(payload).eq('id', profile.id);
      if (error) throw error;

      refreshProfile();
      toast.success('Metas atualizadas com sucesso');
    } catch (err) {
      toast.error('Erro ao salvar metas', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setSavingManualGoals(false);
    }
  };

  const generateDietByAI = async () => {
    if (!profile?.id) return;

    const targetCalorias = Number(manualGoals.calorias_meta || profile.calorias_meta || 0);
    const targetProteinas = Number(manualGoals.proteinas_meta || profile.proteinas_meta || 0);
    const targetCarbos = Number(manualGoals.carbos_meta || profile.carbos_meta || 0);
    const targetGorduras = Number(manualGoals.gorduras_meta || profile.gorduras_meta || 0);

    if (!Number.isFinite(targetCalorias) || targetCalorias <= 0) {
      toast.error('Defina primeiro uma meta valida de calorias');
      return;
    }

    setGeneratingAI(true);
    try {
      const { data, error } = await supabase
        .from('food_database')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${profile.id}`)
        .limit(250);

      if (error) throw error;

      const plan = buildAutoDietPlan((data || []) as FoodItem[], {
        calorias: targetCalorias,
        proteinas: targetProteinas,
        carbos: targetCarbos,
        gorduras: targetGorduras,
      });

      setAiMeals(plan);
      toast.success('Plano alimentar gerado');
    } catch (err) {
      toast.error('Erro ao gerar dieta por IA', {
        description: err instanceof Error ? err.message : 'Nao foi possivel montar um plano',
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const sendAIPlanToTodayMeals = async () => {
    if (aiMeals.length === 0) {
      toast.error('Gere um plano de IA antes de enviar para as refeicoes');
      return;
    }

    setSendingAIToMeals(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      for (const meal of aiMeals) {
        await addMeal({
          date: today,
          foodId: meal.food.id,
          quantidadeGramas: Number(meal.gramas.toFixed(2)),
          hora: meal.hora,
        });
      }
      toast.success('Plano de IA enviado para as refeicoes de hoje');
    } catch (err) {
      toast.error('Erro ao enviar plano de IA', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setSendingAIToMeals(false);
    }
  };

  const addNutritionistItem = () => {
    if (!selectedNutritionistFood) return;

    const grams = Number(nutritionistGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }

    const newItem: NutritionistItem = {
      id: crypto.randomUUID(),
      food: selectedNutritionistFood,
      gramas: grams,
      hora: nutritionistHour,
    };

    setNutritionistItems((prev) => [...prev, newItem]);
    setSelectedNutritionistFood(null);
    setNutritionistGrams('100');
    setShowNutritionistSearch(false);
    clearSearch();
  };

  const removeNutritionistItem = (itemId: string) => {
    setNutritionistItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const sendNutritionistPlanToMeals = async () => {
    if (nutritionistItems.length === 0) {
      toast.error('Adicione alimentos no plano do nutricionista');
      return;
    }

    setSendingNutritionistPlan(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      for (const item of nutritionistItems) {
        await addMeal({
          date: today,
          foodId: item.food.id,
          quantidadeGramas: item.gramas,
          hora: item.hora,
        });
      }
      toast.success('Plano do nutricionista enviado para refeicoes de hoje');
    } catch (err) {
      toast.error('Erro ao enviar plano do nutricionista', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setSendingNutritionistPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Plano Alimentar Integrado</h2>
        <div className="text-right text-sm">
          <p className="text-muted-foreground">Objetivo atual</p>
          <p className="font-semibold text-primary">{currentGoalLabel}</p>
        </div>
      </div>

      <Tabs defaultValue="metas" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metas" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Metas
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Dieta por IA
          </TabsTrigger>
          <TabsTrigger value="nutricionista" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nutricionista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Metas diarias de calorias e macros</CardTitle>
              <CardDescription>Essas metas alimentam os calculos do dashboard e da geracao automatica de dieta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Objetivo</label>
                <Select value={manualGoals.objetivo} onValueChange={(value: UserGoal) => setManualGoals((prev) => ({ ...prev, objetivo: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perda">Perda</SelectItem>
                    <SelectItem value="manutencao">Manutencao</SelectItem>
                    <SelectItem value="ganho">Ganho</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Calorias totais</label>
                  <Input
                    type="number"
                    value={manualGoals.calorias_meta}
                    onChange={(e) => setManualGoals((prev) => ({ ...prev, calorias_meta: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Proteinas (g)</label>
                  <Input
                    type="number"
                    value={manualGoals.proteinas_meta}
                    onChange={(e) => setManualGoals((prev) => ({ ...prev, proteinas_meta: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Carboidratos (g)</label>
                  <Input
                    type="number"
                    value={manualGoals.carbos_meta}
                    onChange={(e) => setManualGoals((prev) => ({ ...prev, carbos_meta: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gorduras (g)</label>
                  <Input
                    type="number"
                    value={manualGoals.gorduras_meta}
                    onChange={(e) => setManualGoals((prev) => ({ ...prev, gorduras_meta: e.target.value }))}
                  />
                </div>
              </div>

              <Button onClick={saveManualGoals} disabled={savingManualGoals} className="w-full glow">
                {savingManualGoals ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando metas...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar metas
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dieta automatica por IA</CardTitle>
              <CardDescription>Plano simulado a partir de alimentos reais da base `food_database`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={generateDietByAI} disabled={generatingAI} className="w-full glow">
                {generatingAI ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando dieta...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Gerar Dieta por IA
                  </>
                )}
              </Button>

              {aiMeals.length > 0 && (
                <>
                  <div className="glass rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                    <div>
                      <p className="font-bold font-mono text-lg">{fmt2(aiTotals.calorias)}</p>
                      <p className="text-muted-foreground">kcal</p>
                    </div>
                    <div>
                      <p className="font-bold font-mono text-lg">{fmt2(aiTotals.proteinas)}</p>
                      <p className="text-muted-foreground">Prot</p>
                    </div>
                    <div>
                      <p className="font-bold font-mono text-lg">{fmt2(aiTotals.carbos)}</p>
                      <p className="text-muted-foreground">Carb</p>
                    </div>
                    <div>
                      <p className="font-bold font-mono text-lg">{fmt2(aiTotals.gorduras)}</p>
                      <p className="text-muted-foreground">Gord</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {aiMeals.map((meal, idx) => (
                      <div key={`${meal.food.id}-${idx}`} className="glass rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{meal.nome}</p>
                          <span className="text-xs text-muted-foreground font-mono">{meal.hora}</span>
                        </div>
                        <p className="text-sm">{meal.food.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt2(meal.gramas)}g - {fmt2(meal.calorias)} kcal - P:{fmt2(meal.proteinas)} C:{fmt2(meal.carbos)} G:{fmt2(meal.gorduras)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={generateDietByAI} disabled={generatingAI} className="flex-1">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerar
                    </Button>
                    <Button onClick={sendAIPlanToTodayMeals} disabled={sendingAIToMeals} className="flex-1 glow">
                      {sendingAIToMeals ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Enviar para refeicoes de hoje
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nutricionista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plano do nutricionista</CardTitle>
              <CardDescription>Cadastre os alimentos e quantidades recebidos do seu nutricionista.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Itens do plano</p>
                <Button size="sm" onClick={() => setShowNutritionistSearch(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar alimento
                </Button>
              </div>

              {nutritionistItems.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Nenhum alimento adicionado ao plano.</p>
              ) : (
                <div className="space-y-2">
                  {nutritionistItems.map((item) => {
                    const macros = mealMacros(item.food, item.gramas);
                    return (
                      <div key={item.id} className="glass rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{item.food.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt2(item.gramas)}g - {item.hora} - {fmt2(macros.calorias)} kcal - P:{fmt2(macros.proteinas)} C:{fmt2(macros.carbos)} G:{fmt2(macros.gorduras)}
                          </p>
                        </div>
                        <button className="text-muted-foreground hover:text-destructive" onClick={() => removeNutritionistItem(item.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="glass rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div>
                  <p className="font-bold font-mono text-lg">{fmt2(nutritionistTotals.calorias)}</p>
                  <p className="text-muted-foreground">kcal</p>
                </div>
                <div>
                  <p className="font-bold font-mono text-lg">{fmt2(nutritionistTotals.proteinas)}</p>
                  <p className="text-muted-foreground">Prot</p>
                </div>
                <div>
                  <p className="font-bold font-mono text-lg">{fmt2(nutritionistTotals.carbos)}</p>
                  <p className="text-muted-foreground">Carb</p>
                </div>
                <div>
                  <p className="font-bold font-mono text-lg">{fmt2(nutritionistTotals.gorduras)}</p>
                  <p className="text-muted-foreground">Gord</p>
                </div>
              </div>

              <Button onClick={sendNutritionistPlanToMeals} disabled={sendingNutritionistPlan} className="w-full glow">
                {sendingNutritionistPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando plano...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar plano para refeicoes de hoje
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {showNutritionistSearch && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
              <div className="glass rounded-xl p-5 w-full max-w-md space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Adicionar ao plano</h3>
                  <button
                    onClick={() => {
                      setShowNutritionistSearch(false);
                      setSelectedNutritionistFood(null);
                      clearSearch();
                    }}
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {!selectedNutritionistFood ? (
                  <>
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar alimento ou receita..."
                      autoFocus
                    />

                    {searchingFoods && (
                      <div className="flex justify-center py-3">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {isEmpty && (
                      <p className="text-center text-muted-foreground text-sm py-3">Nenhum alimento encontrado</p>
                    )}

                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {foods.map((food) => (
                        <button
                          key={food.id}
                          onClick={() => setSelectedNutritionistFood(food)}
                          className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                        >
                          <p className="font-medium text-sm">{food.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt2(food.calorias_g)} kcal/g - P:{fmt2(food.proteinas_g)} C:{fmt2(food.carbos_g)} G:{fmt2(food.gorduras_g)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="glass rounded-lg p-3">
                      <p className="font-medium">{selectedNutritionistFood.nome}</p>
                      <p className="text-xs text-muted-foreground">{fmt2(selectedNutritionistFood.calorias_g)} kcal/g</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Quantidade (g)</label>
                        <Input type="number" value={nutritionistGrams} onChange={(e) => setNutritionistGrams(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Horario</label>
                        <Input type="time" value={nutritionistHour} onChange={(e) => setNutritionistHour(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setSelectedNutritionistFood(null)} className="flex-1">
                        Voltar
                      </Button>
                      <Button onClick={addNutritionistItem} className="flex-1 glow">
                        Adicionar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Diet;
