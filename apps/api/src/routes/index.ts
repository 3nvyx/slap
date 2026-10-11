// All REST routes, relative to /api. Study routes come from study.ts (pipeline owner), learning partner from partner.ts,
// hand-entered course dates from courses.ts.
import { Hono } from "hono";
import { coreRoutes } from "./core.ts";
import { courseRoutes } from "./courses.ts";
import { studyRoutes } from "./study.ts";
import { partnerRoutes } from "./partner.ts";
import { withUser, type UserEnv } from "../user.ts";

export const routes = new Hono<UserEnv>()
  .use(withUser)
  .route("/", coreRoutes)
  .route("/", courseRoutes)
  .route("/", studyRoutes)
  .route("/", partnerRoutes);
