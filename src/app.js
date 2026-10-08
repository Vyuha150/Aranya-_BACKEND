import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { requireAdmin } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { storeRouter } from "./routes/store.js";
import { accountRouter } from "./routes/account.js";
import { uploadsRouter } from "./routes/admin/uploads.js";
import { productsRouter } from "./routes/admin/products.js";
import { ordersRouter } from "./routes/admin/orders.js";
import { customersRouter } from "./routes/admin/customers.js";
import { messagesRouter } from "./routes/admin/messages.js";
import { settingsRouter } from "./routes/admin/settings.js";
import { operatorsRouter } from "./routes/admin/operators.js";
import { analyticsRouter } from "./routes/admin/analytics.js";

export function createApp() {
  const app = express();

  // Behind a hosting proxy the client IP arrives in X-Forwarded-For; rate
  // limiting needs it.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Requests without an Origin header (curl, health checks) are allowed.
        cb(null, !origin || config.corsOrigins.includes(origin));
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/store", storeRouter);
  app.use("/api/account", accountRouter);

  const admin = express.Router();
  admin.use(requireAdmin);
  admin.use("/products", productsRouter);
  admin.use("/uploads", uploadsRouter);
  admin.use("/orders", ordersRouter);
  admin.use("/customers", customersRouter);
  admin.use("/messages", messagesRouter);
  admin.use("/settings", settingsRouter);
  admin.use("/operators", operatorsRouter);
  admin.use("/analytics", analyticsRouter);
  app.use("/api/admin", admin);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
