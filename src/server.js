import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { createApp } from "./app.js";

await connectDb();
console.log(`MongoDB connected (database: ${config.mongoDb})`);

const server = createApp().listen(config.port, () => {
  console.log(`Aranya API listening on http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
