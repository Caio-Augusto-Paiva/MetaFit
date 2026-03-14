import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Plus, Save, Sparkles, Target, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAppDataContext } from '@/contexts/AppDataContext';
import { useUserContext } from '../contexts/UserContext';
import { FoodItem, UserGoal, supabase } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ActiveTab = 'goals' | 'aiDiet' | 'nutritionist';
type PreferenceBucket = 'protein' | 'carb' | 'fat';

type GoalsFormState = {
  objective: UserGoal;
  currentWeight: string;
  targetDelta: string;
  proteinGrams: string;
  carbGrams: string;
  fatGrams: string;
};

type GeneratedDietItem = {
  foodId: string;
  foodName: string;
  grams: number;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
  bucket: PreferenceBucket;
};

type ManualDietItem = {
  id: string;
  food: FoodItem;
  grams: number;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  food_id: string;
  quantidade_gramas?: number;
  grams?: number;
  food_database?: FoodItem | FoodItem[];
};

type DietTemplate = {
  id: string;
  name: string;
  created_at: string;
  items: Array<{ foodId: string; grams: number; food?: FoodItem }>;
};

const BUCKET_LIMIT: Record<PreferenceBucket, number> = {
  protein: 3,
  carb: 3,
  fat: 2,
};

const BUCKET_LABEL_PT: Record<PreferenceBucket, string> = {
  protein: 'Proteinas Preferidas',
  carb: 'Carboidratos Preferidos',
  fat: 'Gorduras Preferidas',
};

