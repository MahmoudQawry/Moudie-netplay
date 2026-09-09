import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/** Minimal system surface. The Manus template's admin notification machinery
 * was removed; the room service only needs a liveness probe. */
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      }),
    )
    .query(() => ({
      ok: true,
    })),
});
