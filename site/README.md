# GlassBench public site

A small, self-contained static site for the GlassBench benchmark — an **Overview**,
the **Leaderboard**, and the **Datasheet**. It is presentation only: the pages are
rendered from the committed Markdown the repo already ships (`README.md`,
`LEADERBOARD.md`, `DATASHEET.md`) and **nothing is recomputed**. The leaderboard shown is
exactly `LEADERBOARD.md`, which is itself the deterministic output of
`scripts/gen_leaderboard.py`, so the site can never disagree with the repo.

The site does **not** import or run the `glassbench` package, the scorer, or the data.

## Files

| Path | What it is |
|---|---|
| `build_site.py` | Stdlib-only generator: Markdown subset → styled HTML. No pip install needed. |
| `nginx.conf` | nginx server block (extensionless URLs, caching, basic hardening). |
| `dist/` | Generated output: `index.html`, `leaderboard.html`, `datasheet.html`, `style.css`. |

The repo root also has a `Dockerfile` (multi-stage: render with python:alpine → serve
with `nginx:alpine` on **port 80**) and a `.dockerignore`.

## Build locally

```bash
python site/build_site.py            # writes site/dist/
```

Open `site/dist/index.html`, or serve it: `python -m http.server -d site/dist 8080`.

## Build + serve with Docker

```bash
docker build -t glassbench-site .
docker run --rm -p 8080:80 glassbench-site   # http://localhost:8080
```

The image regenerates `dist/` from the current Markdown in its build stage, so the
committed `dist/` is a convenience snapshot, not the source of truth.

## Deploy

`.github/workflows/deploy.yml` pings a Coolify deploy webhook on every push to `main`
(Coolify builds the `Dockerfile` and serves the nginx static site). It needs two repo
secrets: `COOLIFY_APP_UUID` and `COOLIFY_TOKEN`.
