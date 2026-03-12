import { useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserGoal } from '@/lib/supabase';
import { Flame, Dumbbell, Scale } from 'lucide-react';

const Auth = () => {
  const { signIn, signUp } = useAuthContext();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [peso, setPeso] = useState('');
  const [objetivo, setObjetivo] = useState<UserGoal>('perda');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        if (!nome.trim() || !peso) {
          setError('Preencha todos os campos');
          setLoading(false);
          return;
        }
        await signUp(email, password, nome.trim(), Number(peso), objetivo);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  const goals: { value: UserGoal; label: string; icon: React.ReactNode }[] = [
    { value: 'perda', label: 'Perda de Gordura', icon: <Flame className="w-5 h-5" /> },
    { value: 'ganho', label: 'Ganho de Massa', icon: <Dumbbell className="w-5 h-5" /> },
    { value: 'manutencao', label: 'Manutenção', icon: <Scale className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Fit<span className="text-primary">Track</span>
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome</label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  className="mt-1 bg-background/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Peso atual (kg)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="75.0"
                  className="mt-1 bg-background/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Objetivo</label>
                <div className="grid grid-cols-3 gap-2">
                  {goals.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setObjetivo(g.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs font-medium transition-all ${
                        objetivo === g.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background/50 text-muted-foreground hover:border-muted-foreground'
                      }`}
                    >
                      {g.icon}
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="mt-1 bg-background/50"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 bg-background/50"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" className="w-full glow" disabled={loading}>
            {loading ? 'Carregando...' : isLogin ? 'Entrar' : 'Cadastrar'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? 'Não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Auth;
