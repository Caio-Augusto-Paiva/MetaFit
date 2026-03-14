import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, AppUser, UserGoal } from '@/lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) setProfile(data as AppUser);
  }, []);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
