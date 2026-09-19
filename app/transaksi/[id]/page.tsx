import { notFound } from 'next/navigation';
import { requireMemberRole } from '@/lib/auth/guards';

type Sale = {
  id: string;
  invoice_number: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  grand_total: number | string;
  payment_method: string;
  payment_status: string;
  status: string;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
};

type SaleItem = {
  id: string;
  product_name: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  discount: number | string;
  subtotal: number | string;
};

type Payment = {
  method: string;
  amount: number | string;
  cash_received: number | string;
};

const paymentLabels: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  qris: 'QRIS',
  debit: 'Debit',
  other: 'Lainnya',
};

const saleStatusLabels: Record<string, string> = {
  completed: 'Selesai',
  voided: 'Dibatalkan',
};

const money = (value: number | string) =>
  `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

const quantity = (value: number | string) => Number(value || 0).toLocaleString('id-ID', {
  maximumFractionDigits: 3,
});

export default async function TransactionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, member } = await requireMemberRole(['owner', 'cashier']);

  const [{ data: sale, error: saleError }, { data: items, error: itemsError }, { data: payment, error: paymentError }, { data: shop, error: shopError }] = await Promise.all([
    supabase
      .from('sales')
      .select('id,invoice_number,subtotal,discount,tax,grand_total,payment_method,payment_status,status,void_reason,voided_at,created_at')
      .eq('id', id)
      .eq('shop_id', member.shop_id)
      .maybeSingle(),
    supabase
      .from('sale_items')
      .select('id,product_name,quantity,unit,unit_price,discount,subtotal')
      .eq('sale_id', id)
      .eq('shop_id', member.shop_id)
      .order('id'),
    supabase
      .from('payments')
      .select('method,amount,cash_received')
      .eq('sale_id', id)
      .eq('shop_id', member.shop_id)
      .maybeSingle(),
    supabase
      .from('shops')
      .select('name,phone,address,logo_url')
      .eq('id', member.shop_id)
      .maybeSingle(),
  ]);

  if (saleError || itemsError || paymentError || shopError || !sale || !shop) {
    notFound();
  }

  const typedSale = sale as Sale;
  const typedItems = (items ?? []) as SaleItem[];
  const typedPayment = (payment ?? null) as Payment | null;
  const isCash = typedSale.payment_method === 'cash';
  const cashReceived = Number(typedPayment?.cash_received ?? 0);
  const grandTotal = Number(typedSale.grand_total ?? 0);
  const change = isCash ? Math.max(0, cashReceived - grandTotal) : 0;

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Detail transaksi</div>
          <h1>{typedSale.invoice_number}</h1>
          <p className="muted">
            {new Date(typedSale.created_at).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        <a className="btn btn-ghost" href="/transaksi">← Kembali</a>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-title">
            <div>
              <h3>{shop.name}</h3>
              <p className="muted">Informasi toko</p>
            </div>
            <span className={`badge ${typedSale.status === 'completed' ? 'badge-ok' : 'badge-off'}`}>
              {saleStatusLabels[typedSale.status] ?? typedSale.status}
            </span>
          </div>
          {shop.address && <p>{shop.address}</p>}
          {shop.phone && <p className="muted">{shop.phone}</p>}
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h3>Pembayaran</h3>
              <p className="muted">{paymentLabels[typedSale.payment_method] ?? typedSale.payment_method}</p>
            </div>
            <span className="badge badge-ok">{typedSale.payment_status}</span>
          </div>
          {isCash && (
            <div className="grid" style={{ gap: 8 }}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Uang diterima</span>
                <strong>{money(cashReceived)}</strong>
              </div>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Kembalian</span>
                <strong>{money(change)}</strong>
              </div>
            </div>
          )}
          {!isCash && typedPayment && (
            <div className="row-actions" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Jumlah pembayaran</span>
              <strong>{money(typedPayment.amount)}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <div>
            <h3>Item transaksi</h3>
            <p className="muted">{typedItems.length} jenis item</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Qty</th>
                <th>Harga</th>
                <th>Diskon</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {typedItems.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.product_name}</strong></td>
                  <td>{quantity(item.quantity)} {item.unit}</td>
                  <td className="num">{money(item.unit_price)}</td>
                  <td className="num">{money(item.discount)}</td>
                  <td className="num">{money(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="grid" style={{ maxWidth: 480, marginLeft: 'auto', gap: 8 }}>
          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Subtotal</span>
            <strong>{money(typedSale.subtotal)}</strong>
          </div>
          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Diskon</span>
            <strong>{money(typedSale.discount)}</strong>
          </div>
          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Pajak</span>
            <strong>{money(typedSale.tax)}</strong>
          </div>
          <div className="row-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <strong>Total</strong>
            <strong style={{ fontSize: 22 }}>{money(typedSale.grand_total)}</strong>
          </div>
        </div>
      </div>

      {typedSale.status === 'voided' && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Transaksi dibatalkan</h3>
          {typedSale.void_reason && <p>Alasan: {typedSale.void_reason}</p>}
          {typedSale.voided_at && <p className="muted">Dibatalkan: {new Date(typedSale.voided_at).toLocaleString('id-ID')}</p>}
        </div>
      )}
    </section>
  );
}
