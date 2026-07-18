"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveOrder, rejectOrder } from "@/actions/adminOrders";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";

export type PendingOrderRow = {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerShopName: string;
  items: { medicineId: string; medicineName: string; boxes: number; boxPricePaisa: number }[];
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
      const items = order.items
        .map((i) => ({ medicineId: i.medicineId, boxes: edits[order.id]?.[i.medicineId] ?? i.boxes }))
        .filter((i) => i.boxes > 0);
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
        <h1 className="mb-3 text-lg font-semibold text-slate-900">Pending Order</h1>
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Kono pending order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Pending Order</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * (edits[order.id]?.[i.medicineId] ?? i.boxes),
          0,
        );
        return (
          <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">{order.buyerName}</div>
                <div className="text-xs text-slate-500">{order.buyerShopName}</div>
              </div>
              <span className="text-xs text-slate-500">{formatDhakaDateTime(order.createdAt)}</span>
            </div>

            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1">Medicine</th>
                  <th className="py-1">Box rate</th>
                  <th className="py-1">Order</th>
                  <th className="py-1">Approve koto box</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const boxes = edits[order.id]?.[item.medicineId] ?? item.boxes;
                  return (
                    <tr key={item.medicineId} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.medicineName}</td>
                      <td className="py-2">{formatTaka(item.boxPricePaisa)}</td>
                      <td className="py-2 text-slate-500">{item.boxes}</td>
                      <td className="py-2">
                        <input type="number" min={0} value={boxes}
                          onChange={(e) => setBoxes(order.id, item.medicineId, Number(e.target.value))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                      </td>
                      <td className="py-2 text-right">{formatTaka(item.boxPricePaisa * boxes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-medium">Mot {formatTaka(total)}</span>
              <div className="flex gap-2">
                <button onClick={() => handleReject(order)} disabled={busyId === order.id}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Reject
                </button>
                <button onClick={() => handleApprove(order)} disabled={busyId === order.id}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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
