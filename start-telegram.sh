#!/bin/bash
cd /home/workspace/velo
export $(cat velo.env | grep -v '^$' | xargs)
exec bun run src/index.ts telegram "$@"