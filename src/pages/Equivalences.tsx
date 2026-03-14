import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { FoodItem, supabase } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function fmt2(value: number) {
  return Number(value || 0).toFixed(2);
}

type EquivalenceResult = {
  sourceCalories: number;
  targetGrams: number;
  targetCalories: number;
  sourceMacros: { prot: number; carb: number; fat: number };
  targetMacros: { prot: number; carb: number; fat: number };
  delta: { prot: number; carb: number; fat: number };
};

function calculateEquivalence(source: FoodItem, sourceGrams: number, target: FoodItem): EquivalenceResult {
  const sourceCalories = source.calorias_g * sourceGrams;
  const targetGrams = sourceCalories / target.calorias_g;

  const sourceMacros = {
    prot: source.proteinas_g * sourceGrams,
    carb: source.carbos_g * sourceGrams,
    fat: source.gorduras_g * sourceGrams,
  };

  const targetMacros = {
    prot: target.proteinas_g * targetGrams,
    carb: target.carbos_g * targetGrams,
    fat: target.gorduras_g * targetGrams,
  };

  return {
    sourceCalories,
    targetGrams,
    targetCalories: target.calorias_g * targetGrams,
    sourceMacros,
    targetMacros,
    delta: {
      prot: targetMacros.prot - sourceMacros.prot,
      carb: targetMacros.carb - sourceMacros.carb,
      fat: targetMacros.fat - sourceMacros.fat,
    },
  };
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${fmt2(value)}g`;
}

type MacroField = 'proteinas_g' | 'carbos_g' | 'gorduras_g';

function getDominantMacro(food: FoodItem): MacroField {
  const macroEntries: Array<{ key: MacroField; value: number }> = [
    { key: 'proteinas_g', value: food.proteinas_g },
    { key: 'carbos_g', value: food.carbos_g },
    { key: 'gorduras_g', value: food.gorduras_g },
  ];

  macroEntries.sort((a, b) => b.value - a.value);
  return macroEntries[0].key;
}

function shuffleList<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const Equivalences = () => {
  const { user } = useAuthContext();
  const [sourceFood, setSourceFood] = useState<FoodItem | null>(null);
  const [targetFood, setTargetFood] = useState<FoodItem | null>(null);
  const [sourceGramsInput, setSourceGramsInput] = useState('100');
  const [quickSuggestions, setQuickSuggestions] = useState<FoodItem[]>([]);
  const [loadingQuickSuggestions, setLoadingQuickSuggestions] = useState(false);

  const sourceSearch = useFoodSearch({ userId: user?.id });
  const targetSearch = useFoodSearch({ userId: user?.id });

  const sourceGrams = Number(sourceGramsInput);

  const result = useMemo(() => {
    if (!sourceFood || !targetFood) return null;
    if (!Number.isFinite(sourceGrams) || sourceGrams <= 0) return null;
    if (!Number.isFinite(targetFood.calorias_g) || targetFood.calorias_g <= 0) return null;

    return calculateEquivalence(sourceFood, sourceGrams, targetFood);
  }, [sourceFood, targetFood, sourceGrams]);

  useEffect(() => {
    let cancelled = false;

    const loadQuickSuggestions = async () => {
      if (!sourceFood) {
        setQuickSuggestions([]);
        setLoadingQuickSuggestions(false);
        return;
      }

      setLoadingQuickSuggestions(true);
      try {
        const dominantMacro = getDominantMacro(sourceFood);

        let query = supabase
          .from('food_database')
          .select('*')
          .neq('id', sourceFood.id)
          .gt(dominantMacro, 0)
          .order(dominantMacro, { ascending: false })
          .limit(24);

        if (user?.id) {
          query = query.or(`user_id.is.null,user_id.eq.${user.id}`);
        } else {
          query = query.is('user_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (cancelled) return;

        const randomized = shuffleList((data || []) as FoodItem[]).slice(0, 3);
        setQuickSuggestions(randomized);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setQuickSuggestions([]);
          toast.error('Erro ao carregar sugestoes rapidas', {
            description: error instanceof Error ? error.message : 'Tente novamente em instantes',
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingQuickSuggestions(false);
        }
      }
    };

    void loadQuickSuggestions();

    return () => {
      cancelled = true;
    };
  }, [sourceFood, user?.id]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Equivalencias Alimentares</h2>

      <div className="glass rounded-xl p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Alimento de origem</p>

        {!sourceFood ? (
          <>
            <Input
              value={sourceSearch.searchTerm}
              onChange={(e) => sourceSearch.setSearchTerm(e.target.value)}
              placeholder="Buscar alimento de origem..."
            />

            {sourceSearch.loading && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {sourceSearch.isEmpty && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhum alimento encontrado</p>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1">
              {sourceSearch.foods.map((food) => (
                <button
                  key={food.id}
                  onClick={() => setSourceFood(food)}
                  className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <p className="font-medium text-sm">{food.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt2(food.calorias_g)} kcal/g · P:{fmt2(food.proteinas_g)} C:{fmt2(food.carbos_g)} G:{fmt2(food.gorduras_g)}
                  </p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="glass rounded-lg p-3">
              <p className="font-medium text-sm">{sourceFood.nome}</p>
              <p className="text-xs text-muted-foreground">{fmt2(sourceFood.calorias_g)} kcal/g</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Quick suggestions (mesmo macro dominante)</p>
              {loadingQuickSuggestions ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Carregando sugestoes...
                </div>
              ) : quickSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {quickSuggestions.map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => setTargetFood(food)}
                      className="px-2.5 py-1 rounded-full text-xs border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      {food.nome}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma sugestao rapida encontrada.</p>
              )}
            </div>

            <Button variant="secondary" onClick={() => setSourceFood(null)} className="w-full">
              Trocar alimento de origem
            </Button>
          </div>
        )}

        <div>
          <label className="text-sm text-muted-foreground">Quantidade consumida (g)</label>
          <Input type="number" value={sourceGramsInput} onChange={(e) => setSourceGramsInput(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="flex justify-center">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <ArrowRightLeft className="w-5 h-5" />
        </div>
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Alimento de destino</p>

        {!targetFood ? (
          <>
            <Input
              value={targetSearch.searchTerm}
              onChange={(e) => targetSearch.setSearchTerm(e.target.value)}
              placeholder="Buscar alimento de destino..."
            />

            {targetSearch.loading && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {targetSearch.isEmpty && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhum alimento encontrado</p>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1">
              {targetSearch.foods.map((food) => (
                <button
                  key={food.id}
                  onClick={() => setTargetFood(food)}
                  className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <p className="font-medium text-sm">{food.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt2(food.calorias_g)} kcal/g · P:{fmt2(food.proteinas_g)} C:{fmt2(food.carbos_g)} G:{fmt2(food.gorduras_g)}
                  </p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="glass rounded-lg p-3">
              <p className="font-medium text-sm">{targetFood.nome}</p>
              <p className="text-xs text-muted-foreground">{fmt2(targetFood.calorias_g)} kcal/g</p>
            </div>
            <Button variant="secondary" onClick={() => setTargetFood(null)} className="w-full">
              Trocar alimento de destino
            </Button>
          </div>
        )}
      </div>

      {result && sourceFood && targetFood && (
        <div className="glass rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium">
            Para substituir {fmt2(sourceGrams)}g de {sourceFood.nome}, consuma {fmt2(result.targetGrams)}g de {targetFood.nome}.
          </p>

          <p className="text-xs text-muted-foreground">
            Calorias totais = {fmt2(sourceFood.calorias_g)} x {fmt2(sourceGrams)} = {fmt2(result.sourceCalories)} kcal | Gramas destino = {fmt2(result.sourceCalories)} / {fmt2(targetFood.calorias_g)} = {fmt2(result.targetGrams)}g
          </p>

          <p className="text-xs">
            Impacto da troca: Carbo {formatDelta(result.delta.carb)} | Proteina {formatDelta(result.delta.prot)} | Gordura {formatDelta(result.delta.fat)}
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Macro</th>
                  <th className="py-2">Origem</th>
                  <th className="py-2">Destino</th>
                  <th className="py-2">Diferenca</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'Proteina', o: result.sourceMacros.prot, d: result.targetMacros.prot, delta: result.delta.prot },
                  { key: 'Carboidrato', o: result.sourceMacros.carb, d: result.targetMacros.carb, delta: result.delta.carb },
                  { key: 'Gordura', o: result.sourceMacros.fat, d: result.targetMacros.fat, delta: result.delta.fat },
                ].map((row) => (
                  <tr key={row.key} className="border-t border-border/60">
                    <td className="py-2">{row.key}</td>
                    <td className="py-2">{fmt2(row.o)}g</td>
                    <td className="py-2">{fmt2(row.d)}g</td>
                    <td className={`py-2 ${row.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatDelta(row.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Equivalences;
