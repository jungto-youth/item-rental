export type Role = "member" | "admin";

export type ItemKind = "rental" | "consumable";
export type ItemLifecycle = "active" | "retired";

export type ItemStatus = "available" | "rented" | "repair";

export interface Item {
  id: string;
  name: string;
  category: string;
  location: string;
  description: string;
  tags: string[];
  kind: ItemKind;
  lifecycle: ItemLifecycle;
  total: number;
  available: number;
  repair: number;
  photos: string[];
}

export type ReservationStatus = "rented" | "returned" | "cancelled";

export interface Reservation {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  memberName: string;
  memberEmail: string;
  phone: string;
  rentedAt: string;
  returnedAt?: string;
  status: ReservationStatus;
  memo?: string;
  processedBy?: string;
  memberReturned?: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "user" | "admin";
  deactivated: boolean;
  activeRentals: number;
  infoDeleted?: boolean;
}

export interface AllowedEmail {
  email: string;
  note?: string;
  addedBy: string;
  addedAt: string;
}

export interface User {
  name: string;
  email: string;
  phone: string | null;
}

export function itemStatus(item: Item): ItemStatus {
  if (item.available > 0) return "available";
  if (item.repair > 0 && item.repair >= item.total) return "repair";
  return "rented";
}
