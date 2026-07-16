# ABC Pharmacy — Management & Accounts Software

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation planning

## Overview

A web application for a Bangladeshi pharmacy that sells both wholesale (to ~8-10 regular buyers) and retail (over the counter). The owner manages medicines, stock, sales, and outstanding balances. Wholesale buyers log into a separate portal to place orders directly, which the owner approves before they become sales.

The pharmacy name is **"ABC Pharmacy"** as a placeholder. The real company name will replace it later by editing a single Settings record — no code changes.

## Goals

- Replace manual sales and due-balance bookkeeping with one system
- Let wholesale buyers place orders themselves instead of over the phone
- Print wholesale invoices on an 80mm thermal printer
- Keep box and pata (strip) stock reconciled automatically, with no possibility of drift

## Non-goals (explicitly out of scope for this phase)

These were considered and deliberately excluded. They are recorded here so a later phase can pick them up without re-litigating the decision.

- **Purchase entry with cost price.** Stock enters the system without a purchase price. Consequence: the system cannot report what was spent on inventory.
- **Profit reporting.** Follows from the above — with no cost price, profit cannot be computed. The `StockEntry` collection is the natural place to add a cost field later, and profit reporting becomes straightforward once it exists.
- **Expiry and batch tracking.** No expiry dates, no batch numbers, no expiry alerts.
- **Expense entry.** No rent, utility, or salary tracking.
- **Per-buyer pricing, quantity slabs, discounts by buyer.** One wholesale price for everyone.
- **Staff accounts.** Only the owner (admin) and wholesale buyers have logins.
- **Retail receipt printing.** Retail sales are recorded but nothing is printed.
- **Barcode scanning.** Medicines are found by typing the name.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Auth | Credentials-based sessions, two roles: `admin`, `buyer` |
| Printing | Browser print with 80mm CSS `@page` rules |
| Hosting | Vercel or Railway; Atlas M0 free tier is sufficient at this scale |

**Note on MongoDB:** approving an order must deduct stock, create a Sale, and assign an invoice number as one atomic unit. Atlas runs replica sets by default, so multi-document transactions are available and **must** be used for that flow. Partial writes here would corrupt the books.

## Data model

### Settings

Single document. The source of truth for pharmacy identity — every screen and invoice reads the name from here.

```
{ pharmacyName: "ABC Pharmacy", address, phone, invoicePrefix, updatedAt }
```

### Medicine

```
{
  name,              // searchable, indexed
  genericName,
  company,
  patasPerBox,       // e.g. 10
  boxPrice,          // wholesale rate, in Taka
  pataPrice,         // retail rate, in Taka
  stockPatas,        // canonical stock, always in patas
  lowStockThreshold, // in patas; drives the dashboard alert
  active
}
```

### StockEntry

```
{ medicineId, boxes, patasAdded, note, createdAt, createdBy }
```

`patasAdded = boxes × patasPerBox`, snapshotted at entry time so that later edits to `patasPerBox` don't retroactively rewrite history.

### Buyer

```
{ name, shopName, phone, address, passwordHash, active, createdAt }
```

No stored due balance — see "Due balance" below.

### Order

Placed by a buyer through the portal. Not a sale until approved.

```
{
  buyerId,
  items: [{ medicineId, medicineName, boxes, boxPrice }],  // price snapshotted at order time
  status: "pending" | "approved" | "rejected",
  rejectionReason,
  saleId,        // set once approved
  createdAt, resolvedAt
}
```

### Sale

The final record of a completed transaction.

```
{
  type: "retail" | "wholesale",
  buyerId,       // null for retail
  orderId,       // set if this sale came from a portal order
  invoiceNo,     // wholesale only; unique
  items: [{ medicineId, medicineName, unit: "box" | "pata", quantity, rate, lineTotal, patasDeducted }],
  subtotal, discount, total,
  paid, due,     // due = total − paid
  status: "active" | "cancelled",
  createdAt, cancelledAt, cancelReason
}
```

### Payment

A buyer paying down their outstanding balance.

```
{ buyerId, amount, note, createdAt, createdBy }
```

## Core logic

### Stock: entered in boxes, stored in patas, displayed as both

Stock is stored as a single number, `stockPatas`. This is the only stock number in the system.

- **Entry** is in boxes. The owner types "50 box Napa"; the system stores `500`.
- **Display** is always `box + pata`, derived on read: `499` patas with `patasPerBox: 10` renders as **"49 box 8 pata"**.
- **Wholesale sale** of 3 boxes deducts `3 × patasPerBox` patas.
- **Retail sale** of 2 patas deducts 2 patas.

Because both sale types decrement one number, box and pata counts can never disagree. There is no separate "broken strips" bucket to reconcile.

### Pricing

- Wholesale: `boxPrice × boxes`
- Retail: `pataPrice × patas`

Both rates live on the Medicine record. Rates are snapshotted onto Order and Sale line items, so changing a price later never rewrites past invoices.

