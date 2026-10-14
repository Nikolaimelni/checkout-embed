# The build stage bundles the server with its dependencies, the runtime stage installs nothing.

FROM node:26-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@checkout-embed/mock-psp..." build
# -L because pnpm symlinks it from the store
RUN cp -rL apps/mock-psp/node_modules/swagger-ui-dist /swagger-ui-dist

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/apps/mock-psp/dist ./dist
COPY --from=build /repo/apps/mock-psp/drizzle ./drizzle
COPY --from=build /swagger-ui-dist ./node_modules/swagger-ui-dist

ENV PORT=8080
EXPOSE 8080

# a fresh Fly volume belongs to root: hand it to node, then run as node
CMD ["sh", "-c", "if [ -d /data ]; then chown node:node /data; fi; exec setpriv --reuid=node --regid=node --init-groups node dist/server.js"]
