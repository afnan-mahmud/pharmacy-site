"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approve hoyeche",
  rejected: "Reject hoyeche",
  cancelled: "Cancel kora",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-teal-700",
  rejected: "text-red-600",
  cancelled: "text-slate-400",
};

export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  rejectReason: string;
  items: { medicineName: string; boxes: number; boxPricePaisa: number }[];
};

export function BuyerOrderList({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setError("");
    setCancellingId(id);
    try {
      await cancelMyOrder(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setCancellingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="mb-3 text-lg font-semibold text-slate-900">Amar order</h1>
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Ekhono kono order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Amar order</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * i.boxes,
          0,
        );
        return (
          <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {formatDhakaDate(order.createdAt)}
              </span>
              <span className={`text-sm font-medium ${STATUS_CLASS[order.status]}`}>
                {STATUS_LABEL[order.status]}
              </span>
            </div>

            <ul className="mt-2 text-sm text-slate-700">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>{item.medicineName} × {item.boxes} box</span>
                  <span>{formatTaka(item.boxPricePaisa * item.boxes)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-sm font-medium">Mot {formatTaka(total)}</span>
              {order.status === "pending" && (
                <button onClick={() => handleCancel(order.id)}
                  disabled={cancellingId === order.id}
                  className="text-sm text-slate-500 hover:text-red-600 disabled:opacity-50">
                  Cancel koro
                </button>
              )}
            </div>

            {order.status === "rejected" && order.rejectReason && (
              <p className="mt-2 text-xs text-red-600">Karon: {order.rejectReason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
