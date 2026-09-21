# The image the mock provider is deployed as. The build stage installs the workspace from
# the lockfile and bundles the server with every dependency inside it, so the runtime stage
# installs nothing: no second resolution of versions, and no install script running as root.

FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# The trailing dots build contracts first. The bundle reads it from its dist, which the
# build context never carries.
RUN pnpm --filter "@checkout-embed/mock-psp..." build
# Swagger UI is served from its package directory rather than bundled. pnpm links it from
# the store, so it is copied with the link followed.
RUN cp -rL apps/mock-psp/node_modules/swagger-ui-dist /swagger-ui-dist

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/apps/mock-psp/dist ./dist
# Migrations resolve from the working directory, so they sit next to dist rather than
# inside it. See the note in src/db/migrate.ts.
COPY --from=build /repo/apps/mock-psp/drizzle ./drizzle
COPY --from=build /swagger-ui-dist ./node_modules/swagger-ui-dist

# Matches EXPOSE below and internal_port in fly.toml. Without it the image listens on
# the schema default of 4000 and only Fly would know better.
ENV PORT=8080
EXPOSE 8080

# A fresh Fly volume mounts at /data owned by root. The container starts as root only to
# hand that directory to the node user, then runs the server as node.
CMD ["sh", "-c", "if [ -d /data ]; then chown node:node /data; fi; exec setpriv --reuid=node --regid=node --init-groups node dist/server.js"]
