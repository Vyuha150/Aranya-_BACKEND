import { Router } from "express";
import { z } from "zod";
import { Order } from "../../models/Order.js";
import { Product } from "../../models/Product.js";
import { PageView } from "../../models/PageView.js";
import { Message } from "../../models/Message.js";
import { Settings } from "../../models/Settings.js";
import { TRAFFIC_SOURCES } from "../../lib/constants.js";
import { addMonths, daysAgo, istDay, istDayStart, istMonth } from "../../lib/dates.js";
import { serializeOrder } from "./orders.js";
import { netTotal } from "../../lib/returns.js";

export const analyticsRouter = Router();

const COHORT_MONTHS = 5;
const COHORT_OFFSETS = 4; // M0..M3

/** Percentage change, or null when there is no baseline to compare against. */
const delta = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

function summarise(orders) {
  const kept = orders.filter((o) => o.status !== "Refunded");
  // Net of cancellations and returns.
  const revenue = orders.reduce((sum, o) => sum + netTotal(o), 0);
  return {
    revenue,
    orders: orders.length,
    aov: kept.length ? revenue / kept.length : 0,
    customers: new Set(orders.map((o) => o.customer.email)).size,
  };
}

function cohortRetention(allOrders, now) {
  const monthsByEmail = new Map();
  for (const o of allOrders) {
    const email = o.customer.email;
    if (!monthsByEmail.has(email)) monthsByEmail.set(email, new Set());
    monthsByEmail.get(email).add(istMonth(o.createdAt));
  }

  const currentMonth = istMonth(now);
  const cohorts = [];
  for (let back = COHORT_MONTHS - 1; back >= 0; back--) {
    const cohort = addMonths(currentMonth, -back);
    const members = [...monthsByEmail.values()].filter((months) => [...months].sort()[0] === cohort);
    const retention = [];
    for (let k = 0; k < COHORT_OFFSETS; k++) {
      const month = addMonths(cohort, k);
      // Months that haven't happened yet have no retention figure.
      if (month > currentMonth || members.length === 0) retention.push(null);
      else retention.push(Math.round((members.filter((m) => m.has(month)).length / members.length) * 100));
    }
    cohorts.push({ cohort, size: members.length, retention });
  }
  return cohorts;
}

analyticsRouter.get("/", async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(366).default(14) }).parse(req.query);

  const now = new Date();
  const start = istDayStart(days - 1, now);
  const prevStart = istDayStart(days * 2 - 1, now);

  const [windowOrders, cohortOrders, recent, products, settings, unreadMessages, pendingReturns, sessions] =
    await Promise.all([
      Order.find({ createdAt: { $gte: prevStart } })
        .select("createdAt total status customer.email items refundedAmount returnRequest")
        .lean(),
      Order.find({ status: { $ne: "Refunded" } }).select("createdAt customer.email").lean(),
      Order.find().sort({ createdAt: -1 }).limit(6).lean(),
      Product.find({ published: true }).select("name stock").lean(),
      Settings.get(),
      Message.countDocuments({ read: false }),
      Order.countDocuments({ "returnRequest.status": { $in: ["Requested", "Approved"] } }),
      // One row per visitor session in the window: where it landed, how it
      // arrived, and how many pages it saw.
      PageView.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: "$sessionId",
            landing: { $first: "$path" },
            source: { $first: "$source" },
            paths: { $push: "$path" },
          },
        },
      ]),
    ]);

  const current = windowOrders.filter((o) => o.createdAt >= start);
  const previous = windowOrders.filter((o) => o.createdAt < start);
  const cur = summarise(current);
  const prev = summarise(previous);

  // Daily series, including days with no orders.
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--) byDay.set(istDay(daysAgo(i, now)), { revenue: 0, orders: 0 });
  for (const o of current) {
    const bucket = byDay.get(istDay(o.createdAt));
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += netTotal(o);
  }

  const byProduct = new Map();
  for (const o of current) {
    if (o.status === "Refunded") continue;
    for (const item of o.items) {
      const row = byProduct.get(item.slug) || { slug: item.slug, name: item.name, units: 0, revenue: 0 };
      row.units += item.qty;
      row.revenue += item.price * item.qty;
      byProduct.set(item.slug, row);
    }
    // Units that came back and were refunded don't count as sold.
    if (o.returnRequest?.status === "Refunded") {
      for (const item of o.returnRequest.items) {
        const row = byProduct.get(item.slug);
        if (!row) continue;
        row.units -= item.qty;
        row.revenue -= item.price * item.qty;
      }
    }
  }
  const productSales = [...byProduct.values()].sort((a, b) => b.units - a.units);

  const visitsBySource = new Map(TRAFFIC_SOURCES.map((s) => [s, 0]));
  const pageStats = new Map();
  const statFor = (path) => {
    if (!pageStats.has(path)) pageStats.set(path, { views: 0, landings: 0, bounces: 0 });
    return pageStats.get(path);
  };
  for (const s of sessions) {
    visitsBySource.set(s.source, (visitsBySource.get(s.source) || 0) + 1);
    for (const path of s.paths) statFor(path).views += 1;
    const landing = statFor(s.landing);
    landing.landings += 1;
    if (s.paths.length === 1) landing.bounces += 1;
  }
  const totalVisits = sessions.length;

  res.json({
    days,
    kpis: {
      revenue: { value: cur.revenue, delta: delta(cur.revenue, prev.revenue) },
      orders: { value: cur.orders, delta: delta(cur.orders, prev.orders) },
      aov: { value: cur.aov, delta: delta(cur.aov, prev.aov) },
      customers: { value: cur.customers, delta: delta(cur.customers, prev.customers) },
    },
    series: [...byDay].map(([day, v]) => ({ day, ...v })),
    productSales,
    traffic: {
      visits: totalVisits,
      channels: [...visitsBySource].map(([channel, visits]) => ({
        channel,
        visits,
        share: totalVisits ? Math.round((visits / totalVisits) * 100) : 0,
      })),
    },
    // The most-viewed storefront paths in the window.
    pages: [...pageStats]
      .map(([path, s]) => ({
        path,
        views: s.views,
        // Share of visits that landed here and left without seeing a second page.
        bounce: s.landings ? Math.round((s.bounces / s.landings) * 100) : null,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15),
    cohorts: cohortRetention(cohortOrders, now),
    recentOrders: recent.map(serializeOrder),
    alerts: {
      outOfStock: products.filter((p) => p.stock <= 0).map((p) => p.name),
      lowStock: products
        .filter((p) => p.stock > 0 && p.stock < settings.lowStockThreshold)
        .map((p) => ({ name: p.name, stock: p.stock })),
      unreadMessages,
      // Returns waiting on a decision or on their refund.
      pendingReturns,
    },
  });
});