function format2(value: number): string {
  return Number(value || 0).toFixed(2);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function calculateCaloriesFromMacros(protein: number, carbs: number, fats: number): number {
  return round2((protein * 4) + (carbs * 4) + (fats * 9));
}

function distributeByMacro(foods: FoodItem[], targetMacro: number, macroPerGram: (food: FoodItem) => number): number[] {
  if (!foods.length || targetMacro <= 0) {
    return foods.map(() => 0);
  }

  const macroShare = targetMacro / foods.length;
  return foods.map((food) => {
    const valuePerGram = macroPerGram(food);
    if (!Number.isFinite(valuePerGram) || valuePerGram <= 0) {
      return 0;
    }
    return round2(macroShare / valuePerGram);
  });
}

function generateDietGreedy(params: {
  proteins: FoodItem[];
  carbs: FoodItem[];
  fats: FoodItem[];
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
  calorieTarget: number;
}): GeneratedDietItem[] {
  const items: GeneratedDietItem[] = [];

  const proteinGrams = distributeByMacro(params.proteins, params.proteinTarget, (food) => food.proteinas_g);
  params.proteins.forEach((food, index) => {
    const grams = proteinGrams[index];
    items.push({
      foodId: food.id,
      foodName: food.nome,
      grams,
      protein: round2(food.proteinas_g * grams),
      carbs: round2(food.carbos_g * grams),
      fats: round2(food.gorduras_g * grams),
      calories: round2(food.calorias_g * grams),
      bucket: 'protein',
    });
  });

  const fatGrams = distributeByMacro(params.fats, params.fatTarget, (food) => food.gorduras_g);
  params.fats.forEach((food, index) => {
    const grams = fatGrams[index];
    items.push({
      foodId: food.id,
      foodName: food.nome,
      grams,
      protein: round2(food.proteinas_g * grams),
      carbs: round2(food.carbos_g * grams),
      fats: round2(food.gorduras_g * grams),
      calories: round2(food.calorias_g * grams),
      bucket: 'fat',
    });
  });

  const caloriesFromProteinAndFat = items.reduce((acc, item) => acc + item.calories, 0);
  const remainingCalories = Math.max(0, params.calorieTarget - caloriesFromProteinAndFat);
  const carbGoalFromRemainingCalories = remainingCalories / 4;
  const effectiveCarbTarget = Math.max(params.carbTarget, carbGoalFromRemainingCalories);

  const carbGrams = distributeByMacro(params.carbs, effectiveCarbTarget, (food) => food.carbos_g);
  params.carbs.forEach((food, index) => {
    const grams = carbGrams[index];
    items.push({
      foodId: food.id,
      foodName: food.nome,
      grams,
      protein: round2(food.proteinas_g * grams),
      carbs: round2(food.carbos_g * grams),
      fats: round2(food.gorduras_g * grams),
      calories: round2(food.calorias_g * grams),
      bucket: 'carb',
    });
  });

  return items.filter((item) => item.grams > 0);
}

function buildMealHour(index: number): string {
  const hours = ['07:30', '12:30', '16:30', '20:00'];
  return hours[index % hours.length];
}

function SubTabButton(props: {
  tab: ActiveTab;
  activeTab: ActiveTab;
  label: string;
  onClick: (tab: ActiveTab) => void;
}) {
  const { tab, activeTab, label, onClick } = props;
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function PreferenceSelector(props: {
  bucket: PreferenceBucket;
  selectedFoods: FoodItem[];
  onRemove: (foodId: string) => void;
  onOpenSearch: (bucket: PreferenceBucket) => void;
}) {
  const { bucket, selectedFoods, onRemove, onOpenSearch } = props;
  const limit = BUCKET_LIMIT[bucket];

  return (
    <div className="space-y-2 rounded-lg border border-border/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{BUCKET_LABEL_PT[bucket]}</p>
        <Button size="sm" variant="secondary" onClick={() => onOpenSearch(bucket)} disabled={selectedFoods.length >= limit}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Selecionados: {selectedFoods.length}/{limit}</p>
      {selectedFoods.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum alimento selecionado.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedFoods.map((food) => (
            <button
              key={`${bucket}-${food.id}`}
              type="button"
              onClick={() => onRemove(food.id)}
              className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
            >
              {food.nome} x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Diet = () => {
  const { user } = useAuthContext();
  const { profile, updateUserProfile, updateWeightAndTrack } = useUserContext();
  const { addMealsBatch } = useAppDataContext();

  const [activeTab, setActiveTab] = useState<ActiveTab>('goals');

  const [goalsForm, setGoalsForm] = useState<GoalsFormState>({
    objective: 'manutencao',
    currentWeight: '',
    targetDelta: '300',
    proteinGrams: '',
    carbGrams: '',
    fatGrams: '',
  });
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  const [preferredFoods, setPreferredFoods] = useState<Record<PreferenceBucket, FoodItem[]>>({
    protein: [],
    carb: [],
    fat: [],
  });
  const [activeBucket, setActiveBucket] = useState<PreferenceBucket | null>(null);
  const [generatedDiet, setGeneratedDiet] = useState<GeneratedDietItem[]>([]);
  const [isGeneratingDiet, setIsGeneratingDiet] = useState(false);
  const [isSavingAiTemplate, setIsSavingAiTemplate] = useState(false);

  const [manualItems, setManualItems] = useState<ManualDietItem[]>([]);
  const [isSavingManualTemplate, setIsSavingManualTemplate] = useState(false);
  const [templates, setTemplates] = useState<DietTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  const preferenceSearch = useFoodSearch({ userId: user?.id });
  const manualSearch = useFoodSearch({ userId: user?.id });

  useEffect(() => {
    if (!profile) return;
    setGoalsForm({
      objective: profile.objetivo,
      currentWeight: String(profile.peso || ''),
      targetDelta: String(profile.alteracao_calorica_alvo || 300),
      proteinGrams: String(profile.proteinas_meta || ''),
      carbGrams: String(profile.carbos_meta || ''),
      fatGrams: String(profile.gorduras_meta || ''),
    });
  }, [profile]);

  const parsedProtein = Number(goalsForm.proteinGrams);
  const parsedCarbs = Number(goalsForm.carbGrams);
  const parsedFats = Number(goalsForm.fatGrams);

  const caloriesLocked = useMemo(() => {
    if (!Number.isFinite(parsedProtein) || parsedProtein < 0) return 0;
    if (!Number.isFinite(parsedCarbs) || parsedCarbs < 0) return 0;
    if (!Number.isFinite(parsedFats) || parsedFats < 0) return 0;
    return calculateCaloriesFromMacros(parsedProtein, parsedCarbs, parsedFats);
  }, [parsedProtein, parsedCarbs, parsedFats]);

  const aiTotals = useMemo(() => {
    return generatedDiet.reduce(
      (acc, item) => {
        acc.calories += item.calories;
        acc.protein += item.protein;
        acc.carbs += item.carbs;
        acc.fats += item.fats;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [generatedDiet]);

  const manualTotals = useMemo(() => {
    return manualItems.reduce(
      (acc, item) => {
        acc.calories += item.food.calorias_g * item.grams;
        acc.protein += item.food.proteinas_g * item.grams;
        acc.carbs += item.food.carbos_g * item.grams;
        acc.fats += item.food.gorduras_g * item.grams;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [manualItems]);

  const targetTotals = useMemo(() => {
    return {
      calories: Number(profile?.calorias_meta || 0),
      protein: Number(profile?.proteinas_meta || 0),
      carbs: Number(profile?.carbos_meta || 0),
      fats: Number(profile?.gorduras_meta || 0),
    };
  }, [profile?.calorias_meta, profile?.proteinas_meta, profile?.carbos_meta, profile?.gorduras_meta]);

  const loadTemplates = useCallback(async () => {
    if (!user?.id) {
      setTemplates([]);
      return;
    }

    setIsLoadingTemplates(true);
    try {
      const { data: templateRows, error: templateError } = await supabase
        .from('diet_templates')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (templateError) throw templateError;

      const templateIds = (templateRows || []).map((row) => row.id as string);
      if (!templateIds.length) {
        setTemplates([]);
        return;
      }

      const { data: itemRows, error: itemError } = await supabase
        .from('diet_template_items')
        .select('id, template_id, food_id, quantidade_gramas, grams, food_database(*)')
        .in('template_id', templateIds);

      if (itemError) throw itemError;

      const itemsByTemplate = new Map<string, DietTemplate['items']>();
      ((itemRows || []) as TemplateItemRow[]).forEach((row) => {
        const grams = Number(row.quantidade_gramas ?? row.grams ?? 0);
        const foodRelation = Array.isArray(row.food_database) ? row.food_database[0] : row.food_database;
        if (!itemsByTemplate.has(row.template_id)) {
          itemsByTemplate.set(row.template_id, []);
        }
        itemsByTemplate.get(row.template_id)?.push({
          foodId: row.food_id,
          grams,
          food: foodRelation,
        });
      });

      const mappedTemplates: DietTemplate[] = (templateRows || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || 'Template sem nome'),
        created_at: String(row.created_at || new Date().toISOString()),
        items: itemsByTemplate.get(String(row.id)) || [],
      }));

      setTemplates(mappedTemplates);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar templates', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const saveTemplate = async (templateName: string, items: Array<{ foodId: string; grams: number }>) => {
    if (!user?.id) return;

    const { data: templateRow, error: templateError } = await supabase
      .from('diet_templates')
      .insert({ user_id: user.id, name: templateName })
      .select('id')
      .single();

    if (templateError) throw templateError;

    const templateId = String(templateRow.id);
    const itemRows = items.map((item) => ({
      template_id: templateId,
      food_id: item.foodId,
      quantidade_gramas: round2(item.grams),
    }));

    const { error: itemsError } = await supabase.from('diet_template_items').insert(itemRows);
    if (itemsError) throw itemsError;
  };

  const handleSaveGoals = async () => {
    if (!profile) return;

    const parsedWeight = Number(goalsForm.currentWeight);
    const parsedDelta = Number(goalsForm.targetDelta);

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      toast.error('Peso atual invalido', {
        description: 'Informe um peso maior que zero.',
      });
      return;
    }

    if (!Number.isFinite(parsedDelta) || parsedDelta < 0) {
      toast.error('Ajuste calorico invalido', {
        description: 'Informe um valor maior ou igual a zero.',
      });
      return;
    }

    if (caloriesLocked <= 0) {
      toast.error('Macros invalidos', {
        description: 'Informe macros validos para calcular as calorias automaticamente.',
      });
      return;
    }

    setIsSavingGoals(true);
    try {
      const roundedWeight = round2(parsedWeight);
      const weightChanged = Number(profile.peso || 0) !== roundedWeight;

      if (weightChanged) {
        await updateWeightAndTrack(roundedWeight);
      }

      await updateUserProfile({
        ...(weightChanged ? {} : { peso: roundedWeight }),
        objetivo: goalsForm.objective,
        alteracao_calorica_alvo: round2(parsedDelta),
        proteinas_meta: round2(parsedProtein),
        carbos_meta: round2(parsedCarbs),
        gorduras_meta: round2(parsedFats),
        calorias_meta: caloriesLocked,
      });

      toast.success('Metas salvas com sucesso');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar metas', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSavingGoals(false);
    }
  };

  const openPreferenceSearch = (bucket: PreferenceBucket) => {
    setActiveBucket(bucket);
    preferenceSearch.clearSearch();
  };

  const closePreferenceSearch = () => {
    setActiveBucket(null);
    preferenceSearch.clearSearch();
  };

  const addFoodToBucket = (bucket: PreferenceBucket, food: FoodItem) => {
    setPreferredFoods((prev) => {
      if (prev[bucket].some((item) => item.id === food.id)) return prev;
      if (prev[bucket].length >= BUCKET_LIMIT[bucket]) return prev;
      return { ...prev, [bucket]: [...prev[bucket], food] };
    });
  };

  const removeFoodFromBucket = (bucket: PreferenceBucket, foodId: string) => {
    setPreferredFoods((prev) => ({
      ...prev,
      [bucket]: prev[bucket].filter((food) => food.id !== foodId),
    }));
  };

  const handleGenerateDiet = async () => {
    const proteinTarget = Number(profile?.proteinas_meta || 0);
    const carbTarget = Number(profile?.carbos_meta || 0);
    const fatTarget = Number(profile?.gorduras_meta || 0);
    const calorieTarget = Number(profile?.calorias_meta || 0);

    if (proteinTarget <= 0 || carbTarget <= 0 || fatTarget <= 0 || calorieTarget <= 0) {
      toast.error('Metas nao configuradas', {
        description: 'Defina as metas na aba Metas antes de gerar a dieta IA.',
      });
      return;
    }

    if (!preferredFoods.protein.length || !preferredFoods.carb.length || !preferredFoods.fat.length) {
      toast.error('Selecione os alimentos base', {
        description: 'Escolha pelo menos 1 proteina, 1 carboidrato e 1 gordura.',
      });
      return;
    }

    setIsGeneratingDiet(true);
    try {
      const generated = generateDietGreedy({
        proteins: preferredFoods.protein,
        carbs: preferredFoods.carb,
        fats: preferredFoods.fat,
        proteinTarget,
        carbTarget,
        fatTarget,
        calorieTarget,
      });

      setGeneratedDiet(generated);
      toast.success('Dieta IA gerada com sucesso');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar dieta IA', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsGeneratingDiet(false);
    }
  };

  const handleSaveAiTemplate = async () => {
    if (!generatedDiet.length) {
      toast.error('Gere uma dieta IA antes de salvar template');
      return;
    }

    const templateName = window.prompt('Nome do template', 'Dieta IA A');
    if (!templateName || !templateName.trim()) return;

    setIsSavingAiTemplate(true);
    try {
      await saveTemplate(
        templateName.trim(),
        generatedDiet.map((item) => ({ foodId: item.foodId, grams: item.grams }))
      );

      toast.success('Template da Dieta IA salvo com sucesso');
      await loadTemplates();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar template da Dieta IA', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSavingAiTemplate(false);
    }
  };

  const addManualFood = (food: FoodItem) => {
    setManualItems((prev) => {
      if (prev.some((item) => item.food.id === food.id)) return prev;
      return [...prev, { id: crypto.randomUUID(), food, grams: 100 }];
    });
    manualSearch.clearSearch();
  };

  const updateManualGrams = (id: string, grams: string) => {
    const parsed = Number(grams);
    setManualItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        grams: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      };
    }));
  };

  const removeManualItem = (id: string) => {
    setManualItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveManualTemplate = async () => {
    if (!manualItems.length) {
      toast.error('Adicione alimentos no plano do nutricionista');
      return;
    }

    const templateName = window.prompt('Nome do template', 'Plano Nutricionista A');
    if (!templateName || !templateName.trim()) return;

    setIsSavingManualTemplate(true);
    try {
      await saveTemplate(
        templateName.trim(),
        manualItems.map((item) => ({ foodId: item.food.id, grams: item.grams }))
      );

      toast.success('Template do nutricionista salvo com sucesso');
      await loadTemplates();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar template do nutricionista', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setIsSavingManualTemplate(false);
    }
  };

  const handleApplyTemplateToToday = async (template: DietTemplate) => {
    if (!template.items.length) {
      toast.error('Template sem itens');
      return;
    }

    setApplyingTemplateId(template.id);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      await addMealsBatch({
        date: today,
        items: template.items.map((item, index) => ({
          foodId: item.foodId,
          quantidadeGramas: round2(item.grams),
          hora: buildMealHour(index),
        })),
      });

      toast.success('Template aplicado em hoje');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao aplicar template', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      });
    } finally {
      setApplyingTemplateId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Plano de Dieta</h2>
        <div className="text-right text-xs text-muted-foreground">
          <p>Metas atuais</p>
          <p>P {format2(targetTotals.protein)} | C {format2(targetTotals.carbs)} | G {format2(targetTotals.fats)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SubTabButton tab="goals" activeTab={activeTab} label="Metas" onClick={setActiveTab} />
        <SubTabButton tab="aiDiet" activeTab={activeTab} label="Dieta IA" onClick={setActiveTab} />
        <SubTabButton tab="nutritionist" activeTab={activeTab} label="Nutricionista" onClick={setActiveTab} />
      </div>

      {activeTab === 'goals' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Metas e Macros</CardTitle>
            <CardDescription>Defina objetivo, peso e macros. As calorias totais ficam travadas pela formula termodinamica.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Objetivo</label>
              <Select value={goalsForm.objective} onValueChange={(value: UserGoal) => setGoalsForm((prev) => ({ ...prev, objective: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="perda">Perder gordura</SelectItem>
                  <SelectItem value="ganho">Ganhar massa</SelectItem>
                  <SelectItem value="manutencao">Manutencao</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Peso atual (kg)</label>
                <Input
                  type="number"
                  value={goalsForm.currentWeight}
                  onChange={(event) => setGoalsForm((prev) => ({ ...prev, currentWeight: event.target.value }))}
                  placeholder="Ex: 78.5"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Deficit/Superavit alvo (kcal)</label>
                <Input
                  type="number"
                  value={goalsForm.targetDelta}
                  onChange={(event) => setGoalsForm((prev) => ({ ...prev, targetDelta: event.target.value }))}
                  placeholder="Ex: 300"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Proteina (g)</label>
                <Input
                  type="number"
                  value={goalsForm.proteinGrams}
                  onChange={(event) => setGoalsForm((prev) => ({ ...prev, proteinGrams: event.target.value }))}
                  placeholder="Ex: 160"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Carboidrato (g)</label>
                <Input
                  type="number"
                  value={goalsForm.carbGrams}
                  onChange={(event) => setGoalsForm((prev) => ({ ...prev, carbGrams: event.target.value }))}
                  placeholder="Ex: 220"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gordura (g)</label>
                <Input
                  type="number"
                  value={goalsForm.fatGrams}
                  onChange={(event) => setGoalsForm((prev) => ({ ...prev, fatGrams: event.target.value }))}
                  placeholder="Ex: 70"
                />
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
              <p className="text-sm font-medium">Calorias totais (travadas pela formula)</p>
              <p className="font-mono text-xl">{format2(caloriesLocked)} kcal</p>
              <p className="text-xs text-muted-foreground">Calorias = (Proteinas x 4) + (Carboidratos x 4) + (Gorduras x 9)</p>
            </div>

            <Button onClick={() => void handleSaveGoals()} disabled={isSavingGoals} className="w-full">
              {isSavingGoals ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando metas...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar metas
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'aiDiet' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Dieta IA</CardTitle>
            <CardDescription>Selecione alimentos base e gere a dieta conforme as metas da aba Metas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PreferenceSelector
              bucket="protein"
              selectedFoods={preferredFoods.protein}
              onRemove={(foodId) => removeFoodFromBucket('protein', foodId)}
              onOpenSearch={openPreferenceSearch}
            />
            <PreferenceSelector
              bucket="carb"
              selectedFoods={preferredFoods.carb}
              onRemove={(foodId) => removeFoodFromBucket('carb', foodId)}
              onOpenSearch={openPreferenceSearch}
            />
            <PreferenceSelector
              bucket="fat"
              selectedFoods={preferredFoods.fat}
              onRemove={(foodId) => removeFoodFromBucket('fat', foodId)}
              onOpenSearch={openPreferenceSearch}
            />

            <Button onClick={() => void handleGenerateDiet()} disabled={isGeneratingDiet} className="w-full">
              {isGeneratingDiet ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando dieta IA...
                </>
              ) : (
                'Gerar Dieta IA'
              )}
            </Button>

            {generatedDiet.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">Resultado da Dieta IA</p>
                <div className="space-y-2">
                  {generatedDiet.map((item) => (
                    <div key={`${item.foodId}-${item.bucket}`} className="rounded-md bg-secondary/40 p-2 text-xs">
                      <p className="font-medium">{item.foodName}</p>
                      <p className="text-muted-foreground">
                        {format2(item.grams)} g - P:{format2(item.protein)} C:{format2(item.carbs)} G:{format2(item.fats)} - {format2(item.calories)} kcal
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-md bg-secondary/30 p-2 text-center">Kcal {format2(aiTotals.calories)}</div>
                  <div className="rounded-md bg-secondary/30 p-2 text-center">P {format2(aiTotals.protein)}</div>
                  <div className="rounded-md bg-secondary/30 p-2 text-center">C {format2(aiTotals.carbs)}</div>
                  <div className="rounded-md bg-secondary/30 p-2 text-center">G {format2(aiTotals.fats)}</div>
                </div>

                <Button onClick={() => void handleSaveAiTemplate()} disabled={isSavingAiTemplate} className="w-full">
                  {isSavingAiTemplate ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando template IA...
                    </>
                  ) : (
                    'Salvar Template'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'nutritionist' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" /> Dieta do Nutricionista</CardTitle>
              <CardDescription>Monte um plano manual com busca de alimentos e gramas exatas por item.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar alimento</label>
                <Input
                  value={manualSearch.searchTerm}
                  onChange={(event) => manualSearch.setSearchTerm(event.target.value)}
                  placeholder="Digite para buscar alimentos..."
                />
              </div>

              {manualSearch.loading && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {manualSearch.isEmpty && (
                <p className="text-center text-sm text-muted-foreground">Nenhum alimento encontrado.</p>
              )}

              <div className="max-h-52 space-y-1 overflow-y-auto">
                {manualSearch.foods.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => addManualFood(food)}
                    className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p className="text-sm font-medium">{food.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {format2(food.calorias_g)} kcal/g - P:{format2(food.proteinas_g)} C:{format2(food.carbos_g)} G:{format2(food.gorduras_g)}
                    </p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {manualItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item adicionado no plano manual.</p>
                ) : (
                  manualItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{item.food.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            P:{format2(item.food.proteinas_g * item.grams)} C:{format2(item.food.carbos_g * item.grams)} G:{format2(item.food.gorduras_g * item.grams)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeManualItem(item.id)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="mt-2">
                        <label className="text-xs text-muted-foreground">Quantidade (g)</label>
                        <Input
                          type="number"
                          value={String(item.grams)}
                          onChange={(event) => updateManualGrams(item.id, event.target.value)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
                <p className="mb-2 text-sm font-medium">Totais do plano manual vs metas diarias</p>
                <p>Kcal: {format2(manualTotals.calories)} / {format2(targetTotals.calories)}</p>
                <p>Proteinas: {format2(manualTotals.protein)} / {format2(targetTotals.protein)}</p>
                <p>Carboidratos: {format2(manualTotals.carbs)} / {format2(targetTotals.carbs)}</p>
                <p>Gorduras: {format2(manualTotals.fats)} / {format2(targetTotals.fats)}</p>
              </div>

              <Button onClick={() => void handleSaveManualTemplate()} disabled={isSavingManualTemplate} className="w-full">
                {isSavingManualTemplate ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando template...
                  </>
                ) : (
                  'Salvar Template'
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meus Templates</CardTitle>
              <CardDescription>Visualize templates salvos e aplique diretamente para hoje.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingTemplates ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum template salvo.</p>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.items.length} itens - {new Date(template.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleApplyTemplateToToday(template)}
                        disabled={applyingTemplateId === template.id}
                      >
                        {applyingTemplateId === template.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Aplicando...
                          </>
                        ) : (
                          'Aplicar em Hoje'
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeBucket && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Selecionar {BUCKET_LABEL_PT[activeBucket]}</h3>
              <Button variant="ghost" size="sm" onClick={closePreferenceSearch}>Fechar</Button>
            </div>

            <Input
              value={preferenceSearch.searchTerm}
              onChange={(event) => preferenceSearch.setSearchTerm(event.target.value)}
              placeholder="Buscar alimento..."
              autoFocus
            />

            {preferenceSearch.loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!preferenceSearch.loading && preferenceSearch.isEmpty && (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum alimento encontrado.</p>
            )}

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {preferenceSearch.foods.map((food) => (
                <button
                  key={`${activeBucket}-${food.id}`}
                  type="button"
                  onClick={() => {
                    addFoodToBucket(activeBucket, food);
                    closePreferenceSearch();
                  }}
                  className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-medium">{food.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {format2(food.calorias_g)} kcal/g - P:{format2(food.proteinas_g)} C:{format2(food.carbos_g)} G:{format2(food.gorduras_g)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Diet;
