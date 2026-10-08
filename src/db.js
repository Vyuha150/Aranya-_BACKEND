import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDb,
    serverSelectionTimeoutMS: 15000,
  });
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();
