# The image the mock provider is deployed as. The build stage needs the whole workspace,
# because that is where the packages it bundles live; the runtime stage needs almost none
# of it, because tsup put the workspace package inside dist/server.js already.

FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @checkout-embed/mock-psp build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

# Only what came from the registry is left to install. The workspace dependency is dropped
# rather than resolved: it is already in the bundle, and npm has no way to find it here.
COPY apps/mock-psp/package.json ./
RUN node -e "const p=require('./package.json'); delete p.dependencies['@checkout-embed/contracts']; delete p.devDependencies; p.scripts={start:'node dist/server.js'}; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2))" \
  && npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build /repo/apps/mock-psp/dist ./dist
# Migrations resolve from the working directory, so they sit next to dist rather than
# inside it. See the note in src/db/migrate.ts.
COPY --from=build /repo/apps/mock-psp/drizzle ./drizzle

USER node

# Matches EXPOSE below and internal_port in fly.toml. Without it the image listens on
# the schema default of 4000 and only Fly would know better.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
