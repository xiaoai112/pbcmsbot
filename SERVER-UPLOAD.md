# AIGOU clean server upload guide

This package is built for `/www/wwwroot/aigold.jindunlianghua.cn`.

## Upload

Upload `aigou-admin-full-clean.zip` or `aigou-admin-full-clean.tar.gz` to:

```bash
/www/wwwroot/aigold.jindunlianghua.cn
```

## Fresh deploy

Run these commands on the server:

```bash
cd /www/wwwroot/aigold.jindunlianghua.cn

BACKUP_DIR="/www/backup/aigou-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a server/data "$BACKUP_DIR/data" 2>/dev/null || true
cp -a server/.env "$BACKUP_DIR/.env" 2>/dev/null || true

pm2 delete aigou-admin 2>/dev/null || true
fuser -k 8787/tcp 2>/dev/null || true

rm -rf aigou-admin
unzip -o aigou-admin-full-clean.zip

rm -rf ./dist ./server
cp -af aigou-admin/. .

if [ -d "$BACKUP_DIR/data" ]; then
  rm -rf ./server/data
  cp -af "$BACKUP_DIR/data" ./server/data
fi

if [ -f "$BACKUP_DIR/.env" ]; then
  cp -af "$BACKUP_DIR/.env" ./server/.env
fi

npm install --omit=dev
node --check server/index.js
pm2 start server/index.js --name aigou-admin --update-env
pm2 save
nginx -s reload

curl -i http://127.0.0.1:8787/api/health
curl -k -i https://admin.jindunlianghua.cn/api/health
```

If your server only has `tar`, replace the unzip line with:

```bash
tar -xzf aigou-admin-full-clean.tar.gz
```

## Nginx

Only replace the Nginx config for `aigold.jindunlianghua.cn`. Do not change other site configs.

Use the included `nginx-admin.jindunlianghua.cn.conf` as the complete template.

## Verify

After deployment:

```bash
curl -s http://127.0.0.1:8787/ | grep index-
curl -k -s https://aigold.jindunlianghua.cn/ | grep index-
```

Expected asset names in this build:

```text
index-CqcybETT.js
index-C26xPo-L.css
```

The app no longer contains any `cachefix` redirect.

Default login:

```text
username: admin
password: Admin@123456
```
