import { useMemo } from 'react';
import { addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useUserContext } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

function fmt2(value: number): string {
  return Number(value || 0).toFixed(2);
}

type ChartPoint = {
  date: string;
  real: number | null;
  proj3m: number | null;
  proj6m: number | null;
};

function getActivityFactor(profile: { treina_atualmente?: boolean | null }): number {
  return profile.treina_atualmente ? 1.5 : 1.2;
}

function simulateHarrisBenedictProjection(params: {
  startWeight: number;
  startDate: Date;
  months: 3 | 6;
  caloriasMeta: number;
  objetivo: 'perda' | 'ganho' | 'manutencao';
  tmbBase: number;
  activityFactor: number;
}): Array<{ date: string; peso: number }> {
  const points: Array<{ date: string; peso: number }> = [];
  const totalDays = params.months * 30;

  let simulatedWeight = params.startWeight;
  let adaptationMultiplier = 1;

  for (let day = 0; day <= totalDays; day += 1) {
    const currentDate = new Date(params.startDate);
    currentDate.setDate(currentDate.getDate() + day);

    if (day > 0) {
      if (day % 90 === 0) {
        // Adaptacao metabolica trimestral de 4% para reduzir a velocidade da perda.
        adaptationMultiplier *= 0.96;
      }

      const currentTmb = params.tmbBase * (simulatedWeight / Math.max(params.startWeight, 1));
      const currentTdee = currentTmb * params.activityFactor;

      if (params.objetivo === 'perda') {
        const deficit = Math.max(currentTdee - params.caloriasMeta, 0);
        const deltaKg = (deficit / 7700) * adaptationMultiplier;
        simulatedWeight = Math.max(35, simulatedWeight - deltaKg);
      } else if (params.objetivo === 'ganho') {
        const surplus = Math.max(params.caloriasMeta - currentTdee, 0);
        const deltaKg = (surplus / 7700) * 0.85;
        simulatedWeight += deltaKg;
      }
    }

    if (day % 30 === 0) {
      points.push({
        date: currentDate.toISOString(),
        peso: Number(simulatedWeight.toFixed(2)),
      });
    }
  }

  return points;
}

const chartConfig = {
  real: {
    label: 'Historico real',
    color: 'hsl(var(--primary))',
  },
  proj3m: {
    label: 'Projecao 3 meses',
    color: 'hsl(var(--warning))',
  },
  proj6m: {
    label: 'Projecao 6 meses',
    color: 'hsl(var(--muted-foreground))',
  },
};

const WeightEvolutionChart = () => {
  const { profile, weightHistory, loadingWeightHistory } = useUserContext();

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!profile?.peso) return [];

    const map = new Map<string, ChartPoint>();

    const ensure = (isoDate: string) => {
      const key = isoDate.slice(0, 10);
      const existing = map.get(key);
      if (existing) return existing;

      const point: ChartPoint = {
        date: isoDate,
        real: null,
        proj3m: null,
        proj6m: null,
      };
      map.set(key, point);
      return point;
    };

    const sortedHistory = [...weightHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedHistory.forEach((item) => {
      const point = ensure(item.date);
      point.real = item.peso;
    });

    const lastReal = sortedHistory[sortedHistory.length - 1];
    const startWeight = lastReal?.peso || profile.peso;
    const startDate = lastReal?.date ? new Date(lastReal.date) : new Date();

    const caloriasMeta = Number(profile.calorias_meta || 0);
    const objetivo = profile.objetivo;
    const tmbBase = Number(profile.tmb_base || profile.peso * 24);
    const activityFactor = getActivityFactor(profile);

    if (caloriasMeta > 0) {
      const projection3m = simulateHarrisBenedictProjection({
        startWeight,
        startDate,
        months: 3,
        caloriasMeta,
        objetivo,
        tmbBase,
        activityFactor,
      });

      const projection6m = simulateHarrisBenedictProjection({
        startWeight,
        startDate,
        months: 6,
        caloriasMeta,
        objetivo,
        tmbBase,
        activityFactor,
      });

      projection3m.forEach((item) => {
        const point = ensure(item.date);
        point.proj3m = item.peso;
      });

      projection6m.forEach((item) => {
        const point = ensure(item.date);
        point.proj6m = item.peso;
      });
    }

    if (!sortedHistory.length) {
      const today = new Date();
      const point = ensure(today.toISOString());
      point.real = profile.peso;

      [1, 2, 3, 4, 5, 6].forEach((monthDelta) => {
        const next = addMonths(today, monthDelta).toISOString();
        ensure(next);
      });
    }

    return [...map.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [profile, weightHistory]);

  if (!profile) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolucao de Peso</CardTitle>
        <CardDescription>Historico real da tabela weight_history e simulacao biometabolica para 3 e 6 meses.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <LineChart data={chartData} margin={{ left: 6, right: 12, top: 6, bottom: 6 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(value) => format(new Date(value), 'dd/MM', { locale: ptBR })}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={42}
              tickFormatter={(value) => `${fmt2(Number(value))}`}
              domain={['dataMin - 1', 'dataMax + 1']}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => format(new Date(String(label)), "dd 'de' MMM", { locale: ptBR })}
                  formatter={(value, name) => [`${fmt2(Number(value))} kg`, String(name)]}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="real"
              name="Historico real"
              stroke="var(--color-real)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="proj3m"
              name="Projecao 3 meses"
              stroke="var(--color-proj3m)"
              strokeWidth={2}
              strokeDasharray="6 6"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="proj6m"
              name="Projecao 6 meses"
              stroke="var(--color-proj6m)"
              strokeWidth={2}
              strokeDasharray="4 6"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>

        <p className="text-xs text-muted-foreground">
          {loadingWeightHistory ? 'Atualizando historico...' : 'Historico atualizado em tempo real.'}
        </p>
        <p className="text-xs text-muted-foreground">
          A projecao para 3 e 6 meses e uma simulacao baseada em biologia teorica e Harris-Benedict, nao uma garantia de resultado.
        </p>
      </CardContent>
    </Card>
  );
};

export default WeightEvolutionChart;
