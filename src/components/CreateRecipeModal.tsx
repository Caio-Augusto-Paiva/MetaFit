import { useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase, RecipeIngredient, FoodItem } from '@/lib/supabase';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Search, X, Trash2, ChefHat } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface CreateRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecipeCreated?: () => void;
}

export const CreateRecipeModal = ({ isOpen, onClose, onRecipeCreated }: CreateRecipeModalProps) => {
  const { user } = useAuthContext();
  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [gramas, setGramas] = useState('100');
  const [creating, setCreating] = useState(false);
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  
  const {
    searchTerm,
    setSearchTerm,
    foods,
    loading,
    isEmpty,
    clearSearch
  } = useFoodSearch({ userId: user?.id });

  if (!isOpen) return null;

  const addIngredient = () => {
    if (!selectedFood) return;
    
    const ingredient: RecipeIngredient = {
      foodId: selectedFood.id,
      gramas: Number(gramas),
      food: selectedFood
    };
    
    setIngredients(prev => [...prev, ingredient]);
    setSelectedFood(null);
    setGramas('100');
    setShowFoodSearch(false);
    clearSearch();
  };

  const removeIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const calculateRecipeMacros = () => {
    let totalCalorias = 0;
    let totalProteinas = 0;
    let totalCarbos = 0;
    let totalGorduras = 0;
    let totalGramas = 0;

    ingredients.forEach(ingredient => {
      if (ingredient.food) {
        const gramas = ingredient.gramas;
        totalCalorias += ingredient.food.calorias_g * gramas;
        totalProteinas += ingredient.food.proteinas_g * gramas;
        totalCarbos += ingredient.food.carbos_g * gramas;
        totalGorduras += ingredient.food.gorduras_g * gramas;
        totalGramas += gramas;
      }
    });

    return {
      totalGramas,
      totalCalorias,
      totalProteinas,
      totalCarbos,
      totalGorduras,
      // Valores por grama da receita final
      calorias_g: totalGramas > 0 ? totalCalorias / totalGramas : 0,
      proteinas_g: totalGramas > 0 ? totalProteinas / totalGramas : 0,
      carbos_g: totalGramas > 0 ? totalCarbos / totalGramas : 0,
      gorduras_g: totalGramas > 0 ? totalGorduras / totalGramas : 0
    };
  };

  const createRecipe = async () => {
    if (!recipeName.trim()) {
      toast.error('Nome da receita é obrigatório');
      return;
    }
    
    if (ingredients.length === 0) {
      toast.error('Adicione pelo menos um ingrediente');
      return;
    }
    
    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }

    setCreating(true);
    
    try {
      const macros = calculateRecipeMacros();
      
      const { data, error } = await supabase
        .from('food_database')
        .insert({
          nome: recipeName.trim(),
          calorias_g: macros.calorias_g,
          proteinas_g: macros.proteinas_g,
          carbos_g: macros.carbos_g,
          gorduras_g: macros.gorduras_g,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Receita criada com sucesso!', {
        description: `"${recipeName}" foi adicionada às suas receitas`
      });
      
      // Reset form
      setRecipeName('');
      setIngredients([]);
      onRecipeCreated?.();
      onClose();
      
    } catch (err) {
      console.error('Erro ao criar receita:', err);
      toast.error('Erro ao criar receita', {
        description: err instanceof Error ? err.message : 'Tente novamente'
      });
    } finally {
      setCreating(false);
    }
  };

  const macros = calculateRecipeMacros();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="glass rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-primary" />
            <h3 className="font-bold text-xl">Criar Receita</h3>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Nome da receita */}
        <div>
          <label className="text-sm font-medium text-muted-foreground">Nome da Receita</label>
          <Input
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder="Ex: Minha receita de frango com batata doce"
            className="mt-1"
            autoFocus
          />
        </div>

        {/* Lista de ingredientes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-muted-foreground">Ingredientes</label>
            <Button 
              size="sm" 
              onClick={() => setShowFoodSearch(true)}
              className="h-8"
            >
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
          
          {ingredients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Adicione ingredientes para criar sua receita
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="glass rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{ingredient.food?.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {ingredient.gramas}g • {((ingredient.food?.calorias_g || 0) * ingredient.gramas).toFixed(1)} kcal
                    </p>
                  </div>
                  <button
                    onClick={() => removeIngredient(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumo nutricional da receita */}
        {ingredients.length > 0 && (
          <div className="glass rounded-lg p-4">
            <h4 className="font-medium text-sm text-muted-foreground mb-3">Informação Nutricional (por grama)</h4>
            <div className="grid grid-cols-4 gap-4 text-center text-xs">
              <div>
                <p className="font-bold text-lg font-mono">{macros.calorias_g.toFixed(2)}</p>
                <p className="text-muted-foreground">kcal/g</p>
              </div>
              <div>
                <p className="font-bold text-lg font-mono">{macros.proteinas_g.toFixed(2)}</p>
                <p className="text-muted-foreground">Prot/g</p>
              </div>
              <div>
                <p className="font-bold text-lg font-mono">{macros.carbos_g.toFixed(2)}</p>
                <p className="text-muted-foreground">Carb/g</p>
              </div>
              <div>
                <p className="font-bold text-lg font-mono">{macros.gorduras_g.toFixed(2)}</p>
                <p className="text-muted-foreground">Gord/g</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Total: {macros.totalGramas}g • {macros.totalCalorias.toFixed(1)} kcal
            </p>
          </div>
        )}

        {/* Busca de alimentos modal */}
        {showFoodSearch && (
          <div className="border rounded-lg p-4 space-y-3 bg-background/50">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Buscar Alimento</h4>
              <button onClick={() => setShowFoodSearch(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {!selectedFood ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar alimento ou receita..."
                    className="pl-9"
                  />
                </div>
                
                {loading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                
                {isEmpty && (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    Nenhum alimento encontrado
                  </p>
                )}
                
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {foods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => setSelectedFood(food)}
                      className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <p className="font-medium text-sm">
                        {food.nome} {food.user_id && <span className="text-xs text-primary">(Sua receita)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {food.calorias_g.toFixed(2)} kcal/g • P:{food.proteinas_g.toFixed(1)} C:{food.carbos_g.toFixed(1)} G:{food.gorduras_g.toFixed(1)}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="glass rounded-lg p-3">
                  <p className="font-medium">{selectedFood.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFood.calorias_g.toFixed(2)} kcal/g
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Quantidade (g)</label>
                  <Input
                    type="number"
                    value={gramas}
                    onChange={(e) => setGramas(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setSelectedFood(null)} className="flex-1">
                    Voltar
                  </Button>
                  <Button onClick={addIngredient} className="flex-1">
                    Adicionar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Botões de ação */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button 
            onClick={createRecipe}
            disabled={creating || !recipeName.trim() || ingredients.length === 0}
            className="flex-1 glow"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              'Criar Receita'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};