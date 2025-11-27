#!/bin/sh

npm run build

cd dist
curl -L https://bafybeialxd4xd7puchx555zqrfmuaz7e7n7nh4crb3sfhvprxedx4c64fq.ipfs.dweb.link/?filename=EaglercraftX_1.8_WASM-GC_Offline_Download.zip -o eaglercraft.zip
unzip eaglercraft.zip
rm eaglercraft.zip
mv EaglercraftX_1.8_WASM-GC_Offline_Download.html index.html
sed -i 's/<head>/<head>\<script src="index.js"><\/script>/' index.html
cp ../ci/_headers .
