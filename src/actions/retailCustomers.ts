"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import {
  RetailCustomerModel,
  type RetailCustomerDoc,
} from "@/models/RetailCustomer";
import { actionResult, type ActionResult } from "@/lib/actionResult";

export type RetailCustomerInput = {
  name: string;
  phone: string;
};

/**
 * Network-reachable trust boundary — same convention as src/actions/buyers.ts.
 */
function validate(input: RetailCustomerInput): void {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Customer er nam dorkar");
  }
  if (typeof input.phone !== "string" || !input.phone.trim()) {
    throw new Error("Phone number dorkar");
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

/**
 * Every retail customer, name-sorted. The admin page hands the whole list to
 * the browser and filters it there (see filterBuyers) exactly like the
 * wholesale buyer list — these are the pharmacy's own walk-in regulars, a
 * list the owner scrolls, not a catalogue.
 */
export async function listRetailCustomers(): Promise<
  Serialized<RetailCustomerDoc>[]
> {
  await requireAdminAction();
  await connectDb();

  const customers = await RetailCustomerModel.find({})
    .sort({ name: 1 })
    .lean<RetailCustomerDoc[]>();
  return toPlainList(customers);
}

/**
 * Adds a customer the owner knows about before their first sale. The retail
 * counter also creates these implicitly (see writeRetailSale's upsert), so
 * the unique phone index is what keeps the two paths from ever producing two
 * records for one number.
 */
export async function createRetailCustomer(
  input: RetailCustomerInput,
): Promise<ActionResult<Serialized<RetailCustomerDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    validate(input);

    try {
      const customer = await RetailCustomerModel.create({
        name: input.name.trim(),
        phone: input.phone.trim(),
      });
      revalidatePath("/retail-customers");
      return toPlain(customer.toObject() as RetailCustomerDoc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error(
          `Ei phone number (${input.phone.trim()}) already exists`,
        );
      }
      throw error;
    }
  });
}

/**
 * Only the name is editable, deliberately.
 *
 * A retail customer has no id anywhere else in the system: Sale.buyerPhone
 * and RetailPayment.phone are what tie a sale and a payment to a person, and
 * retail dues are grouped by that phone string (see listRetailDues). Editing
 * the phone here would leave every past sale and payment behind under the old
 * number and silently split one person's baki into two. A wrong number is
 * fixed by adding the right one, not by rewriting history's key.
 */
export async function renameRetailCustomer(
  id: string,
  name: string,
): Promise<ActionResult<Serialized<RetailCustomerDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();

    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Customer er nam dorkar");
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Customer pawa jay ni");
    }

    const customer = await RetailCustomerModel.findByIdAndUpdate(
      id,
      { $set: { name: name.trim() } },
      { returnDocument: "after", runValidators: true },
    ).lean<RetailCustomerDoc>();

    if (!customer) throw new Error("Customer pawa jay ni");
    revalidatePath("/retail-customers");
    revalidatePath("/retail-due");
    return toPlain(customer);
  });
}
