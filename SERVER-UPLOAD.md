# 服务器上传说明

这是通用部署模板。公开仓库中不要写真实域名、服务器路径、IP、账号或密钥。

## 上传目录

示例：

```bash
/www/wwwroot/example.com
```

请根据自己的服务器修改。

## 部署命令

```bash
cd /www/wwwroot/example.com

BACKUP_DIR="/www/backup/aigou-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -a server/data "$BACKUP_DIR/data" 2>/dev/null || true
cp -a server/.env "$BACKUP_DIR/.env" 2>/dev/null || true

pm2 delete aigou-admin 2>/dev/null || true
fuser -k 8787/tcp 2>/dev/null || true

npm install --omit=dev
npm run build
node --check server/index.js

pm2 start server/index.js --name aigou-admin --update-env --time
pm2 save

nginx -t && nginx -s reload
```

## Nginx

请使用 `nginx-example.conf` 作为模板。

需要替换：

- `example.com`
- `/www/wwwroot/example.com`
- SSL 证书路径
- Nginx 日志路径

不要把自己的真实站点配置提交到公开仓库。

## 验证

```bash
curl -i http://127.0.0.1:8787/api/health
curl -k -i https://example.com/api/health
curl -s https://example.com/ | grep index-
```

## 默认登录

首次启动时会根据 `server/.env` 创建管理员。

示例：

```text
username: admin
password: ChangeThisPasswordNow
```

正式部署前请修改默认密码。
