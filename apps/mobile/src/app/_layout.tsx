import "../global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";

import { AuthProvider, useAuth } from "@/auth/auth-provider";
import { DatabaseProvider } from "@/db/database-provider";
import { CartProvider } from "@/pos/cart-provider";
import { SyncProvider } from "@/sync/sync-provider";

void SplashScreen.preventAutoHideAsync();

/** A fresh, empty cart for every user who signs in on this phone. */
function PerUserCart({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.status === "signedIn" ? state.session.user.id : "signed-out";
  return <CartProvider key={userId}>{children}</CartProvider>;
}

function RootNavigator() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== "loading") void SplashScreen.hideAsync();
  }, [state.status]);

  // Keep the splash screen up while the stored session is read.
  if (state.status === "loading") return null;

  const signedIn = state.status === "signedIn";
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="customers" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen name="sales" />
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
          <PerUserCart>
            <StatusBar style="auto" />
            <RootNavigator />
          </PerUserCart>
        </SyncProvider>
      </AuthProvider>
    </DatabaseProvider>
  );
}
