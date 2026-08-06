import mongoose from "mongoose";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { RetailPaymentModel, type RetailPaymentDoc } from "@/models/RetailPayment";
import { LEDGER_WINDOW, MAX_LEDGER_WINDOW } from "@/lib/pagination";

/**
 * A retail customer's signed outstanding balance in paisa, keyed by phone
 * number the same way computeBuyerDue (src/lib/dueComputation.ts) is keyed
 * by buyerId — positive = the customer owes, negative = the pharmacy owes
 * credit. Derived from active retail sales and retail payments, never
 * stored. See computeBuyerDue's doc comment for the full credit-on-
 * cancellation rationale; the rule here is identical, just phone-keyed.
 *
 * `session` is optional for the same reason it is on computeBuyerDue: so
 * recordRetailPayment (src/actions/due.ts) can run this exact read inside
 * its own Mongo transaction.
 */
export async function computeRetailDue(
  phone: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const trimmed = phone.trim();
  if (!trimmed) return 0;

  const [saleAgg] = await SaleModel.aggregate<{ total: number }>([
    { $match: { buyerPhone: trimmed, type: "retail", status: "active" } },
    { $group: { _id: null, total: { $sum: "$duePaisa" } } },
  ]).session(session ?? null);
  const [payAgg] = await RetailPaymentModel.aggregate<{ total: number }>([
    { $match: { phone: trimmed } },
    { $group: { _id: null, total: { $sum: "$amountPaisa" } } },
  ]).session(session ?? null);

  return (saleAgg?.total ?? 0) - (payAgg?.total ?? 0);
}

/**
 * A retail customer's most recent sales and payments for one phone, newest
 * first. Bounded exactly like loadBuyerLedger — see that function for why the
 * window is safe and what totalEntries is for.
 */
export async function loadRetailLedger(
  phone: string,
  limit = LEDGER_WINDOW,
): Promise<{ sales: SaleDoc[]; payments: RetailPaymentDoc[]; totalEntries: number }> {
  const trimmed = phone.trim();
  if (!trimmed) return { sales: [], payments: [], totalEntries: 0 };
  const capped = Math.min(Math.max(Math.trunc(limit) || LEDGER_WINDOW, 1), MAX_LEDGER_WINDOW);

  const [sales, payments, saleCount, paymentCount] = await Promise.all([
    SaleModel.find({ buyerPhone: trimmed, type: "retail" })
      .sort({ createdAt: -1 })
      .limit(capped)
      .lean<SaleDoc[]>(),
    RetailPaymentModel.find({ phone: trimmed })
      .sort({ createdAt: -1 })
      .limit(capped)
      .lean<RetailPaymentDoc[]>(),
    SaleModel.countDocuments({ buyerPhone: trimmed, type: "retail" }),
    RetailPaymentModel.countDocuments({ phone: trimmed }),
  ]);
  return { sales, payments, totalEntries: saleCount + paymentCount };
}
