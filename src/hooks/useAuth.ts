import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, AppUser, UserGoal } from '@/lib/supabase';

const AUTH_TIMEOUT_MS = 10000;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, label: string) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${label} timeout`));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single(),
        AUTH_TIMEOUT_MS,
        'fetchProfile'
      );

      if (error) {
        throw error;
      }

      if (data) {
        setProfile(data as AppUser);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Erro ao buscar perfil do usuario:', error);
      setProfile(null);
    }
  }, [withTimeout]);

  const updateProfile = useCallback(async (payload: Partial<Pick<AppUser, 'nome' | 'peso' | 'objetivo' | 'alteracao_calorica_alvo' | 'treina_atualmente' | 'tipo_treino' | 'calorias_meta' | 'proteinas_meta' | 'carbos_meta' | 'gorduras_meta'>>) => {
    if (!user?.id) {
      throw new Error('Usuario nao autenticado');
    }

    const previousProfile = profile;
    if (previousProfile) {
      setProfile({ ...previousProfile, ...payload });
    }

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      if (previousProfile) {
        setProfile(previousProfile);
      }
      throw error;
    }

    const nextProfile = data as AppUser;
    setProfile(nextProfile);
    return nextProfile;
  }, [user?.id, profile]);

  useEffect(() => {
    const applySessionState = async (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await fetchProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    };

    const handleAuthStateChange = async (event: string, nextSession: Session | null) => {
      const trackedEvents = event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT';

      if (trackedEvents) {
        setLoading(true);
      }

      try {
        await applySessionState(nextSession);
      } catch (error) {
        console.error('Erro no onAuthStateChange:', error);
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (trackedEvents) {
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        void handleAuthStateChange(event, nextSession);
      }
    );

    const initializeAuth = async () => {
      setLoading(true);

      try {
        const { data: { session: initialSession } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'getSession'
        );
        await applySessionState(initialSession);
      } catch (error) {
        console.error('Erro ao inicializar sessao:', error);
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    void initializeAuth();

    return () => subscription.unsubscribe();
  }, [fetchProfile, withTimeout]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`users-profile-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as AppUser | undefined;
          if (next) {
            setProfile(next);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signUp = async (email: string, password: string, nome: string, peso: number, objetivo: UserGoal) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        nome,
        peso,
        objetivo,
      });
      if (insertError) throw insertError;
    }
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return { session, user, profile, loading, signUp, signIn, signOut, refreshProfile, updateProfile };
}
