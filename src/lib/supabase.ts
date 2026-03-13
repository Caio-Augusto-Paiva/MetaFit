import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bkrpgognbgryyusplxxp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_P9GSxhWngGN6982lD6SCKQ_oFXKK-V4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserGoal = 'perda' | 'ganho' | 'manutencao';

export interface AppUser {
  id: string;
  nome: string;
  peso: number;
  objetivo: UserGoal;
  calorias_meta: number | null;
  proteinas_meta: number | null;
  carbos_meta: number | null;
  gorduras_meta: number | null;
  created_at: string;
}

export interface FoodItem {
  id: string;
  nome: string;
  calorias_g: number;
  proteinas_g: number;
  carbos_g: number;
  gorduras_g: number;
  user_id?: string | null; // Para receitas privadas do usuário
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
  tipo?: string;
  duracao_min?: number;
  tipo_atividade?: string;
  duracao_minutos?: number;
  calorias_gastas: number;
  data: string;
  created_at: string;
}

export interface RecipeIngredient {
  foodId: string;
  gramas: number;
  food?: FoodItem;
}

export interface CreateRecipeData {
  nome: string;
  ingredients: RecipeIngredient[];
}
