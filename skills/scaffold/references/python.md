# Python service

FastAPI on uv, linted and formatted by Ruff, type-checked by ty, validated by Pydantic. Build one
only when the work needs a Python library (ML models, PDF layout, scientific or data packages with
no TypeScript equivalent). Everything a TypeScript surface can do stays TypeScript.

## Shape

```text
apps/<slug>/service/            # or apps/<slug>-<job>/ when it serves several apps
├── pyproject.toml              # uv project; not a pnpm workspace package
├── uv.lock                     # committed; installs are --frozen
├── .python-version             # 3.12 (one minor, pinned)
├── ruff.toml
├── .env.example                # every key the settings module reads
├── Dockerfile
├── <package>/
│   ├── api/main.py             # app, lifespan (one shared httpx client), /api/health
│   ├── api/dependencies.py     # settings, auth dependency
│   ├── api/<resource>.py       # routes
│   ├── settings.py             # the only reader of os.environ
│   └── types.py                # request and response models
├── scripts/                    # dev.sh, prod.sh, generate_openapi.py
├── openapi.json                # generated from the models, committed
└── tests/                      # pytest, no network
```

## Setup

```bash
uv init --app --package --python 3.12 <package>
uv add "fastapi[standard]" pydantic pydantic-settings httpx loguru
uv add --dev pytest pytest-asyncio ruff ty
```

```toml
# pyproject.toml
requires-python = ">=3.12,<3.13"

[tool.pytest.ini_options]
addopts = "--import-mode=importlib"
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.ty.environment]
python-version = "3.12"

[tool.ty.src]
include = ["<package>", "tests", "scripts"]

[tool.ty.terminal]
error-on-warning = true
```

```toml
# ruff.toml
target-version = "py312"
line-length = 100

[lint]
select = ["E", "F", "I", "B", "UP", "SIM", "ASYNC"]
```

Ruff is the only formatter and linter (no Black, isort or flake8), ty the only type checker (no
mypy or pyright). A service that still runs mypy moves to ty when it is next touched.

## Validation: Pydantic, the zod of this side

- Every request body, query and response is a Pydantic model in `types.py`; FastAPI validates on
  the way in and serializes on the way out. No `dict` crosses a route boundary.
- Settings are one `pydantic_settings.BaseSettings` class, read once at import. A missing key
  fails the import, so the build and the boot fail, not the first request.
- `openapi.json` is generated from the models (`scripts/generate_openapi.py`) and committed. The
  TypeScript caller generates its types from it and parses the response with zod, so a model
  change is a reviewed diff on both sides. CI fails when the committed file is stale.

## Rules

- **Internal by default.** Private networking, no public domain. Callers are the repo's API or
  workers, never a browser.
- **Auth on every route but health:** an API key header compared with `secrets.compare_digest`.
  Missing key 401, wrong key 403.
- **One `httpx.AsyncClient`** created in the lifespan and shared; never a client per request.
- **Tests never touch the network:** fakes for data sources, `httpx.MockTransport` for upstream
  APIs.
- **Porting from TypeScript:** `Math.round` rounds halves up, Python's `round()` rounds to even.
  Write a `js_round` where a value must match what TypeScript produced.

## Verify

```bash
uv run ruff format --check . && uv run ruff check . && uv run ty check && uv run pytest -q
```

That line is the service's gate in CI, on changes to its directory only.

## Deploy

Cloudflare Workers is not the target (its Python runtime does not run most native wheels). A
container host with private networking is; the repo's `AGENTS.md` names which (Leverage: Railway).

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:<version> /uv /usr/local/bin/uv
ENV UV_PYTHON=/usr/local/bin/python3 UV_PYTHON_DOWNLOADS=never \
    VIRTUAL_ENV=/app/.venv PATH="/app/.venv/bin:${PATH}"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
# Fail the build when the app does not import (placeholder values, never real ones).
RUN <KEY>=build-check python -c "from <package>.api.main import app"
CMD ["fastapi", "run", "<package>/api/main.py", "--port", "8080"]
```

- `UV_PYTHON_DOWNLOADS=never`: the image's interpreter is the one; `.python-version` must not
  make uv fetch another.
- Health check on `/api/health`, restart on failure, build only when the service's directory
  changed.
