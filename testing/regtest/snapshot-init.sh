#!/usr/bin/env bash

docker compose down --volumes --remove-orphans --timeout=1 --rmi=all
docker compose up --build snapshot-init