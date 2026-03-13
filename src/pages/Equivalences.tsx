import { useMemo, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { FoodItem } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

const Equivalences = () => {
  const { user } = useAuthContext();
  const [sourceFood, setSourceFood] = useState<FoodItem | null>(null);
  const [targetFood, setTargetFood] = useState<FoodItem | null>(null);
  const [sourceGramsInput, setSourceGramsInput] = useState('100');

  const sourceSearch = useFoodSearch({ userId: user?.id });
  const targetSearch = useFoodSearch({ userId: user?.id });

  const sourceGrams = Number(sourceGramsInput);

  const result = useMemo(() => {
    if (!sourceFood || !targetFood) return null;
    if (!Number.isFinite(sourceGrams) || sourceGrams <= 0) return null;
    if (!Number.isFinite(targetFood.calorias_g) || targetFood.calorias_g <= 0) return null;

    return calculateEquivalence(sourceFood, sourceGrams, targetFood);
  }, [sourceFood, targetFood, sourceGrams]);

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
            Para substituir {fmt2(sourceGrams)}g de {sourceFood.nome} ({fmt2(result.sourceCalories)} kcal), voce precisa de {fmt2(result.targetGrams)}g de {targetFood.nome} ({fmt2(result.targetCalories)} kcal).
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                      {row.delta >= 0 ? '+' : ''}{fmt2(row.delta)}g
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
