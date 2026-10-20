#!/usr/bin/env bash
# Tester 0.12.0 (Playwright-Electron, xvfb 1440x900, gateway/LLM/TTS giả).
#   npm i --no-save playwright-core && bash e2e/run-tester.sh      (RECORD=0: không quay video)
# The app runs with a throwaway HOME: it never touches the real ~/.claude.
cd "$(dirname "$0")"
exec xvfb-run -a -s "-screen 0 1440x900x24" node tester.js
