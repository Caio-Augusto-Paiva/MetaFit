import { useState, useEffect } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase, Workout } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const MET_VALUES: Record<string, number> = {
  'Caminhada (6 km/h)': 5.0,
  'Corrida (10 km/h)': 9.8,
  'Musculação': 6.0,
  'Ciclismo': 7.5,
  'Natação': 8.0,
  'HIIT': 10.0,
  'Yoga': 3.0,
};

const Workouts = () => {
  const { user, profile } = useAuthContext();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [tipo, setTipo] = useState('Caminhada (6 km/h)');
  const [duracao, setDuracao] = useState('30');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) fetchWorkouts();
  }, [user, date]);

  const fetchWorkouts = async () => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user!.id)
      .eq('data', date)
      .order('created_at', { ascending: false });
    if (data) setWorkouts(data as Workout[]);
  };

  const calcCalories = (tipoExercicio: string, duracaoMin: number): number => {
    const met = MET_VALUES[tipoExercicio] || 5.0;
    const pesoKg = profile?.peso || 70;
    // MET formula: Cal = MET × peso(kg) × duração(h)
    return Math.round(met * pesoKg * (duracaoMin / 60));
  };

  const addWorkout = async () => {
    if (!user) return;
    setLoading(true);
    const calorias = calcCalories(tipo, Number(duracao));
    const { error } = await supabase.from('workouts').insert({
      user_id: user.id,
      tipo,
      duracao_min: Number(duracao),
      calorias_gastas: calorias,
      data: date,
    });
    if (!error) {
      await fetchWorkouts();
      setDuracao('30');
    }
    setLoading(false);
  };

  const deleteWorkout = async (id: string) => {
    await supabase.from('workouts').delete().eq('id', id);
    fetchWorkouts();
  };

  const previewCal = calcCalories(tipo, Number(duracao) || 0);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Gasto Calórico</h2>

      {/* Add workout form */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div>
          <label className="text-sm text-muted-foreground">Exercício</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full mt-1 bg-background/50 border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {Object.keys(MET_VALUES).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">Duração (min)</label>
            <Input type="number" value={duracao} onChange={(e) => setDuracao(e.target.value)} className="bg-background/50" />
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-xs text-muted-foreground mb-1">Gasto estimado</p>
            <p className="text-lg font-bold font-mono text-primary">{previewCal} kcal</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Cálculo: MET × {profile?.peso || '??'}kg × {Number(duracao) / 60}h
        </p>

        <Button onClick={addWorkout} disabled={loading} className="w-full glow">
          Registrar Exercício
        </Button>
      </div>

      {/* Date & list */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Registros do dia</h3>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto bg-secondary/50 text-sm"
        />
      </div>

      {workouts.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">Nenhum treino registrado</p>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <div key={w.id} className="glass rounded-lg p-3 flex items-center justify-between animate-fade-in">
              <div>
                <p className="font-medium text-sm">{w.tipo}</p>
                <p className="text-xs text-muted-foreground">
                  {w.duracao_min} min · {w.calorias_gastas} kcal
                </p>
              </div>
              <button onClick={() => deleteWorkout(w.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Workouts;
