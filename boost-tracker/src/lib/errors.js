import { toast } from '../ui/toast.js';

/**
 * Wrapper unifié pour tous les appels Supabase.
 * - Affiche un toast d'erreur si la requête échoue
 * - Log en console avec le contexte
 * - Retourne null en cas d'erreur (au lieu de crasher silencieusement)
 *
 * Usage :
 *   const data = await safeQuery('renderTracker', supabase.from('runs').select('*'));
 *   if (!data) return; // erreur déjà gérée
 */
export async function safeQuery(label, builder) {
  const { data, error } = await builder;
  if (error) {
    const msg = error.message || 'Erreur serveur';
    console.error(`[${label}]`, error);
    toast(msg, 'err');
    return null;
  }
  return data;
}
