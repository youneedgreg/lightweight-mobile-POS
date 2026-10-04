import {
  addItem,
  emptyCart,
  removeLine,
  setPriceTier,
  setQuantity,
  setUnitPrice,
  type Cart,
  type PriceTier,
} from "@liquor-pos/shared";
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";

import { getProductsByIds, type Customer, type Product, type Unit } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";

type Action =
  | { type: "add"; product: Product; unit: Unit | null }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "setPrice"; key: string; price: number }
  | { type: "remove"; key: string }
  /** Re-priced lines for a new tier; keeps everything else (e.g. the customer) as is. */
  | { type: "reprice"; cart: Cart }
  | { type: "clear" };

interface CartState {
  cart: Cart;
  customer: Customer | null;
}

type CustomerAction = { type: "setCustomer"; customer: Customer | null };

function reducer(state: CartState, action: Action | CustomerAction): CartState {
  switch (action.type) {
    case "add":
      return { ...state, cart: addItem(state.cart, action.product, action.unit) };
    case "setQuantity":
      return { ...state, cart: setQuantity(state.cart, action.key, action.quantity) };
    case "setPrice":
      return { ...state, cart: setUnitPrice(state.cart, action.key, action.price) };
    case "remove":
      return { ...state, cart: removeLine(state.cart, action.key) };
    case "reprice":
      return { ...state, cart: { ...state.cart, priceTier: action.cart.priceTier, lines: action.cart.lines } };
    case "setCustomer":
      return { ...state, customer: action.customer, cart: { ...state.cart, customerId: action.customer?.id ?? null } };
    case "clear":
      return { cart: emptyCart(), customer: null };
  }
}

interface CartContextValue {
  cart: Cart;
  customer: Customer | null;
  add: (product: Product, unit?: Unit | null) => void;
  setQuantity: (key: string, quantity: number) => void;
  setPrice: (key: string, price: number) => void;
  remove: (key: string) => void;
  /** Re-prices the whole cart for a tier (retail/wholesale). */
  changeTier: (tier: PriceTier) => Promise<void>;
  /** Attaches a customer and switches to their price tier. */
  chooseCustomer: (customer: Customer | null) => Promise<void>;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** The cart being rung up. In memory only: a sale is persisted when it is completed. */
export function CartProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ cart: emptyCart(), customer: null }));

  const changeTier = useCallback(
    async (tier: PriceTier) => {
      const products = await getProductsByIds(db, [...new Set(state.cart.lines.map((line) => line.productId))]);
      const cart = setPriceTier(state.cart, tier, (line) => {
        const product = products.get(line.productId);
        if (!product) return null;
        const unit = line.productUnitId ? (product.units.find((u) => u.id === line.productUnitId) ?? null) : null;
        return { product, unit };
      });
      dispatch({ type: "reprice", cart });
    },
    [db, state.cart],
  );

  const chooseCustomer = useCallback(
    async (customer: Customer | null) => {
      dispatch({ type: "setCustomer", customer });
      const tier = customer?.priceTier ?? "RETAIL";
      if (tier !== state.cart.priceTier) await changeTier(tier);
    },
    [changeTier, state.cart.priceTier],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart: state.cart,
      customer: state.customer,
      add: (product, unit = null) => dispatch({ type: "add", product, unit }),
      setQuantity: (key, quantity) => dispatch({ type: "setQuantity", key, quantity }),
      setPrice: (key, price) => dispatch({ type: "setPrice", key, price }),
      remove: (key) => dispatch({ type: "remove", key }),
      changeTier,
      chooseCustomer,
      clear: () => dispatch({ type: "clear" }),
    }),
    [state, changeTier, chooseCustomer],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
