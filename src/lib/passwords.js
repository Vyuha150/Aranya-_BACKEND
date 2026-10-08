import { z } from "zod";

/** The one rule for any newly chosen password, for customers and admins alike. */
export const newPassword = z.string().min(8, "Use at least 8 characters").max(200);
