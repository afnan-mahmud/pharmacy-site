# ABC Pharmacy — Buyer Portal Design (Plan 4)

**Date:** 2026-07-17
**Status:** Approved design, ready for implementation planning
**Extends:** `docs/superpowers/specs/2026-07-16-pharmacy-management-design.md` (the buyer-portal section)

## Overview

The final phase. The pharmacy's ~8-10 wholesale buyers get their own login, browse medicines at the box rate, place orders themselves, and watch each order's status — instead of ordering over the phone. The owner sees pending orders on his side, and approves each one, which turns it into the wholesale sale and invoice the Sale plan already builds. A buyer never touches stock, never sees another buyer, and never reaches an admin screen.

## Goals

- Let a buyer log in and place an order without the owner on the phone
- Give the owner one screen to approve or reject pending orders, adjusting quantities when stock is short
- Reuse the Sale plan's transactional wholesale-sale flow for approval — no second definition of "make a sale"
- Keep buyers strictly scoped to their own data, enforced server-side

## Decisions (from brainstorming)

- **Buyers log in with phone + password.** `BuyerModel` already has a unique `phone` and a `passwordHash`; no new username field. Same failure-message discipline as admin login (one message for wrong-phone and wrong-password, so the endpoint can't be probed).
- **An approved order becomes a fully-unpaid wholesale sale** (`paidPaisa: 0`, all due). The buyer pays nothing at order time; the owner records payments later through the existing Baki Khata. No payment field on the approval screen.
- **Buyers never see stock numbers or availability.** They order blind at the box rate; the owner adjusts quantities or rejects on approval. (Matches the base spec.)
- **A buyer can cancel his own order only while it is `pending`.** Once approved it is a sale, and once rejected it is closed — neither is cancelable by the buyer. The owner cancels a resulting *sale* through the existing `cancelSale`.

## Non-goals (out of scope, recorded so a later phase needn't re-litigate)

- Buyers seeing or paying invoices online — they see status and their own balance; payment stays in-person, recorded by the owner.
- Buyer self-registration or password reset — the owner creates accounts and sets passwords (Plan 2's buyer screen already does this).
- Any per-buyer pricing, order editing after submission, partial approval of individual lines, or order history export.
- Everything in the base spec's non-goals (purchase cost, profit, expiry, expense, staff accounts, retail receipts, barcode).

## Architecture

One new model, `Order`. A buyer-scoped session guard alongside the existing admin one. A `(buyer)` route group mirroring `(admin)`. Order approval reuses the Sale plan's transaction pattern exactly — it is the same "deduct stock + create sale + assign invoice number, atomically" flow, now triggered from an order rather than the wholesale form.

### The Order model

```
Order {
  buyerId,                         // who placed it
  buyerName, buyerShopName,        // snapshotted for the owner's list
  items: [{ medicineId, medicineName, boxes, boxPricePaisa }],  // price snapshotted at order time
  status: "pending" | "approved" | "rejected" | "cancelled",
  saleId,          // set when approved — links to the wholesale sale
  rejectReason,    // set when rejected
  createdAt, resolvedAt
}
```

Prices are snapshotted onto the order at submission, the same way the Sale plan snapshots them onto sale lines — so a price change between order and approval never silently rewrites what the buyer thought he was ordering. On approval the owner sees the snapshotted price and the current price if they differ; the *sale* is created at the current medicine price (the owner is the one committing the transaction, and the medicine record is the source of truth at that instant), with the order preserving what the buyer originally saw.

### Authentication and the buyer-scoped guard

The session token already carries `role: "admin" | "buyer"`. Buyer login mirrors admin login: verify phone + password, set the same `session` cookie with `role: "buyer"` and the buyer's id as `userId`.

Two new guards in `src/lib/session.ts`, parallel to the admin pair:

- `requireBuyer()` — page guard, redirects a non-buyer to `/buyer/login`
- `requireBuyerAction()` — action guard, throws `BUYER_ONLY_ERROR` for a non-buyer

**The load-bearing part:** a buyer guard returning "yes, some buyer" is not enough. Every buyer action that touches a specific order or balance must also verify the session's buyer *owns* that data — a buyer must never read or cancel another buyer's order by passing its id. This ownership check lives inside each action, not in the guard, because only the action knows which document is being touched. The authorization test is extended to cover this class: a buyer session calling a buyer action with another buyer's id is rejected.

An inactive buyer cannot log in (their account still exists, with its order history intact).

### The buyer portal screens

Deliberately minimal. Under `(buyer)`, all guarded by `requireBuyer()`:

- **Medicine list** — searchable, showing name and **box rate only**. No stock, no pata rate. A cart with box quantities.
- **Submit order** — the cart becomes a pending `Order`.
- **My orders** — the buyer's own orders, each with its status; a pending one can be cancelled here.
- **My account** — the buyer's own outstanding balance (via the existing signed `buyerDueBalance`) and payment history.

The buyer nav is its own small component; it does not share `AdminNav`.

### The owner's side

- **Pending orders** — a new admin screen listing pending orders across all buyers. Each opens to its lines, where the owner can **edit box quantities** before approving (a buyer may order 10 boxes when 6 are in stock — approve as 6 rather than forcing a reject). Approve runs the transaction; reject records a reason. The approved order links to its sale, and the owner lands on that sale's printable invoice.
- The **dashboard** gains a "pending order" count card, wired to the new `Order` model — the base spec's dashboard row that Plan 3 deferred to here.

### Order approval (transactional)

When the owner approves, inside one MongoDB transaction, reusing the Sale plan's exact shape:

1. Re-read the order and every line's medicine *inside* `withTransaction`
2. For each line, deduct stock via `applyStockDelta` with the precondition in the update filter (so stock can never go negative — a bare `$inc` would, since Mongoose `min: 0` doesn't run on it)
3. Create the wholesale `Sale` (`paidPaisa: 0`, all due), with a fresh invoice number from `nextInvoiceSeq` in the same transaction
4. Set the order `status: "approved"`, `saleId`, `resolvedAt`

If any line is short and the owner hasn't reduced it enough, the transaction aborts and the owner sees which medicine is short and by how much — nothing is written, no invoice number is consumed on a committed sale. The owner adjusts and retries. Guarded against double-approval by a status check in the update filter, the same way `cancelSale` guards double-cancellation.

## Error handling

- **Insufficient stock on approval:** transaction aborts, owner sees the shortfall per medicine; he lowers quantities and retries.
- **Double approval / approving an already-resolved order:** the status guard in the filter rejects it; an approved order cannot be approved again.
- **A buyer touching another buyer's order:** rejected by the ownership check, not a 500.
- **Inactive buyer login:** rejected with the same generic message as a wrong password.
- **Empty cart, zero/negative/fractional box counts, malformed ids:** rejected at the action boundary with clean Banglish domain errors, the same convention as every other action.

## Testing

- **Unit / model:** order status transitions; price snapshotting onto order lines.
- **Integration:** the full approval transaction, including the insufficient-stock abort leaving stock, the order, and the invoice counter untouched; double-approval rejected; a rejected order creating no sale; a buyer cancelling his own pending order but not an approved one.
- **Authorization:** every buyer action rejects a non-buyer caller AND rejects a buyer touching another buyer's order; every admin order action rejects a buyer. The structural authorization test is extended to discover the new modules.
- **Consistency:** an approved order's sale appears in the due ledger and the report exactly like a wholesale sale made from the form — because it is one.

## Done when

- A buyer logs in with phone + password, browses at box rate, and submits an order that appears as pending on the owner's side
- The owner approves it (adjusting quantities if needed), stock drops, an invoice is created, and it shows up in reports and the due ledger like any wholesale sale
- The owner rejects an order with a reason, and no sale is created
- A buyer cancels his own pending order, and cannot cancel an approved one or touch another buyer's order
- Stock can never go negative through approval; no invoice number is reused
- The dashboard shows the pending-order count
