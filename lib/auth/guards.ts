import { createClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('UNAUTHORIZED');
  return { supabase, user };
}

export async function requireMemberRole(allowed: string[]) {
  const { supabase, user } = await requireUser();
  const { data: member } = await supabase.from('shop_members').select('shop_id, role, active').eq('user_id', user.id).eq('active', true).maybeSingle();
  if (!member || !allowed.includes(member.role)) throw new Error('FORBIDDEN');
  return { supabase, user, member };
}
