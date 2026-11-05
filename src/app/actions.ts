"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listClaimTypes } from "../lib/catalog";
import {
  applyFee,
  createClaim,
  resolveClaim,
  sendWarning,
  waiveClaim,
} from "../lib/claims";
import { getDb } from "../lib/db";
import { createDriver, updateDriver } from "../lib/drivers";
import { AppError } from "../lib/errors";
import {
  claimIdFromForm,
  claimInputFromForm,
  driverInputFromForm,
  noteFromForm,
} from "../lib/forms";
import { createMailer } from "../lib/mailer";
import {
  alterationFromForm,
  alterLoad,
  arriveLoad,
  completeFromForm,
  confirmLoad,
  createLoad,
  inboundDataDir,
  loadIdFromForm,
  receiveLoad,
  receivingFromForm,
  startFromForm,
} from "../lib/loads";

function bail(path: string, error: unknown): never {
  if (error instanceof AppError) {
    redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  }
  throw error;
}

function refreshClaim(id: number): void {
  revalidatePath("/open");
  revalidatePath("/claims");
  revalidatePath(`/claims/${id}`);
  revalidatePath("/drivers");
}

export async function saveDriverAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const db = getDb();
  const idRaw = String(formData.get("id") ?? "").trim();
  let savedId: number | undefined;
  try {
    const input = driverInputFromForm(formData, listClaimTypes(db));
    if (idRaw) {
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id <= 0) return { error: "Driver not found." };
      updateDriver(db, id, input);
      savedId = id;
    } else {
      savedId = createDriver(db, input);
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  revalidatePath("/drivers");
  revalidatePath(`/drivers/${savedId}`);
  revalidatePath("/claims/new");
  redirect(`/drivers/${savedId}?notice=${encodeURIComponent("Driver saved.")}`);
}

export async function createClaimAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const db = getDb();
  let claimId: number | undefined;
  try {
    claimId = createClaim(db, claimInputFromForm(formData));
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshClaim(claimId);
  redirect(`/claims/${claimId}?notice=${encodeURIComponent("Claim recorded. No email has been sent.")}`);
}

export async function sendWarningAction(formData: FormData): Promise<void> {
  const db = getDb();
  let id = 0;
  try {
    id = claimIdFromForm(formData);
    await sendWarning(db, id, createMailer(process.env));
  } catch (error) {
    bail(id > 0 ? `/claims/${id}` : "/claims", error);
  }
  refreshClaim(id);
  redirect(`/claims/${id}?notice=${encodeURIComponent("Warning recorded.")}`);
}

export async function applyFeeAction(formData: FormData): Promise<void> {
  const db = getDb();
  let id = 0;
  try {
    id = claimIdFromForm(formData);
    applyFee(db, id);
  } catch (error) {
    bail(id > 0 ? `/claims/${id}` : "/claims", error);
  }
  refreshClaim(id);
  redirect(`/claims/${id}?notice=${encodeURIComponent("Fee applied from the contract.")}`);
}

export async function resolveClaimAction(formData: FormData): Promise<void> {
  const db = getDb();
  let id = 0;
  try {
    id = claimIdFromForm(formData);
    resolveClaim(db, id, noteFromForm(formData));
  } catch (error) {
    bail(id > 0 ? `/claims/${id}` : "/claims", error);
  }
  refreshClaim(id);
  redirect(`/claims/${id}?notice=${encodeURIComponent("Claim resolved.")}`);
}

function refreshLoad(id: number): void {
  revalidatePath("/");
  revalidatePath("/inbound");
  revalidatePath(`/inbound/${id}`);
}

export async function createLoadAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  let id = 0;
  try {
    id = createLoad(inboundDataDir(), receivingFromForm(formData));
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshLoad(id);
  redirect(`/inbound/${id}?notice=${encodeURIComponent("Delivery saved. It is New.")}`);
}

export async function confirmLoadAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  let id = 0;
  try {
    id = loadIdFromForm(formData);
    confirmLoad(inboundDataDir(), id);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshLoad(id);
  redirect(`/inbound/${id}?notice=${encodeURIComponent("Delivery confirmed.")}`);
}

export async function arriveLoadAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  let id = 0;
  try {
    id = loadIdFromForm(formData);
    arriveLoad(inboundDataDir(), id);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshLoad(id);
  redirect(`/inbound/${id}?notice=${encodeURIComponent("Delivery arrived.")}`);
}

export async function receiveLoadAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  let id = 0;
  try {
    id = loadIdFromForm(formData);
    receiveLoad(inboundDataDir(), id, startFromForm(formData), completeFromForm(formData));
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshLoad(id);
  redirect(
    `/inbound/${id}?notice=${encodeURIComponent("Delivery received. Unload, sort, and putaway are recorded.")}`,
  );
}

export async function alterLoadAction(
  _previous: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  let id = 0;
  try {
    id = loadIdFromForm(formData);
    alterLoad(inboundDataDir(), id, alterationFromForm(formData));
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  refreshLoad(id);
  redirect(`/inbound/${id}?notice=${encodeURIComponent("Delivery altered.")}`);
}

export async function waiveClaimAction(formData: FormData): Promise<void> {
  const db = getDb();
  let id = 0;
  try {
    id = claimIdFromForm(formData);
    waiveClaim(db, id, noteFromForm(formData));
  } catch (error) {
    bail(id > 0 ? `/claims/${id}` : "/claims", error);
  }
  refreshClaim(id);
  redirect(`/claims/${id}?notice=${encodeURIComponent("Claim waived. No fee was applied.")}`);
}
