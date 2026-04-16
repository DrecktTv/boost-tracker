import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants.js';

/**
 * Client Supabase singleton.
 * Importé dans tous les modules qui ont besoin d'accès DB ou Auth.
 * Remplace window.sbAuth de l'ancienne version.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Accès console pour scripts de migration (tous environnements)
window._sb = supabase;
