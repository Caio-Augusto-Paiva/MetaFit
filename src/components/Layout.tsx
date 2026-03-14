import { useAuthContext } from '@/contexts/AuthContext';
import { useUserContext } from '../contexts/UserContext';
import { Utensils, Dumbbell, Brain, LogOut, User, ArrowRightLeft } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/', icon: Utensils, label: 'Refeições' },
  { to: '/workouts', icon: Dumbbell, label: 'Treinos' },
  { to: '/diet', icon: Brain, label: 'Dieta IA' },
  { to: '/equivalencias', icon: ArrowRightLeft, label: 'Equivalências' },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useUserContext();
  const { signOut } = useAuthContext();
  const location = useLocation();

  const dynamicGlowClass = profile?.objetivo === 'ganho'
    ? 'shadow-[0_0_28px_-10px_rgba(59,130,246,0.65)]'
    : profile?.objetivo === 'manutencao'
    ? 'shadow-[0_0_28px_-10px_rgba(45,212,191,0.65)]'
    : 'shadow-[0_0_28px_-10px_rgba(249,115,22,0.65)]';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className={`sticky top-0 z-50 px-4 py-3 flex items-center justify-between bg-slate-950/60 backdrop-blur-lg border-b border-white/10 transition-shadow duration-300 ${dynamicGlowClass}`}>
        <h1 className="text-lg font-bold tracking-tight">
          Fit<span className="text-primary">Track</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">{profile?.nome}</span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {profile?.peso}kg
            </span>
          </div>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container max-w-2xl py-4 px-4 animate-fade-in">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className={`sticky bottom-0 z-50 bg-slate-950/60 backdrop-blur-lg border-t border-white/10 transition-shadow duration-300 ${dynamicGlowClass}`}>
        <div className="flex justify-around max-w-2xl mx-auto">
          {tabs.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center gap-1 py-3 px-4 text-xs font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
