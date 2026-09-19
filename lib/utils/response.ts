import { NextResponse } from 'next/server';
export function ok(data:unknown, status=200){ return NextResponse.json({ok:true,data},{status}); }
export function errorResponse(message:string,status=400){ return NextResponse.json({ok:false,error:message},{status}); }

// Ambil pesan dari error apa pun tanpa `any`. Error dari Supabase (PostgrestError)
// bukan instance Error tapi punya properti `message`, jadi dicek terpisah.
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const message = (e as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}
