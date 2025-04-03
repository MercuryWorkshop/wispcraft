#!/bin/sh

npm i
npm run build

git clone https://git.zelz.net/Eagler-1.12/1.12-builds.git

mv 1.12-builds/web/wasm/* ./dist/

rm -rf 1.12-builds

cd dist
sed -i 's/<head>/<head>\<script src="index.js"><\/script>/' index.html
cp ../ci/_headers .

npm run build:injector