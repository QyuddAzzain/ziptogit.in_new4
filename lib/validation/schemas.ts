import { z } from 'zod';
export const productCreateSchema = z.object({ name:z.string().trim().min(1).max(150), sku:z.string().trim().max(80).optional(), barcode:z.string().trim().max(80).optional(), category_id:z.string().uuid().nullable().optional(), cost_price:z.number().nonnegative(), selling_price:z.number().nonnegative(), stock:z.number().nonnegative().default(0), minimum_stock:z.number().nonnegative().default(0), unit:z.string().trim().min(1).max(30).default('PCS') });
export const productUpdateSchema = productCreateSchema.omit({ stock: true }).partial().extend({ is_active:z.boolean().optional() }).refine(d=>Object.keys(d).length>0,{message:'Tidak ada perubahan'});
export const categorySchema = z.object({ name:z.string().trim().min(1).max(120) });
export const categoryUpdateSchema = z.object({ name:z.string().trim().min(1).max(120).optional(), is_active:z.boolean().optional() }).refine(d=>Object.keys(d).length>0,{message:'Tidak ada perubahan'});
export const saleSchema = z.object({ items:z.array(z.object({ product_id:z.string().uuid(), quantity:z.number().positive().max(100000) })).min(1), discount:z.number().nonnegative().default(0), payment_method:z.enum(['cash','transfer','qris','debit','other']), cash_received:z.number().nonnegative().default(0) }).superRefine((data, ctx)=>{ if(data.payment_method==='cash' && data.cash_received<=0) ctx.addIssue({code:'custom',path:['cash_received'],message:'Pembayaran tunai harus memiliki uang diterima lebih dari 0'}); });
export const stockMovementSchema = z.object({ product_id:z.string().uuid(), quantity:z.number().refine(v=>v!==0), reason:z.string().trim().min(1).max(255), movement_type:z.enum(['in','out','adjustment']) });

// Pembatalan transaksi: sale_id wajib UUID, alasan wajib & dibatasi panjangnya (masuk ke stock_movements & audit log).
export const voidSaleSchema = z.object({ sale_id:z.string().uuid(), reason:z.string().trim().min(1).max(255) });

// Query dashboard (GET /api/sales?view=dashboard&from=YYYY-MM-DD). Tanggal dihitung WIB oleh klien.
export const dashboardQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(new Date(`${v}T00:00:00+07:00`).getTime()),{message:'Tanggal tidak valid'}),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
