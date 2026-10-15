import { Hono } from "hono";
import productionApp from "../src/index";
import type { Variables } from "../src/types";
import { createDevLoginRoute, resolveDevelopmentSession, type DevBindings } from "./login";

export function createDevelopmentApp() {
  const app = new Hono<{ Bindings: DevBindings; Variables: Variables }>();
  app.route("/api/dev/login", createDevLoginRoute());
  app.use("/api/*", async (c, next) => {
    c.set("sessionUserResolver", resolveDevelopmentSession);
    await next();
  });
  app.route("/", productionApp);
  return app;
}

export default createDevelopmentApp();
