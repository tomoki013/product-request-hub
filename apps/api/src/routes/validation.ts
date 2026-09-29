import type { Hook } from "@hono/zod-validator";
import { z } from "zod";
import { AppError } from "../errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const validationHook: Hook<any, any, any> = (result) => {
  if (!result.success) {
    throw new AppError("bad_request", "Invalid input", z.treeifyError(result.error as z.ZodError));
  }
};
