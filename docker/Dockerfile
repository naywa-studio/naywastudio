FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy agent files (paths relative to build context = project root)
COPY src/lib/agent-templates/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/lib/agent-templates/main.py .
COPY src/lib/agent-templates/agent_leo.py .
COPY src/lib/agent-templates/agent_nora.py .

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
