import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { withAuth } from "@/lib/auth/guard";
import { apiError } from "@/lib/http";

/** Stays under Vercel's 4.5 MB function body limit. Phones resize photos before uploading. */
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Upload a bottle photo (owner only, from the web dashboard or the POS app).
 * Body: the raw image bytes with an image/* Content-Type.
 */
export const POST = withAuth(
  ["ADMIN"],
  async (request, context: RouteContext<"/api/admin/products/[id]/image">, principal) => {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const extension = TYPES[contentType];
    if (!extension) return apiError("BAD_REQUEST", "Upload a JPEG, PNG or WebP image.");

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return apiError("BAD_REQUEST", "Image is too large (max 4 MB).");

    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
      columns: { id: true, imageUrl: true },
    });
    if (!product) return apiError("NOT_FOUND", "Product not found.");

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return apiError("BAD_REQUEST", "Empty upload.");
    if (body.byteLength > MAX_BYTES) return apiError("BAD_REQUEST", "Image is too large (max 4 MB).");

    const blob = await put(`products/${id}.${extension}`, body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    // Bumps updated_at, so phones pull the new image URL on their next sync.
    await db.update(products).set({ imageUrl: blob.url }).where(eq(products.id, id));
    await audit({ userId: principal.userId, action: "product.image", entityType: "product", entityId: id, data: { url: blob.url } });

    if (product.imageUrl) {
      // Best effort: an orphaned old image is harmless.
      await del(product.imageUrl).catch(() => undefined);
    }
    return Response.json({ imageUrl: blob.url });
  },
);
