import { supabase } from './supabase.js';

async function testSupabase() {
  const { data, error } = await supabase
    .from('designs')
    .select('*');

  console.log('Supabase data:', data);
  console.log('Supabase error:', error);
}

testSupabase();