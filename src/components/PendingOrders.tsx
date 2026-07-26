"use client";

import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";
import type { Serialized } from "@/lib/serialize";
import type { OrderDoc } from "@/models/Order";
import Link from "next/link";
import { unitLabelsFor } from "@/lib/unitLabels";
import { approveOrder, rejectOrder } from "@/actions/adminOrders";
import { useState } from "react";

export type PendingOrderRow = Serialized<OrderDoc>;

export function PendingOrders({
  orders,
}: {
  orders: PendingOrderRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printSaleId, setPrintSaleId] = useState<string | null>(null);

  const handleReject = async (orderId: string) => {
    const reason = window.prompt("Reject korar karon likhun:");
    if (!reason) return;

    setBusyId(orderId);
    try {
      const res = await rejectOrder(orderId, reason);
      if (!res.ok) alert(res.error);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (order: PendingOrderRow) => {
    // 1-click approve cannot price custom items.
    const hasCustomItems = order.items.some(i => !i.medicineId);
    if (hasCustomItems) {
      alert("Ei order e short items ase. Apnake Edit e click kore dam boshiye approve korte hobe.");
      return;
    }

    if (!window.confirm("Apni ki order ti approve korte chan?")) return;

    setBusyId(order._id);
    try {
      const approvalItems = order.items.map(item => ({
        medicineId: item.medicineId || undefined,
        boxes: item.boxes,
      }));

      const res = await approveOrder(order._id, approvalItems);
      if (res.ok) {
        setPrintSaleId(res.data._id);
      } else {
        alert(res.error);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const HeroHeader = () => (
    <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
      <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
      <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>
      <div className="relative z-10">
        <h1 className="mb-2 font-display text-3xl font-extrabold leading-tight">
          Pending Orders
        </h1>
        <p className="text-sm text-white/90">
          Opekkhay thaka orders approve korun.
        </p>
      </div>
    </section>
  );

  if (orders.length === 0) {
    return (
      <div className="flex flex-col pb-6">
        <HeroHeader />
        <p className="rounded-3xl border border-line bg-surface p-6 text-center text-muted shadow-md">
          Kono pending order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-6 space-y-4">
      <HeroHeader />

      {orders.map((order) => {
        // Calculate the total based on the requested boxes and snapshot price
        const totalPaisa = order.items.reduce(
          (sum, item) => sum + item.boxPricePaisa * item.boxes,
          0
        );

        return (
          <div key={order._id} className="rounded-3xl border border-line bg-surface p-5 shadow-md mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-medium text-ink">{order.buyerName}</div>
                <div className="text-xs text-muted">{order.buyerShopName}</div>
              </div>
              <span className="text-xs text-muted">{formatDhakaDateTime(order.createdAt)}</span>
            </div>
            
            <div className="mb-4">
              <div className="rounded-xl border border-line bg-canvas overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface">
                    <tr className="border-b border-line text-muted">
                      <th className="py-2 px-3 font-medium">Item</th>
                      <th className="py-2 px-3 font-medium text-right">Qty</th>
                      <th className="py-2 px-3 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {order.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 text-ink">
                          {item.medicineName}
                          {!item.medicineId && <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800">Short Item</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-ink whitespace-nowrap">
                          {item.boxes} {unitLabelsFor(item.form).outer}
                        </td>
                        <td className="py-2 px-3 text-right text-muted whitespace-nowrap">
                          {item.medicineId ? formatTaka(item.boxes * item.boxPricePaisa) : "Pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface">
                    <tr className="border-t border-line font-bold text-ink">
                      <td className="py-2 px-3">Total</td>
                      <td className="py-2 px-3 text-right">{order.items.length} items</td>
                      <td className="py-2 px-3 text-right text-brand-strong">{formatTaka(totalPaisa)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-line">
              <button
                onClick={() => handleReject(order._id)}
                disabled={busyId === order._id}
                className="rounded-full bg-red-100 px-5 py-2 text-sm font-bold text-red-600 hover:bg-red-200 transition disabled:opacity-50"
              >
                Reject
              </button>
              
              <Link
                href={`/orders/${order._id}/edit`}
                className="rounded-full bg-amber-100 px-5 py-2 text-sm font-bold text-amber-700 hover:bg-amber-200 transition flex items-center justify-center"
              >
                Edit
              </Link>
              
              <button
                onClick={() => handleApprove(order)}
                disabled={busyId === order._id}
                className="rounded-full bg-green-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-green-500/30 hover:bg-green-600 transition disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          </div>
        );
      })}

      {/* Invoice Print Popup */}
      {printSaleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl relative text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 text-3xl">
              ✓
            </div>
            <h3 className="font-display text-xl font-bold text-ink mb-2">Order Approved!</h3>
            <p className="text-sm text-muted mb-6">Apnar order ti successfully approve hoyeche.</p>
            
            <div className="flex flex-col gap-3">
              <Link
                href={`/invoice/${printSaleId}`}
                target="_blank"
                className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-brand-strong"
                onClick={() => setPrintSaleId(null)}
              >
                Invoice Print Korun
              </Link>
              <button 
                onClick={() => setPrintSaleId(null)}
                className="w-full rounded-2xl bg-canvas px-4 py-3 text-sm font-bold text-ink border border-line transition hover:bg-surface-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
