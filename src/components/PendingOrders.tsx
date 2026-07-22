"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveOrder, rejectOrder } from "@/actions/adminOrders";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";

export type PendingOrderRow = {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerShopName: string;
  items: {
    medicineId: string;
    medicineName: string;
    form: string;
    boxes: number;
    boxPricePaisa: number;
  }[];
};

export function PendingOrders({ orders }: { orders: PendingOrderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Editable box quantities, keyed by orderId → medicineId → boxes.
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(
      orders.map((o) => [
        o.id,
        Object.fromEntries(o.items.map((i) => [i.medicineId, i.boxes])),
      ]),
    ),
  );

  function setBoxes(orderId: string, medicineId: string, boxes: number) {
    setEdits((current) => ({
      ...current,
      [orderId]: { ...current[orderId], [medicineId]: boxes },
    }));
  }

  async function handleApprove(order: PendingOrderRow) {
    setError("");
    setBusyId(order.id);
    try {
      // Every ordered line goes through, zeroes included: a line the owner
      // cannot supply stays on the invoice at 0 so the buyer's paper shows
      // what was asked for. Filtering them out here is what used to make an
      // out-of-stock product vanish from the invoice without explanation.
      const items = order.items.map((i) => ({
        medicineId: i.medicineId,
        boxes: edits[order.id]?.[i.medicineId] ?? i.boxes,
      }));
      const sale = await approveOrder(order.id, items);
      router.push(`/invoice/${sale._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusyId(null);
    }
  }

  async function handleReject(order: PendingOrderRow) {
    const reason = window.prompt("Reject korar karon:");
    if (reason === null) return;
    setError("");
    setBusyId(order.id);
    try {
      await rejectOrder(order.id, reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusyId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="mb-3 font-display text-lg font-extrabold text-ink">Pending Order</h1>
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-muted shadow-sm">
          Kono pending order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-extrabold text-ink">Pending Order</h1>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * (edits[order.id]?.[i.medicineId] ?? i.boxes),
          0,
        );
        // An approval where every line is zero bills nothing for nothing;
        // writeWholesaleSale rejects it, so don't let it be sent.
        const hasBillableLine = order.items.some(
          (i) => (edits[order.id]?.[i.medicineId] ?? i.boxes) > 0,
        );
        return (
          <div key={order.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-ink">{order.buyerName}</div>
                <div className="text-xs text-muted">{order.buyerShopName}</div>
              </div>
              <span className="text-xs text-muted">{formatDhakaDateTime(order.createdAt)}</span>
            </div>

            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1">Medicine</th>
                  <th className="py-1">Pack rate</th>
                  <th className="py-1">Order</th>
                  <th className="py-1">Approve koto</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const boxes = edits[order.id]?.[item.medicineId] ?? item.boxes;
                  const labels = unitLabelsFor(item.form);
                  return (
                    <tr
                      key={item.medicineId}
                      className={`border-t border-line ${boxes === 0 ? "opacity-50" : ""}`}
                    >
                      <td className="py-2 font-medium text-ink">{item.medicineName}</td>
                      <td className="py-2">{formatTaka(item.boxPricePaisa)}</td>
                      <td className="py-2 text-muted">
                        {item.boxes} {labels.outer}
                      </td>
                      <td className="py-2">
                        <input type="number" min={0} value={boxes}
                          onChange={(e) =>
                            setBoxes(order.id, item.medicineId, parseQuantityInput(e.target.value, 0))
                          }
                          className="w-20 rounded-lg border border-line px-2 py-1" />
                        <span className="ml-1 text-xs text-muted">{labels.outer}</span>
                        {boxes === 0 && (
                          <div className="text-[11px] font-medium text-muted">
                            bill hobe na
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right">{formatTaka(item.boxPricePaisa * boxes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="font-medium">
                Mot {formatTaka(total)}
                {!hasBillableLine && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    — shob line 0, approve kora jabe na
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button onClick={() => handleReject(order)} disabled={busyId === order.id}
                  className="rounded-lg border border-danger/50 px-4 py-2 text-sm text-danger hover:bg-danger-bg disabled:opacity-50">
                  Reject
                </button>
                <button onClick={() => handleApprove(order)}
                  disabled={busyId === order.id || !hasBillableLine}
                  className="rounded-full bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busyId === order.id ? "Wait..." : "Approve ar invoice"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
