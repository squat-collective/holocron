FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml README.md ./
COPY src/ src/

RUN uv pip install --system -e ".[dev]"

CMD ["python", "-c", "import holocron_plugin_sdk; print(holocron_plugin_sdk.__version__)"]
