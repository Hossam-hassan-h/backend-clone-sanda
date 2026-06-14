import { z } from "zod";

export const WithdrawSchema = z
  .object({
    amount: z.number().positive("Amount must be positive"),
  })
  .strict();
