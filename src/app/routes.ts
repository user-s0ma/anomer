import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("app", "routes/app/_layout.tsx", [
    index("routes/app/_index.tsx"),
    route("data", "routes/app/data.tsx"),
    route("setup", "routes/app/setup.tsx"),
  ]),
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
