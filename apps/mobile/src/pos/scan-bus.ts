/**
 * Lets the camera scanner hand barcodes to a screen other than the cart
 * (e.g. stock intake). The listening screen subscribes while it is mounted.
 */
type Listener = (barcode: string) => void;

let listener: Listener | null = null;

export function listenForScans(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/** Returns false when nothing is listening. */
export function emitScan(barcode: string): boolean {
  if (!listener) return false;
  listener(barcode);
  return true;
}
