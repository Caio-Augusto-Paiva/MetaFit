import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useAppDataContext } from '@/contexts/AppDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

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
  const { getDailyData, ensureDateLoaded, addWorkout: addWorkoutEntry, deleteWorkout: deleteWorkoutEntry } = useAppDataContext();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tipo, setTipo] = useState('Caminhada (6 km/h)');
  const [duracao, setDuracao] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void ensureDateLoaded(date);
  }, [user, date, ensureDateLoaded]);

  const { workouts, loadingWorkouts } = useMemo(() => getDailyData(date), [getDailyData, date]);

  const calcCalories = (tipoExercicio: string, duracaoMin: number): number => {
    const met = MET_VALUES[tipoExercicio] || 5.0;
    const pesoKg = profile?.peso || 70;
    // MET formula: Cal = MET × peso(kg) × duração(h)
    return Math.round(met * pesoKg * (duracaoMin / 60));
  };

  const addWorkout = async () => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const duracaoMin = Number(duracao);
      if (!Number.isFinite(duracaoMin) || duracaoMin <= 0) {
        throw new Error('Informe uma duracao valida em minutos');
      }

      const calorias = calcCalories(tipo, duracaoMin);
      await addWorkoutEntry({
        date,
        tipo,
        duracaoMin,
        caloriasGastas: calorias,
      });

      setDuracao('30');
      toast.success('Exercicio registrado com sucesso');
    } catch (err) {
      console.log('Erro detalhado no insert de workout:', err, {
        payload: {
          user_id: user?.id,
          data: date,
          tipo_atividade: tipo,
          duracao_minutos: Number(duracao),
          calorias_gastas: calcCalories(tipo, Number(duracao) || 0),
        },
      });
      toast.error('Falha ao registrar exercicio', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      await deleteWorkoutEntry({ date, workoutId: id });
      toast.success('Treino removido');
    } catch (err) {
      toast.error('Falha ao remover treino', {
        description: err instanceof Error ? err.message : 'Tente novamente em instantes',
      });
    }
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

        <Button onClick={addWorkout} disabled={isSubmitting} className="w-full glow">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Registrando...
            </>
          ) : (
            'Registrar Exercício'
          )}
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

      {loadingWorkouts ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : workouts.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">Nenhum treino registrado</p>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <div key={w.id} className="glass rounded-lg p-3 flex items-center justify-between animate-fade-in">
              <div>
                <p className="font-medium text-sm">{w.tipo || w.tipo_atividade}</p>
                <p className="text-xs text-muted-foreground">
                  {w.duracao_min ?? w.duracao_minutos} min · {w.calorias_gastas} kcal
                </p>
              </div>
              <button onClick={() => handleDeleteWorkout(w.id)} className="text-muted-foreground hover:text-destructive transition-colors">
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
