import { router } from "expo-router";

/** Back if there is somewhere to go back to (e.g. not after a deep link), otherwise to the selling screen. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
