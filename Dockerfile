FROM node:22-slim AS builder
WORKDIR /app

# Install from package.json so Linux native optional bindings (rolldown, oxide) resolve cleanly
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts components.json ./
COPY src ./src
RUN npm run build

FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
