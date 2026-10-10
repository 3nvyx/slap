// All REST routes, relative to /api. Study routes come from study.ts (pipeline owner), learning partner from partner.ts.
import { Hono } from "hono";
import { coreRoutes } from "./core.ts";
import { studyRoutes } from "./study.ts";
import { partnerRoutes } from "./partner.ts";
import { withUser, type UserEnv } from "../user.ts";

export const routes = new Hono<UserEnv>()
  .use(withUser)
  .route("/", coreRoutes)
  .route("/", studyRoutes)
  .route("/", partnerRoutes);
