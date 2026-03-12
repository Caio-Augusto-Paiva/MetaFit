import { useState, useEffect, useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase, FoodItem, Meal, Workout } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, X, Lightbulb, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Dashboard = () => {
  const { user, profile } = useAuthContext();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');
  const [hora, setHora] = useState(format(new Date(), 'HH:mm'));
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<FoodItem | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMeals();
    fetchWorkouts();
  }, [user, date]);

  const fetchMeals = async () => {
    const { data } = await supabase
      .from('meals')
      .select('*, food_database(*)')
      .eq('user_id', user!.id)
      .eq('data', date)
      .order('hora');
    if (data) setMeals(data as Meal[]);
  };

  const fetchWorkouts = async () => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user!.id)
      .eq('data', date);
    if (data) setWorkouts(data as Workout[]);
  };

  const searchFoods = async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setFoods([]); return; }
    const { data } = await supabase
      .from('food_database')
      .select('*')
      .ilike('nome', `%${q}%`)
      .limit(10);
    if (data) setFoods(data as FoodItem[]);
  };

  const addMeal = async () => {
    if (!selectedFood || !user) return;
    setLoading(true);
    const { error } = await supabase.from('meals').insert({
      user_id: user.id,
      food_id: selectedFood.id,
      quantidade_gramas: Number(grams),
      data: date,
      hora,
    });
    if (!error) {
      await fetchMeals();
      setShowAdd(false);
      setSelectedFood(null);
      setSearch('');
      setGrams('100');
    }
    setLoading(false);
  };

  const deleteMeal = async (id: string) => {
    await supabase.from('meals').delete().eq('id', id);
    fetchMeals();
  };

  const calcMacros = (food: FoodItem, qty: number) => {
    const factor = qty / food.porcao_g;
    return {
      cal: Math.round(food.calorias * factor),
      prot: Math.round(food.proteinas * factor * 10) / 10,
      carb: Math.round(food.carboidratos * factor * 10) / 10,
      fat: Math.round(food.gorduras * factor * 10) / 10,
    };
  };

  const dailySummary = useMemo(() => {
    let cal = 0, prot = 0, carb = 0, fat = 0;
    meals.forEach((m) => {
      if (m.food_database) {
        const macros = calcMacros(m.food_database, m.quantidade_gramas);
        cal += macros.cal;
        prot += macros.prot;
        carb += macros.carb;
        fat += macros.fat;
      }
    });
    const burned = workouts.reduce((acc, w) => acc + (w.calorias_gastas || 0), 0);
    const meta = profile?.calorias_meta || 2000;
    return { cal, prot, carb, fat, burned, meta, balance: meta - cal + burned };
  }, [meals, workouts, profile]);

  const suggestFood = async () => {
    if (meals.length === 0) return;
    const lastMeal = meals[meals.length - 1];
    if (!lastMeal.food_database) return;
    const targetCal = lastMeal.food_database.calorias;
    const { data } = await supabase
      .from('food_database')
      .select('*')
      .gte('calorias', targetCal - 30)
      .lte('calorias', targetCal + 30)
      .neq('id', lastMeal.food_id)
      .limit(1);
    if (data && data.length > 0) setSuggestion(data[0] as FoodItem);
    else setSuggestion(null);
  };

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {format(new Date(date + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto bg-secondary/50 text-sm"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Consumidas', value: `${dailySummary.cal} kcal`, color: 'text-warning' },
          { label: 'Gastas', value: `${dailySummary.burned} kcal`, color: 'text-primary' },
          { label: 'Meta', value: `${dailySummary.meta} kcal`, color: 'text-muted-foreground' },
          { label: 'Saldo', value: `${dailySummary.balance} kcal`, color: dailySummary.balance >= 0 ? 'text-primary' : 'text-destructive' },
        ].map((s) => (
          <div key={s.label} className="glass rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Macros bar */}
      <div className="glass rounded-lg p-3 flex justify-around text-center text-xs">
        <div><span className="text-muted-foreground">Proteínas</span><p className="font-bold font-mono">{dailySummary.prot}g</p></div>
        <div><span className="text-muted-foreground">Carboidratos</span><p className="font-bold font-mono">{dailySummary.carb}g</p></div>
        <div><span className="text-muted-foreground">Gorduras</span><p className="font-bold font-mono">{dailySummary.fat}g</p></div>
      </div>

      {/* Meals list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Refeições</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={suggestFood} title="Sugerir alimento">
              <Lightbulb className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        {suggestion && (
          <div className="glass rounded-lg p-3 border-primary/30 border animate-fade-in flex items-center justify-between">
            <div>
              <p className="text-xs text-primary font-medium">💡 Sugestão com macros similares</p>
              <p className="font-medium text-sm">{suggestion.nome}</p>
              <p className="text-xs text-muted-foreground">{suggestion.calorias} kcal | P:{suggestion.proteinas}g C:{suggestion.carboidratos}g G:{suggestion.gorduras}g</p>
            </div>
            <button onClick={() => setSuggestion(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        )}

        {meals.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhuma refeição registrada</p>
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
                    {meal.quantidade_gramas}g · {macros.cal} kcal · P:{macros.prot}g C:{macros.carb}g G:{macros.fat}g
                  </p>
                </div>
                <button onClick={() => deleteMeal(meal.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add meal modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="glass rounded-xl p-5 w-full max-w-md space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Adicionar Alimento</h3>
              <button onClick={() => { setShowAdd(false); setSelectedFood(null); setSearch(''); }}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {!selectedFood ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => searchFoods(e.target.value)}
                    placeholder="Buscar alimento..."
                    className="pl-9 bg-background/50"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {foods.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFood(f)}
                      className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <p className="font-medium text-sm">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.calorias} kcal / {f.porcao_g}g · P:{f.proteinas}g C:{f.carboidratos}g G:{f.gorduras}g
                      </p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="glass rounded-lg p-3">
                  <p className="font-medium">{selectedFood.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFood.calorias} kcal / {selectedFood.porcao_g}g
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Quantidade (g)</label>
                    <Input type="number" value={grams} onChange={(e) => setGrams(e.target.value)} className="bg-background/50" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Horário</label>
                    <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="bg-background/50" />
                  </div>
                </div>
                {grams && (
                  <div className="text-sm text-muted-foreground">
                    {(() => { const m = calcMacros(selectedFood, Number(grams)); return `${m.cal} kcal · P:${m.prot}g C:${m.carb}g G:${m.fat}g`; })()}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setSelectedFood(null)} className="flex-1">Voltar</Button>
                  <Button onClick={addMeal} disabled={loading} className="flex-1 glow">Registrar</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
