import {
  createContext,
  useContext,
  type ParentComponent,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
  initialAllowedEmails,
  initialItems,
  initialMembers,
  initialMyReservations,
  initialReservations,
  initialUser,
  POLICY_TODAY,
} from "./data/mock";
import type {
  AllowedEmail,
  Item,
  Member,
  Reservation,
  Role,
  User,
} from "./types";

const ROLE_KEY = "solid-preview-role";

function readRole(): Role {
  try {
    const stored = sessionStorage.getItem(ROLE_KEY);
    if (stored === "admin" || stored === "member") return stored;
  } catch {
    // file:// 등 저장소를 쓸 수 없는 환경에서는 기본값을 쓴다.
  }
  return "member";
}

interface State {
  role: Role;
  user: User;
  items: Item[];
  myReservations: Reservation[];
  reservations: Reservation[];
  members: Member[];
  allowedEmails: AllowedEmail[];
}

function createAppStore() {
  const [state, setState] = createStore<State>({
    role: readRole(),
    user: { ...initialUser },
    items: initialItems.map((item) => ({ ...item, photos: [...item.photos] })),
    myReservations: initialMyReservations.map((row) => ({ ...row })),
    reservations: initialReservations.map((row) => ({ ...row })),
    members: initialMembers.map((row) => ({ ...row })),
    allowedEmails: initialAllowedEmails.map((row) => ({ ...row })),
  });

  const setRole = (role: Role) => {
    setState("role", role);
    try {
      sessionStorage.setItem(ROLE_KEY, role);
    } catch {
      // 저장 실패는 무시한다.
    }
  };

  const isAdmin = () => state.role === "admin";

  const updateUser = (name: string, phone: string | null) => {
    setState("user", { name, phone });
  };

  const findItem = (id: string) => state.items.find((item) => item.id === id);

  const changeAvailable = (itemId: string, delta: number) => {
    setState(
      "items",
      (item) => item.id === itemId,
      produce((item) => {
        item.available = Math.max(
          0,
          Math.min(item.total - item.repair, item.available + delta),
        );
      }),
    );
  };

  const rentItem = (itemId: string, qty: number, memo: string) => {
    const item = findItem(itemId);
    if (!item || item.available < qty) return null;

    changeAvailable(itemId, -qty);
    const reservation: Reservation = {
      id: `my-${Date.now()}`,
      itemId: item.id,
      itemName: item.name,
      qty,
      memberName: state.user.name,
      memberEmail: state.user.email,
      phone: state.user.phone ?? "",
      rentedAt: POLICY_TODAY,
      status: "rented",
      memo: memo.trim() || undefined,
    };
    setState("myReservations", (rows) => [reservation, ...rows]);
    return reservation;
  };

  const returnMyReservation = (id: string) => {
    const row = state.myReservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState(
      "myReservations",
      (entry) => entry.id === id,
      produce((entry) => {
        entry.status = "returned";
        entry.returnedAt = POLICY_TODAY;
      }),
    );
    changeAvailable(row.itemId, row.qty);
  };

  const cancelMyReservation = (id: string) => {
    const row = state.myReservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState(
      "myReservations",
      (entry) => entry.id === id,
      produce((entry) => {
        entry.status = "cancelled";
      }),
    );
    changeAvailable(row.itemId, row.qty);
  };

  const returnReservation = (id: string) => {
    const row = state.reservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState(
      "reservations",
      (entry) => entry.id === id,
      produce((entry) => {
        entry.status = "returned";
        entry.returnedAt = POLICY_TODAY;
        entry.processedBy = state.user.name;
      }),
    );
    changeAvailable(row.itemId, row.qty);
  };

  const setMemberRole = (id: string, role: Member["role"]) => {
    setState(
      "members",
      (member) => member.id === id,
      produce((member) => {
        member.role = role;
      }),
    );
  };

  const withdrawMember = (id: string) => {
    setState(
      "members",
      (member) => member.id === id,
      produce((member) => {
        member.deactivated = true;
      }),
    );
  };

  const deleteMemberInfo = (id: string) => {
    setState(
      "members",
      (member) => member.id === id,
      produce((member) => {
        member.name = "—";
        member.email = "";
        member.phone = null;
        member.infoDeleted = true;
        member.activeRentals = 0;
      }),
    );
  };

  const addAllowedEmail = (email: string, note: string) => {
    setState("allowedEmails", (rows) => [
      {
        email,
        note: note.trim() || undefined,
        addedBy: state.user.name,
        addedAt: POLICY_TODAY,
      },
      ...rows,
    ]);
  };

  const removeAllowedEmail = (email: string) => {
    setState("allowedEmails", (rows) =>
      rows.filter((row) => row.email !== email),
    );
  };

  const updateItem = (id: string, patch: Partial<Item>) => {
    setState("items", (item) => item.id === id, patch);
  };

  const addItem = (item: Item) => {
    setState("items", (rows) => [item, ...rows]);
  };

  const removeItem = (id: string) => {
    setState("items", (rows) => rows.filter((item) => item.id !== id));
  };

  return {
    state,
    isAdmin,
    setRole,
    updateUser,
    findItem,
    rentItem,
    returnMyReservation,
    cancelMyReservation,
    returnReservation,
    setMemberRole,
    withdrawMember,
    deleteMemberInfo,
    addAllowedEmail,
    removeAllowedEmail,
    updateItem,
    addItem,
    removeItem,
  };
}

export type AppStore = ReturnType<typeof createAppStore>;

const StoreContext = createContext<AppStore>();

export const StoreProvider: ParentComponent = (props) => {
  const store = createAppStore();
  return (
    <StoreContext.Provider value={store}>{props.children}</StoreContext.Provider>
  );
};

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreProvider 안에서만 useAppStore 를 쓸 수 있어요");
  return store;
}
