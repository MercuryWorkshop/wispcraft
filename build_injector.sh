#!/bin/sh

BASE64BUNDLE="return '$(base64 dist/index.js)'"
VERSION="$(grep version package.json | sed -e 's/..version....//g' -e 's/...$//g')"
COMMITHASH="$(git rev-parse --short HEAD)"
echo -n $BASE64BUNDLE > bundle.b64
sed -e "s/WISPCRAFTVERSION/$VERSION/g" -e "s/WISPCRAFTCOMMITHASH/$COMMITHASH/g" -e "/WISPCRAFTSRCBUNDLE/r bundle.b64" -e "/WISPCRAFTSRCBUNDLE/d" "index.html" > dist/injector.html
rm bundle.b64
echo "Injector Build Complete!"
