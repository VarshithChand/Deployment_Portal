FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
# --ignore-scripts: none of this project's own dependencies need an
# install-time script (verified directly — the build output is identical
# with or without it), so there's no reason to let an npm package run
# arbitrary code during install at all.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# nginxinc/nginx-unprivileged instead of plain nginx: runs as a non-root
# user out of the box (writable dirs/pid file already set up for it),
# rather than hand-patching the stock image's root-owned runtime paths.
# Only real difference from the outside is the port it listens on, 8080
# instead of 80 (see nginx.conf + docker-compose's port mapping).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
