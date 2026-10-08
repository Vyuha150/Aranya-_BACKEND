import { Router } from "express";
import { z } from "zod";
import { Message } from "../../models/Message.js";
import { notFound } from "../../lib/http.js";

export const messagesRouter = Router();

const serialize = (m) => ({
  id: String(m._id),
  name: m.name,
  email: m.email,
  subject: m.subject,
  message: m.message,
  read: m.read,
  date: m.createdAt,
});

messagesRouter.get("/", async (_req, res) => {
  const messages = await Message.find().sort({ createdAt: -1 }).limit(500).lean();
  res.json({ messages: messages.map(serialize) });
});

messagesRouter.patch("/:id", async (req, res) => {
  const { read } = z.object({ read: z.boolean() }).parse(req.body);
  const message = await Message.findByIdAndUpdate(req.params.id, { read }, { returnDocument: "after" }).lean();
  if (!message) throw notFound("Message");
  res.json({ message: serialize(message) });
});

messagesRouter.delete("/:id", async (req, res) => {
  const message = await Message.findByIdAndDelete(req.params.id);
  if (!message) throw notFound("Message");
  res.status(204).end();
});
