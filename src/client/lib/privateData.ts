import { clearLocalPreferences } from "./preferences";
import { clearResults } from "./results";

/** Remove every piece of locally stored player data, reporting partial failures. */
export async function clearAllLocalData(): Promise<void> {
  const errors: string[] = [];

  try {
    clearLocalPreferences();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "preferences");
  }

  try {
    await clearResults();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "results");
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "caches");
    }
  }

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "service worker");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Some local data could not be cleared: ${errors.join("; ")}`);
  }
}
