import "../global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";

import { AuthProvider, useAuth } from "@/auth/auth-provider";
import { DatabaseProvider } from "@/db/database-provider";
import { CartProvider } from "@/pos/cart-provider";
import { ShiftProvider } from "@/pos/shift-provider";
import { SyncProvider } from "@/sync/sync-provider";

void SplashScreen.preventAutoHideAsync();

/** A fresh cart for every user who signs in; the till shift belongs to the phone and survives logout. */
function SignedInProviders({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return <>{children}</>;
  return (
    <ShiftProvider>
      <CartProvider key={state.session.user.id}>{children}</CartProvider>
    </ShiftProvider>
  );
}

function RootNavigator() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== "loading") void SplashScreen.hideAsync();
  }, [state.status]);

  // Keep the splash screen up while the stored session is read.
  if (state.status === "loading") return null;

  const signedIn = state.status === "signedIn";
  const isOwner = signedIn && state.session.user.role === "ADMIN";
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="customers" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen name="sales" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="shift" />
        <Stack.Screen name="debts" />
        <Stack.Screen name="debt/[id]" />
        <Stack.Screen name="expenses" />
        <Stack.Screen name="empties" />
        <Stack.Protected guard={isOwner}>
          <Stack.Screen name="intake" />
          <Stack.Screen name="suppliers" />
          <Stack.Screen name="supplier/[id]" />
          <Stack.Screen name="product-photo" />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <AuthProvider>
        <SyncProvider>
          <SignedInProviders>
            <StatusBar style="auto" />
            <RootNavigator />
          </SignedInProviders>
        </SyncProvider>
      </AuthProvider>
    </DatabaseProvider>
  );
}
