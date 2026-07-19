#!/bin/bash
# GrandVault — double-click to open (macOS). Runs entirely on this Mac, no internet.
# Close the Terminal window this opens to quit GrandVault.
cd "$(dirname "$0")" || exit 1
PORT=8787
DIR="app"

start_server() {
  if command -v python3 >/dev/null 2>&1; then
    ( cd "$DIR" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 ) &
  elif command -v ruby >/dev/null 2>&1; then
    ruby -run -e httpd "$DIR" -p "$PORT" -b 127.0.0.1 &
  elif command -v php >/dev/null 2>&1; then
    ( cd "$DIR" && exec php -S 127.0.0.1:"$PORT" ) &
  else
    echo "GrandVault needs python3, ruby, or php (one ships with macOS)."
    echo "Open Terminal and run:  xcode-select --install   then try again."
    read -r -n 1
    exit 1
  fi
  SERVER_PID=$!
}

start_server
sleep 1

URL="http://127.0.0.1:$PORT/"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$URL"
else
  open "$URL"
fi

echo "GrandVault is running. Keep this window open while you use it."
echo "Close this window to quit."
wait "$SERVER_PID"
