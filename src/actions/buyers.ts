"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { BuyerModel, type PublicBuyerDoc } from "@/models/Buyer";
import { actionResult, type ActionResult } from "@/lib/actionResult";

export type BuyerInput = {
  name: string;
  shopName: string;
  phone: string;
  address: string;
};

/** Excludes the password hash from every read. See PublicBuyerDoc. */
const PUBLIC_FIELDS = "-passwordHash";

/**
 * Network-reachable trust boundary — same convention as
 * src/actions/medicines.ts. Every field is validated before it reaches
 * Mongoose so a malformed payload fails with a clean domain error.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function validate(input: BuyerInput): void {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Buyer er nam dorkar");
  }
  if (typeof input.phone !== "string" || !input.phone.trim()) {
    throw new Error("Phone number dorkar");
  }
  toOptionalString(input.shopName, "shopName");
  toOptionalString(input.address, "address");
}

function toFields(input: BuyerInput) {
  return {
    name: input.name.trim(),
    shopName: toOptionalString(input.shopName, "shopName").trim(),
    phone: input.phone.trim(),
    address: toOptionalString(input.address, "address").trim(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

export async function createBuyer(
  input: BuyerInput,
  password: string,
): Promise<ActionResult<Serialized<PublicBuyerDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    validate(input);

    // hashPassword enforces the 6-character minimum and throws below it.
    const passwordHash = await hashPassword(password);

    try {
      const buyer = await BuyerModel.create({
        ...toFields(input),
        passwordHash,
      });
      revalidatePath("/buyers");
      const { passwordHash: _omit, ...rest } = buyer.toObject();
      return toPlain(rest as PublicBuyerDoc);
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

export async function updateBuyer(
  id: string,
  input: BuyerInput,
): Promise<ActionResult<Serialized<PublicBuyerDoc>>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();
    validate(input);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Buyer pawa jay ni");
    }

    try {
      // passwordHash is deliberately absent: passwords change only through
      // setBuyerPassword, never through the buyer form.
      const buyer = await BuyerModel.findByIdAndUpdate(
        id,
        { $set: toFields(input) },
        { returnDocument: "after", runValidators: true },
      )
        .select(PUBLIC_FIELDS)
        .lean<PublicBuyerDoc>();

      if (!buyer) throw new Error("Buyer pawa jay ni");
      revalidatePath("/buyers");
      return toPlain(buyer);
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

export async function setBuyerPassword(
  id: string,
  password: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Buyer pawa jay ni");
    }

    const passwordHash = await hashPassword(password);
    const result = await BuyerModel.updateOne(
      { _id: id },
      { $set: { passwordHash } },
    );
    if (result.matchedCount === 0) throw new Error("Buyer pawa jay ni");
  });
}

export async function setBuyerActive(
  id: string,
  active: boolean,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Buyer pawa jay ni");
    }
    if (typeof active !== "boolean") {
      throw new Error("active must be a boolean");
    }

    // Deactivated, never deleted: past sales and due history reference buyers.
    const result = await BuyerModel.updateOne(
      { _id: id },
      { $set: { active } },
    );
    if (result.matchedCount === 0) throw new Error("Buyer pawa jay ni");
    revalidatePath("/buyers");
  });
}

export async function listBuyers(
  includeInactive = false,
): Promise<Serialized<PublicBuyerDoc>[]> {
  await requireAdminAction();
  await connectDb();

  const filter = includeInactive ? {} : { active: true };
  const buyers = await BuyerModel.find(filter)
    .select(PUBLIC_FIELDS)
    .sort({ name: 1 })
    .lean<PublicBuyerDoc[]>();
  return toPlainList(buyers);
}

export async function getBuyer(
  id: string,
): Promise<Serialized<PublicBuyerDoc> | null> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const buyer = await BuyerModel.findById(id)
    .select(PUBLIC_FIELDS)
    .lean<PublicBuyerDoc>();
  return buyer ? toPlain(buyer) : null;
}
