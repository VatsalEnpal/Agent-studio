#!/usr/bin/env bash
#
# Post-produce the demo video from raw Playwright recording.
#
# Pipeline:
#   1. Trim raw to best 16s (cut dead air at start/end)
#   2. Scale to 1280x720 for Twitter/GitHub (SD version)
#   3. Generate end card (3s, amber "Agent Studio" on dark bg)
#   4. Concatenate with crossfade
#   5. Export: final_demo.mp4 (720p), final_demo_hd.mp4 (1080p), final_demo.gif
#
# Usage:
#   ./scripts/build-demo.sh [input.webm]
#
# Requires: ffmpeg-full (brew install ffmpeg-full)

set -euo pipefail

FFMPEG="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFPROBE="/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"

if [ ! -x "$FFMPEG" ]; then
  echo "Error: ffmpeg-full not found at $FFMPEG"
  echo "Install: brew install ffmpeg-full"
  exit 1
fi

INPUT="${1:-}"
OUTPUT_DIR="demo-videos"
FINAL="$OUTPUT_DIR/final_demo.mp4"
FINAL_HD="$OUTPUT_DIR/final_demo_hd.mp4"
FINAL_GIF="$OUTPUT_DIR/final_demo.gif"
ENDCARD="$OUTPUT_DIR/_endcard.mp4"
ENDCARD_HD="$OUTPUT_DIR/_endcard_hd.mp4"
TRIMMED="$OUTPUT_DIR/_trimmed.mp4"
TRIMMED_HD="$OUTPUT_DIR/_trimmed_hd.mp4"

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

RAW_DURATION=$($FFPROBE -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT" | cut -d. -f1)
echo ""
echo "Input: $INPUT (${RAW_DURATION}s)"
echo ""

# --- Find the right trim point ---
# The raw video starts with page load + loading spinner.
# We need to find where real content begins (file size jump in frames).
# Default: skip 8s to get past load + initial render delay.
SKIP="${SKIP:-8}"

# --- Step 1: Trim and create 720p version ---
echo "Step 1: Trimming 16s starting at ${SKIP}s, scaling to 720p..."
$FFMPEG -y -ss "$SKIP" -i "$INPUT" \
  -t 16 \
  -vf "fade=in:0:5,fade=out:st=15:d=1,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0a0a0a" \
  -c:v libx264 -crf 22 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -an \
  "$TRIMMED" 2>/dev/null

echo "  Trimmed 720p: $TRIMMED"

# --- Step 1b: Trim and create 1080p version ---
echo "Step 1b: Trimming 16s starting at ${SKIP}s (1080p)..."
$FFMPEG -y -ss "$SKIP" -i "$INPUT" \
  -t 16 \
  -vf "fade=in:0:5,fade=out:st=15:d=1,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#0a0a0a" \
  -c:v libx264 -crf 20 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -an \
  "$TRIMMED_HD" 2>/dev/null

echo "  Trimmed 1080p: $TRIMMED_HD"

# --- Step 2: Generate end card (3s) ---
# Use drawtext for "Agent Studio" in amber + tagline in grey
echo "Step 2: Generating end card..."

# 720p end card
$FFMPEG -y \
  -f lavfi -i "color=c=0x0a0a0a:s=1280x720:d=3:r=30" \
  -vf "drawtext=text='Agent Studio':fontcolor=0xf59e0b:fontsize=56:x=(w-text_w)/2:y=(h/2)-40:font='SF Mono',drawtext=text='IDE for AI agent teams':fontcolor=0x71717a:fontsize=22:x=(w-text_w)/2:y=(h/2)+30:font='SF Mono',fade=in:0:10" \
  -c:v libx264 -crf 22 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -t 3 \
  "$ENDCARD" 2>/dev/null

echo "  End card 720p: $ENDCARD"

# 1080p end card
$FFMPEG -y \
  -f lavfi -i "color=c=0x0a0a0a:s=1920x1080:d=3:r=30" \
  -vf "drawtext=text='Agent Studio':fontcolor=0xf59e0b:fontsize=72:x=(w-text_w)/2:y=(h/2)-50:font='SF Mono',drawtext=text='IDE for AI agent teams':fontcolor=0x71717a:fontsize=28:x=(w-text_w)/2:y=(h/2)+40:font='SF Mono',fade=in:0:10" \
  -c:v libx264 -crf 20 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -t 3 \
  "$ENDCARD_HD" 2>/dev/null

echo "  End card 1080p: $ENDCARD_HD"

# --- Step 3: Concatenate with crossfade ---
echo "Step 3: Concatenating with crossfade..."

# 720p final
$FFMPEG -y \
  -i "$TRIMMED" -i "$ENDCARD" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.8:offset=15.2[v]" \
  -map "[v]" \
  -c:v libx264 -crf 22 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$FINAL" 2>/dev/null

echo "  Final 720p: $FINAL"

# 1080p final
$FFMPEG -y \
  -i "$TRIMMED_HD" -i "$ENDCARD_HD" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.8:offset=15.2[v]" \
  -map "[v]" \
  -c:v libx264 -crf 20 -preset medium -r 30 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$FINAL_HD" 2>/dev/null

echo "  Final 1080p: $FINAL_HD"

# --- Step 4: Generate GIF fallback ---
echo "Step 4: Generating GIF..."

# Use palettegen for better quality
$FFMPEG -y -i "$FINAL" \
  -vf "fps=12,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  "$FINAL_GIF" 2>/dev/null

echo "  GIF: $FINAL_GIF"

# --- Cleanup temp files ---
rm -f "$TRIMMED" "$TRIMMED_HD" "$ENDCARD" "$ENDCARD_HD"

# --- Report ---
echo ""
echo "Done!"
echo ""

for f in "$FINAL" "$FINAL_HD" "$FINAL_GIF"; do
  if [ -f "$f" ]; then
    SIZE=$(du -h "$f" | cut -f1)
    DURATION=$($FFPROBE -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null | cut -d. -f1 || echo "?")
    RES=$($FFPROBE -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f" 2>/dev/null || echo "?")
    echo "  $(basename "$f")"
    echo "    Duration: ${DURATION}s | Size: $SIZE | Resolution: $RES"
  fi
done

echo ""
