import { createClient } from '@/lib/supabase/server'; import { ok,errorResponse } from '@/lib/utils/response';
export async function GET(){try{const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); return ok({authenticated:Boolean(user),user:user?{id:user.id,email:user.email}:null});}catch{return errorResponse('Gagal memeriksa session',500)}}
