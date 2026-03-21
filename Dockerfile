FROM node:20-bookworm

ENV METACELLS_CONTAINER_HOST_ALIAS=host.docker.internal

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
