FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# Build context is the monorepo root (see docker-compose.yml).
# Copy both the api and the connector library it depends on.
COPY packages/api/pyproject.toml packages/api/README.md ./
COPY packages/api/src/ src/
COPY packages/api/plugins/ plugins/
COPY packages/holocron-plugin-sdk/ /opt/holocron-plugin-sdk/
COPY packages/connector-excel/ /opt/connector-excel/
COPY packages/exporter-excel/ /opt/exporter-excel/
COPY packages/connector-csv/ /opt/connector-csv/
COPY packages/exporter-markdown/ /opt/exporter-markdown/
COPY packages/audit-lineage-gaps/ /opt/audit-lineage-gaps/
COPY packages/compliance-report/ /opt/compliance-report/
COPY packages/pii-detector/ /opt/pii-detector/
COPY packages/connector-postgres/ /opt/connector-postgres/
COPY packages/connector-powerbi/ /opt/connector-powerbi/

# Re-point the workspace deps to absolute paths inside the image (instead of ../*).
RUN sed -i \
    -e 's|path = "../holocron-plugin-sdk"|path = "/opt/holocron-plugin-sdk"|' \
    -e 's|path = "../connector-excel"|path = "/opt/connector-excel"|' \
    -e 's|path = "../exporter-excel"|path = "/opt/exporter-excel"|' \
    -e 's|path = "../connector-csv"|path = "/opt/connector-csv"|' \
    -e 's|path = "../exporter-markdown"|path = "/opt/exporter-markdown"|' \
    -e 's|path = "../audit-lineage-gaps"|path = "/opt/audit-lineage-gaps"|' \
    -e 's|path = "../compliance-report"|path = "/opt/compliance-report"|' \
    -e 's|path = "../pii-detector"|path = "/opt/pii-detector"|' \
    -e 's|path = "../connector-postgres"|path = "/opt/connector-postgres"|' \
    -e 's|path = "../connector-powerbi"|path = "/opt/connector-powerbi"|' \
    pyproject.toml

# INSTALL_EXTRAS lets the dev compose pull in pytest/mypy/ruff via `[dev]`
# while the released GHCR image stays slim (default empty = runtime only).
ARG INSTALL_EXTRAS=""
RUN uv pip install --system -e ".${INSTALL_EXTRAS}"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "holocron.main:app", "--host", "0.0.0.0", "--port", "8000"]
