import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors";
import { createSupabaseStore } from "./supabase-store";
import type { Store } from "./store";

/**
 * Server-side Supabase client. Uses the secret key only.
 * The publishable key is not read and must not be sent to the browser.
 */
export function createClaimSupabaseClient(
  env: Record<string, string | undefined>,
): SupabaseClient {
  const url = env.SUPABASE_URL?.trim() ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) {
    throw new AppError(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before Claim can load data.",
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let storePromise: Promise<Store> | undefined;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = openStore().catch((error: unknown) => {
      storePromise = undefined;
      throw error;
    });
  }
  return storePromise;
}

async function openStore(): Promise<Store> {
  const store = createSupabaseStore(createClaimSupabaseClient(process.env));
  try {
    await store.seedClaimTypes();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/schema cache|could not find the table/i.test(message)) {
      throw new AppError(
        "Supabase is connected, but the Claim tables are missing. Run supabase/schema.sql in the Supabase SQL editor, then reload.",
      );
    }
    throw error;
  }
  return store;
}
