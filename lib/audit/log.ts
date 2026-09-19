import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditInput {
  shop_id: string;
  user_id: string; // pelaksana
  action: string; // mis. SALE_CREATED, SALE_VOIDED, CASHIER_CREATED
  entity_type?: string;
  entity_id?: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

// Tabel audit_logs tidak punya kolom old/new; nilainya disimpan di metadata (jsonb) dengan
// kunci `old_values` / `new_values`. Waktu kejadian = kolom created_at (default now()).
// Kegagalan menulis log tidak boleh menggagalkan aksi utama, tapi dicatat di log server.
export async function writeAudit(supabase: SupabaseClient, input: AuditInput): Promise<void> {
  const { old_values, new_values, metadata, entity_type, entity_id, ...base } = input;
  const { error } = await supabase.from('audit_logs').insert({
    ...base,
    entity_type: entity_type ?? null,
    entity_id: entity_id ?? null,
    metadata: {
      ...(metadata ?? {}),
      ...(old_values !== undefined ? { old_values } : {}),
      ...(new_values !== undefined ? { new_values } : {}),
    },
  });
  if (error) console.error('audit log gagal ditulis:', error.message);
}
