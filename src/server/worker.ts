import { createAppHandler } from "./handler";

const handle = createAppHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv>;
