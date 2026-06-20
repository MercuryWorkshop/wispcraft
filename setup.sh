#!/bin/sh
rm -rf dist
mkdir -p dist
npm run build
cd dist
curl -L https://bafybeid5iwqp3uyc4q3dqajjzbsqggqatuttqk4dnkksluqqcxaizbhjpi.ipfs.dweb.link/?filename=u53_web.zip -o eaglercraft.zip
unzip eaglercraft.zip -d eaglercraft
rm -rf eaglercraft.zip
mv -f eaglercraft/web_wasm/index.html index.html
mv -f eaglercraft/web_wasm/assets.epw assets.epw
mv -f eaglercraft/web_wasm/bootstrap.js bootstrap.js
rm -rf eaglercraft
if [[ "$OSTYPE" != darwin* ]]; then
  sed -i 's|<head>|<head><script src="index.js"></script>|' index.html
else
  sed -i '' 's|<head>|<head><script src="index.js"></script>|' index.html
fi
