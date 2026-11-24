#!/usr/bin/env bash
# Renders the 60 s video in six 10 s chunks (fresh browser each), then joins them losslessly.
set -euo pipefail
cd "$(dirname "$0")"
FF="${FFMPEG:-D:/ffmpeg/bin/ffmpeg.exe}"
rm -f out/chunk-*.mp4 out/chunks.txt
for i in 0 1 2 3 4 5; do
  START=$((i * 10)) DURATION=10 node render.mjs video "chunk-$i.mp4"
  echo "file 'chunk-$i.mp4'" >> out/chunks.txt
done
"$FF" -y -loglevel error -f concat -safe 0 -i out/chunks.txt -c copy -movflags +faststart out/keystone-demo.mp4
rm -f out/chunk-*.mp4 out/chunks.txt out/test*.mp4 out/t.jpg
echo "done: out/keystone-demo.mp4"
