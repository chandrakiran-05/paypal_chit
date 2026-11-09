import { paypalRequest } from './paypal';

export type PayoutBatch = {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: { transaction_status: string; payout_item?: { sender_item_id?: string } }[];
};

export async function createPayout(roundId: string, email: string, amount: string, currency: string) {
  return paypalRequest<PayoutBatch>('/v1/payments/payouts', 'POST', {
    sender_batch_header: { sender_batch_id: `chit-${roundId}`, recipient_type: 'EMAIL', email_subject: 'Your Chit circle payout' },
    items: [{ recipient_type: 'EMAIL', receiver: email, amount: { value: amount, currency }, sender_item_id: roundId,
      note: 'Savings circle payout' }]
  }, `payout-${roundId}`);
}

export async function getPayout(batchId: string) {
  return paypalRequest<PayoutBatch>(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
}