**Discount** is a manual, per-invoice amount the owner enters on the wholesale sale screen. It is subtracted from the subtotal to give the total (`total = subtotal − discount`), and it appears as its own line on the printed invoice. It is entered as a flat Taka amount, not a percentage — the owner is deciding "let me knock 50 taka off this one", not applying a policy. Discount is not available on retail sales.

**Retail sales are always paid in full** (`paid = total`, `due = 0`). Only wholesale sales can carry a due balance, and only wholesale sales feed the due ledger. A retail customer walking out with credit is not a flow this system supports.

### Due balance — derived, never stored

A buyer's outstanding balance is computed on read:

```
due = Σ(active wholesale sales .due for buyer) − Σ(payments for buyer)
```

**Rationale:** a stored running balance that drifts once is wrong forever, and nobody notices until the numbers are challenged. Deriving it means the balance always reconciles against the underlying sales and payments by construction. At ~10 buyers this is trivially fast.

### Order approval (transactional)

When the owner approves a pending order, inside a single MongoDB transaction:

1. Re-check stock for every line item against current `stockPatas`
2. Decrement `stockPatas` for each medicine
3. Create the `Sale` with a freshly generated `invoiceNo`
4. Set order `status: "approved"` and link `saleId`

If any line has insufficient stock, the whole transaction aborts and the owner sees which medicine is short and how much is actually available.

The owner **may edit line quantities on the approval screen before approving** — a buyer may order 10 boxes when only 6 are in stock, and the sale should be able to go out as 6 rather than forcing a reject-and-reorder round trip. Edited quantities are recorded on the resulting Sale; the Order keeps what the buyer originally requested, so the difference stays visible.

### Invoice numbering

Sequential, prefixed from Settings (e.g. `ABC-000041`). Generated inside the approval/sale transaction via an atomic counter. Numbers are never reused, including for cancelled sales.

### Cancellation, not deletion

Sales are never deleted. Cancelling a sale sets `status: "cancelled"`, returns the stock, and drops it out of due and report calculations — but the record and its invoice number remain. Deleting rows from a book of accounts destroys the audit trail.

## Screens

### Admin

| Screen | Purpose |
|---|---|
| Dashboard | Today's sales total, pending order count, low-stock medicines, total outstanding due |
| Medicines | Add/edit: name, generic, company, patas per box, box rate, pata rate, low-stock threshold. Searchable list. |
| Stock in | Select medicine → enter boxes → save. Stock increases immediately. |
| Retail sale | Type-ahead name search → pick → enter patas → cart → total → save. No print. |
| Wholesale sale | Pick buyer → medicines + boxes → total → amount paid, remainder due → save → print invoice |
| Pending orders | Portal orders awaiting decision. Approve (deducts stock, creates invoice) or reject with a reason. |
| Buyers | Add/edit the ~8-10 wholesale profiles, set passwords, activate/deactivate |
| Due ledger | Outstanding balance per buyer; drill into a buyer for their full sale and payment history; record payments here |
| Reports | Sales by date range, retail and wholesale separated |
| Settings | Pharmacy name, address, phone, invoice prefix |

### Buyer portal

Deliberately minimal. A buyer can:

1. Browse and search medicines, seeing **box rate only**
2. Add box quantities to a cart and submit an order
3. See their own orders and each one's status (pending / approved / rejected)
4. See their own outstanding balance and payment history

A buyer cannot see stock levels, retail prices, other buyers, or any report.

### Invoice layout (80mm thermal)

Pharmacy name, address, phone (from Settings) → invoice number and date → buyer name and shop → item table (medicine | box | rate | total) → subtotal, discount, total → paid, due → total outstanding balance for this buyer. A print button opens the browser print dialog; an `@page { size: 80mm auto }` rule and a print stylesheet handle the formatting.

## Error handling

- **Insufficient stock on approval:** transaction aborts, owner sees the shortfall per medicine with actual available quantity
- **Double approval:** guarded by a status check inside the transaction; an already-resolved order cannot be approved again
- **Duplicate invoice numbers:** prevented by an atomic counter plus a unique index on `invoiceNo`
- **Inactive buyer:** cannot log in; existing orders and due history are preserved
- **Negative or zero quantities:** rejected at both the form and the model layer

## Testing

- **Unit:** box↔pata conversion and display formatting; due balance derivation across sales, payments, and cancellations; invoice number generation
- **Integration:** order approval transaction, including the insufficient-stock abort leaving stock untouched; sale cancellation returning stock and updating due; concurrent approval of the same order
- **Access control:** every buyer-portal route rejects cross-buyer data access; buyer role cannot reach admin routes

## Future phases

1. Purchase entry with cost price → unlocks profit reporting
2. Expiry tracking and alerts
3. Expense entry and net profit
4. Staff accounts with limited roles
5. Retail receipt printing
