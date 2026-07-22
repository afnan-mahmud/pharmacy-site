"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";
import { unitLabelsFor } from "@/lib/unitLabels";
import { card, pageTitle, errorBox } from "@/components/ui";

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: "Pending", cls: "bg-warn-bg text-warn", dot: "bg-warn" },
  approved: {
    label: "Approve hoyeche",
    cls: "bg-brand-tint-2 text-brand-strong",
    dot: "bg-brand",
  },
  rejected: { label: "Reject hoyeche", cls: "bg-danger-bg text-danger", dot: "bg-danger" },
  cancelled: { label: "Cancel kora", cls: "bg-line text-muted", dot: "bg-muted" },
};

export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  rejectReason: string;
  items: { medicineName: string; form: string; boxes: number; boxPricePaisa: number }[];
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
      <div className="space-y-3">
        <h1 className={pageTitle}>Amar order</h1>
        <p className={`${card} p-8 text-center text-sm text-muted`}>
          Ekhono kono order nai. Order menu theke medicine order koro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className={pageTitle}>Amar order</h1>
      {error && <p role="alert" className={errorBox}>{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * i.boxes,
          0,
        );
        const s = STATUS[order.status] ?? STATUS.pending;
        return (
          <div key={order.id} className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">
                {formatDhakaDate(order.createdAt)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            </div>

            <ul className="mt-3 space-y-1 text-sm text-ink">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    {item.medicineName}{" "}
                    <span className="text-muted">
                      × {item.boxes} {unitLabelsFor(item.form).outer}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatTaka(item.boxPricePaisa * item.boxes)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="font-display text-sm font-bold text-ink">
                Mot {formatTaka(total)}
              </span>
              {order.status === "pending" && (
                <button
                  onClick={() => handleCancel(order.id)}
                  disabled={cancellingId === order.id}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                >
                  Cancel koro
                </button>
              )}
            </div>

            {order.status === "rejected" && order.rejectReason && (
              <p className="mt-2 rounded-lg bg-danger-bg px-3 py-1.5 text-xs text-danger">
                Karon: {order.rejectReason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
