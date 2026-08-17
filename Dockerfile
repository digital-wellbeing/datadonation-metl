# Stage 1: Build the Python wheel (bundled into the app via Pyodide)
FROM python:3.11-slim AS py-builder
WORKDIR /py
RUN pip install poetry --quiet
COPY src/framework/processing/py .
RUN poetry build --format wheel

# Stage 2: Build the React app
FROM node:18-bookworm-slim AS node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Inject the Python wheel so it gets included in the React build output
COPY --from=py-builder /py/dist/*.whl public/
# Supabase config is baked in at build time (anon key is safe to expose)
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
RUN npm run build:app && npm run build:css

# Stage 3: Serve with nginx
FROM nginx:alpine
COPY --from=node-builder /app/build /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
