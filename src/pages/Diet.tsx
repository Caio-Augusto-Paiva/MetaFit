import { useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Brain, Save, RefreshCw } from 'lucide-react';

interface DietPlan {
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  refeicoes: { nome: string; descricao: string; calorias: number }[];
}

function simulateDiet(peso: number, objetivo: string): DietPlan {
  let calBase: number;
  let protFactor: number;
  let carbPercent: number;
  let fatPercent: number;

  switch (objetivo) {
    case 'perda':
      calBase = peso * 24;
      protFactor = 2.2;
      carbPercent = 0.35;
      fatPercent = 0.25;
      break;
    case 'ganho':
      calBase = peso * 32;
      protFactor = 2.0;
      carbPercent = 0.45;
      fatPercent = 0.20;
      break;
    default: // manutencao
      calBase = peso * 28;
      protFactor = 1.8;
      carbPercent = 0.40;
      fatPercent = 0.25;
  }

  const calorias = Math.round(calBase);
  const proteinas = Math.round(peso * protFactor);
  const carboidratos = Math.round((calorias * carbPercent) / 4);
  const gorduras = Math.round((calorias * fatPercent) / 9);

  const mealCalories = Math.round(calorias / 5);
  const refeicoes = [
    { nome: 'Café da Manhã', descricao: `Ovos mexidos com pão integral e frutas`, calorias: mealCalories },
    { nome: 'Lanche da Manhã', descricao: `Iogurte natural com granola e mel`, calorias: Math.round(mealCalories * 0.6) },
    { nome: 'Almoço', descricao: `Arroz integral, frango grelhado, legumes e salada`, calorias: Math.round(mealCalories * 1.4) },
    { nome: 'Lanche da Tarde', descricao: `Whey protein com banana e aveia`, calorias: Math.round(mealCalories * 0.7) },
    { nome: 'Jantar', descricao: `Salmão grelhado com batata doce e brócolis`, calorias: Math.round(mealCalories * 1.3) },
  ];

  return { calorias, proteinas, carboidratos, gorduras, refeicoes };
}

const Diet = () => {
  const { profile, refreshProfile } = useAuthContext();
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const generate = () => {
    if (!profile) return;
    setSaved(false);
    const result = simulateDiet(profile.peso, profile.objetivo);
    setPlan(result);
  };

  const saveGoal = async () => {
    if (!plan || !profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({ calorias_meta: plan.calorias })
      .eq('id', profile.id);
    if (!error) {
      setSaved(true);
      refreshProfile();
    }
    setSaving(false);
  };

  const goalLabel = profile?.objetivo === 'perda' ? 'Perda de Gordura' : profile?.objetivo === 'ganho' ? 'Ganho de Massa' : 'Manutenção';

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Simulação de Dieta</h2>

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Seu perfil</p>
            <p className="font-bold">{profile?.peso}kg · {goalLabel}</p>
          </div>
          {profile?.calorias_meta && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Meta atual</p>
              <p className="font-bold text-primary font-mono">{profile.calorias_meta} kcal</p>
            </div>
          )}
        </div>

        <Button onClick={generate} className="w-full glow">
          <Brain className="w-4 h-4 mr-2" />
          Gerar Plano Alimentar
        </Button>
      </div>

      {plan && (
        <div className="space-y-3 animate-fade-in">
          {/* Macros overview */}
          <div className="glass rounded-xl p-4">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">Macros Sugeridos</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold font-mono text-primary">{plan.calorias}</p>
                <p className="text-xs text-muted-foreground">kcal</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{plan.proteinas}</p>
                <p className="text-xs text-muted-foreground">Prot (g)</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{plan.carboidratos}</p>
                <p className="text-xs text-muted-foreground">Carb (g)</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{plan.gorduras}</p>
                <p className="text-xs text-muted-foreground">Gord (g)</p>
              </div>
            </div>
          </div>

          {/* Meals suggestion */}
          <div className="space-y-2">
            {plan.refeicoes.map((r, i) => (
              <div key={i} className="glass rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <p className="font-medium text-sm">{r.nome}</p>
                  <span className="text-xs font-mono text-primary">{r.calorias} kcal</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.descricao}</p>
              </div>
            ))}
          </div>

          {/* Save */}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={generate} className="flex-1">
              <RefreshCw className="w-4 h-4 mr-1" /> Regenerar
            </Button>
            <Button onClick={saveGoal} disabled={saving || saved} className="flex-1 glow">
              <Save className="w-4 h-4 mr-1" />
              {saved ? 'Meta salva!' : 'Salvar como meta'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Diet;
