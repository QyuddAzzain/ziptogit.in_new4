// Info tujuan pembayaran untuk upgrade Tier Pro via transfer manual
// (alternatif selain Pakasir). Ubah nilainya di sini saja bila
// rekening/e-wallet tujuan berubah.
//
// MANUAL_TRANSFER_CHANNEL dipakai sebagai penanda di kolom
// subscription_payments.payment_channel supaya baris "transfer manual"
// bisa dibedakan dari baris Pakasir tanpa perlu kolom/migration baru.
export const MANUAL_TRANSFER_CHANNEL = 'MANUAL_TF';

export type ManualTransferAccount = {
  method: string;
  bank: string;
  accountName: string;
  accountNumber: string;
};

export const MANUAL_TRANSFER_ACCOUNTS: ManualTransferAccount[] = [
  {
    method: 'Transfer Bank',
    bank: 'SEA BANK',
    accountName: 'TAQIYUDDIN AZZAIN LUBIS',
    accountNumber: '901385795710',
  },
  {
    method: 'E-Wallet',
    bank: 'ShopeePay',
    accountName: 'TAQIYUDDIN AZZAIN LUBIS',
    accountNumber: '0895328556866',
  },
];
