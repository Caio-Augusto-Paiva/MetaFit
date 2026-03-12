import React, { createContext, useContext } from 'react';
import { useAuth } from '@/hooks/useAuth';

type AuthContextType = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  
  const themeClass = auth.profile?.objetivo === 'ganho' 
    ? 'theme-ganho' 
    : auth.profile?.objetivo === 'manutencao'
    ? 'theme-manutencao'
    : 'theme-perda';

  return (
    <AuthContext.Provider value={auth}>
      <div className={themeClass}>
        {children}
      </div>
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};
