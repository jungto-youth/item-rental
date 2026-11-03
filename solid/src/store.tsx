import {
  createContext,
  createStore,
  useContext,
  type ParentComponent,
} from "solid-js";
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
    setState((draft) => {
      draft.role = role;
    });
    try {
      sessionStorage.setItem(ROLE_KEY, role);
    } catch {
      // 저장 실패는 무시한다.
    }
  };

  const isAdmin = () => state.role === "admin";

  const updateUser = (name: string, phone: string | null) => {
    setState((draft) => {
      draft.user.name = name;
      draft.user.phone = phone;
    });
  };

  const findItem = (id: string) => state.items.find((item) => item.id === id);

  const changeAvailable = (itemId: string, delta: number) => {
    setState((draft) => {
      const item = draft.items.find((entry) => entry.id === itemId);
      if (!item) return;
      item.available = Math.max(
        0,
        Math.min(item.total - item.repair, item.available + delta),
      );
    });
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
    setState((draft) => {
      draft.myReservations.unshift(reservation);
    });
    return reservation;
  };

  const returnMyReservation = (id: string) => {
    const row = state.myReservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState((draft) => {
      const entry = draft.myReservations.find((item) => item.id === id);
      if (!entry) return;
      entry.status = "returned";
      entry.returnedAt = POLICY_TODAY;
    });
    changeAvailable(row.itemId, row.qty);
  };

  const cancelMyReservation = (id: string) => {
    const row = state.myReservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState((draft) => {
      const entry = draft.myReservations.find((item) => item.id === id);
      if (!entry) return;
      entry.status = "cancelled";
    });
    changeAvailable(row.itemId, row.qty);
  };

  const returnReservation = (id: string) => {
    const row = state.reservations.find((entry) => entry.id === id);
    if (!row || row.status !== "rented") return;
    setState((draft) => {
      const entry = draft.reservations.find((item) => item.id === id);
      if (!entry) return;
      entry.status = "returned";
      entry.returnedAt = POLICY_TODAY;
      entry.processedBy = state.user.name;
    });
    changeAvailable(row.itemId, row.qty);
  };

  const setMemberRole = (id: string, role: Member["role"]) => {
    setState((draft) => {
      const member = draft.members.find((entry) => entry.id === id);
      if (member) member.role = role;
    });
  };

  const withdrawMember = (id: string) => {
    setState((draft) => {
      const member = draft.members.find((entry) => entry.id === id);
      if (member) member.deactivated = true;
    });
  };

  const deleteMemberInfo = (id: string) => {
    setState((draft) => {
      const member = draft.members.find((entry) => entry.id === id);
      if (!member) return;
      member.name = "—";
      member.email = "";
      member.phone = null;
      member.infoDeleted = true;
      member.activeRentals = 0;
    });
  };

  const addAllowedEmail = (email: string, note: string) => {
    setState((draft) => {
      draft.allowedEmails.unshift({
        email,
        note: note.trim() || undefined,
        addedBy: state.user.name,
        addedAt: POLICY_TODAY,
      });
    });
  };

  const removeAllowedEmail = (email: string) => {
    setState((draft) => {
      const index = draft.allowedEmails.findIndex((row) => row.email === email);
      if (index >= 0) draft.allowedEmails.splice(index, 1);
    });
  };

  const updateItem = (id: string, patch: Partial<Item>) => {
    setState((draft) => {
      const item = draft.items.find((entry) => entry.id === id);
      if (item) Object.assign(item, patch);
    });
  };

  const addItem = (item: Item) => {
    setState((draft) => {
      draft.items.unshift(item);
    });
  };

  const removeItem = (id: string) => {
    setState((draft) => {
      const index = draft.items.findIndex((item) => item.id === id);
      if (index >= 0) draft.items.splice(index, 1);
    });
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
  return <StoreContext value={store}>{props.children}</StoreContext>;
};

export function useAppStore() {
  return useContext(StoreContext);
}
