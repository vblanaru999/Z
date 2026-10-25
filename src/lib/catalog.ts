import type { Store } from "./store";
import type { ClaimType } from "./types";

export const CLAIM_TYPE_SEEDS: readonly {
  code: string;
  label: string;
  description: string;
}[] = [
  {
    code: "order_not_closed",
    label: "Order not closed in the app",
    description: "The order was left open in the driver app after the stop.",
  },
  {
    code: "label_not_scanned",
    label: "Delivery label not scanned",
    description: "The delivery label was not scanned at the stop.",
  },
  {
    code: "poor_delivery_photo",
    label: "Poor or missing delivery photo attached to the order",
    description:
      "The order has no delivery photo, or the photo does not show the delivery.",
  },
];

export function seedClaimTypes(store: Store): Promise<void> {
  return store.seedClaimTypes();
}

export function listClaimTypes(store: Store): Promise<ClaimType[]> {
  return store.listClaimTypes();
}

export function getClaimType(store: Store, id: number): Promise<ClaimType | undefined> {
  return store.getClaimType(id);
}
