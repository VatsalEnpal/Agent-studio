#!/usr/bin/env bash
#
# Post-produce the demo video from raw Playwright recording.
#
# Usage:
#   ./scripts/build-demo.sh [input.webm]
#
# Defaults to demo-videos/raw.webm if no input given.
# Output: demo-videos/final_demo.mp4
#
# Requires: ffmpeg (brew install ffmpeg)

set -euo pipefail

INPUT="${1:-}"
OUTPUT_DIR="demo-videos"
FINAL="$OUTPUT_DIR/final_demo.mp4"
ENDCARD="$OUTPUT_DIR/_endcard.mp4"
TRIMMED="$OUTPUT_DIR/_trimmed.mp4"

# Find input — either explicit arg or the most recent .webm in demo-videos/
if [ -z "$INPUT" ]; then
  INPUT=$(ls -t "$OUTPUT_DIR"/*.webm 2>/dev/null | head -1 || true)
  if [ -z "$INPUT" ]; then
    echo "Error: No .webm files found in $OUTPUT_DIR/"
    echo "Run 'node scripts/record-demo.mjs' first to record the demo."
    exit 1
  fi
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: Input file not found: $INPUT"
  exit 1
fi

echo "Input: $INPUT"

# --- Step 1: Convert and trim to ~18s with fade-in ---
echo "Step 1: Converting to MP4 and trimming..."
ffmpeg -y -i "$INPUT" \
  -t 18 \
  -vf "fade=in:0:15,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0a0a0a" \
  -c:v libx264 -crf 23 -preset medium -r 30 \
  -an \
  "$TRIMMED" 2>/dev/null

echo "  Trimmed: $TRIMMED"

# --- Step 2: Generate end card (3s) ---
echo "Step 2: Generating end card..."
ffmpeg -y \
  -f lavfi -i "color=c=0x0a0a0a:s=1280x720:d=3:r=30" \
  -vf "drawtext=text='Agent Studio':fontcolor=0xf59e0b:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-30:fontfile=/System/Library/Fonts/SFNSMono.ttf,drawtext=text='Terminal-first command center for AI agents':fontcolor=0x71717a:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+30:fontfile=/System/Library/Fonts/SFNSMono.ttf" \
  -c:v libx264 -crf 23 -preset medium -r 30 \
  -t 3 \
  "$ENDCARD" 2>/dev/null

echo "  End card: $ENDCARD"

# --- Step 3: Concatenate with crossfade ---
echo "Step 3: Concatenating with crossfade..."
ffmpeg -y \
  -i "$TRIMMED" -i "$ENDCARD" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=17.5[v]" \
  -map "[v]" \
  -c:v libx264 -crf 23 -preset medium -r 30 \
  -movflags +faststart \
  "$FINAL" 2>/dev/null

echo "  Final: $FINAL"

# --- Cleanup temp files ---
rm -f "$TRIMMED" "$ENDCARD"

# --- Report ---
SIZE=$(du -h "$FINAL" | cut -f1)
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FINAL" 2>/dev/null | cut -d. -f1)
echo ""
echo "Done!"
echo "  Output:   $FINAL"
echo "  Duration: ${DURATION}s"
echo "  Size:     $SIZE"
echo "  Format:   1280x720, H.264, CRF 23, 30fps"
