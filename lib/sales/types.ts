// Bentuk baris tabel `sales` (kolom sesuai migration 001/003/010).
export interface SaleRecord {
  id: string;
  shop_id: string;
  invoice_number: string;
  cashier_id: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  grand_total: number | string;
  payment_method: string;
  payment_status: string;
  status: string; // 'completed' | 'voided'
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
}

// Respons POST /api/sales: baris sales + info kembalian untuk struk.
export interface CreatedSale extends SaleRecord {
  cash_received: number;
  change_amount: number;
}
