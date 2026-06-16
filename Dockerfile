# GlassBench static site — build + serve.
#
# This image hosts ONLY the public site (Overview / Leaderboard / Datasheet). It does
# not run the scorer or ship the benchmark data. The site is rendered at build time from
# the committed Markdown (README.md, LEADERBOARD.md, DATASHEET.md) by site/build_site.py,
# which uses the Python standard library only (no pip install), then served as static
# files by nginx.
#
# Build:  docker build -t glassbench-site .
# Run:    docker run --rm -p 8080:80 glassbench-site   # -> http://localhost:8080

# ---- Stage 1: render the static HTML from the committed Markdown ---------------------
FROM python:3.12-alpine AS build
WORKDIR /src
# Only the inputs the generator reads + the generator itself, so a docs edit busts cache
# without dragging the whole package in.
COPY README.md LEADERBOARD.md DATASHEET.md ./
COPY site/build_site.py ./site/build_site.py
RUN python site/build_site.py --out /out

# ---- Stage 2: serve with nginx ------------------------------------------------------
FROM nginx:alpine AS serve
# Replace the default site with ours.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /out/ /usr/share/nginx/html/
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# A lightweight healthcheck Coolify / Docker can use.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
