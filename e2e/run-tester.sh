#!/usr/bin/env bash
# Tester 0.12.0 (Playwright-Electron, xvfb 1440x900, gateway/LLM/TTS giả).
#   npm i --no-save playwright-core && bash e2e/run-tester.sh [login]   (RECORD=0: không quay video)
#   login → tester-login.js (Đăng nhập JAVIS theo CONTRACT.md); real → gateway thật; không tham số → tester.js
# The app runs with a throwaway HOME: it never touches the real ~/.claude.
cd "$(dirname "$0")"
script=tester.js
[ "$1" = "login" ] && script=tester-login.js
# home → tester-home.js: Trang chủ JAVIS, chụp từng tab (shots/home-*.png)
[ "$1" = "home" ] && script=tester-home.js
# real → tester-real-gateway.js: gateway THẬT (JAVIS_GW_FLEET_DIR=<repo>/services/fleet), app thật, HOME tạm
[ "$1" = "real" ] && script=tester-real-gateway.js
exec xvfb-run -a -s "-screen 0 1440x900x24" node "$script"
