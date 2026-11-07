#!/bin/sh
# Stamp every local CSS/JS reference with a new ?v= so browsers fetch fresh files
# after a deploy instead of running a cached old version. Run before each commit.
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
sed -E -i '' \
  -e "s#(href=\"css/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#" \
  -e "s#(src=\"js/app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" index.html
for f in js/app.js js/sync.js; do
  sed -E -i '' -e "s#from '\./(data|mapstyle|sync|config)\.js(\?v=[0-9]+)?'#from './\1.js?v=$V'#g" "$f"
done
echo "Version stamped: $V"
