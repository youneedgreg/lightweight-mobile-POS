"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_SIDE = 1200;

/** Downscales a photo in the browser so uploads stay small and under the 4 MB limit. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))), "image/jpeg", 0.85),
  );
}

export function ImageUpload({ productId, imageUrl }: { productId: string; imageUrl: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      const body = await resize(file);
      const response = await fetch(`/api/admin/products/${productId}/image`, {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body,
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(error?.error?.message ?? `Upload failed (${response.status})`);
      }
      setStatus("Photo updated.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Blob URLs; no need for the image optimizer here
          <img src={imageUrl} alt="Bottle photo" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-neutral-400">No photo</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700">
          {busy ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {status && <p className="text-sm text-neutral-600 dark:text-neutral-400">{status}</p>}
      </div>
    </div>
  );
}
