import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bkrpgognbgryyusplxxp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrcnBnb2duYmdyeXl1c3BseHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NTg2NTksImV4cCI6MjA2NTIzNDY1OX0.PBMTKSMqFJey5JnrrmWHNHitSbOstqMfIUo-jMk0fN4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserGoal = 'perda' | 'ganho' | 'manutencao';

export interface AppUser {
  id: string;
  nome: string;
  peso: number;
  objetivo: UserGoal;
  calorias_meta: number | null;
  created_at: string;
}

export interface FoodItem {
  id: string;
  nome: string;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  porcao_g: number;
}

export interface Meal {
  id: string;
  user_id: string;
  food_id: string;
  quantidade_gramas: number;
  data: string;
  hora: string;
  created_at: string;
  food_database?: FoodItem;
}

export interface Workout {
  id: string;
  user_id: string;
  tipo: string;
  duracao_min: number;
  calorias_gastas: number;
  data: string;
  created_at: string;
}
