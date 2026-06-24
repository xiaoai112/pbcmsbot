# AIGOU 部署说明

## 1. 准备环境

服务器建议安装：

- Node.js 18+
- npm
- PM2
- Nginx
- 可选：MySQL 5.7+ 或 MySQL 8+

## 2. 配置后端

复制环境变量示例：

```bash
cp server/.env.example server/.env
```

然后编辑 `server/.env`：

```env
PORT=8787
STORAGE=json
APP_BASE_URL=https://example.com
COOKIE_SECURE=true

ADMIN_USER=admin
ADMIN_PASSWORD=ChangeThisPasswordNow
SESSION_SECRET=change-this-to-a-long-random-string
```

使用 MySQL 时，将 `STORAGE=json` 改为：

```env
STORAGE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=aigou
DB_PASSWORD=your_mysql_password
DB_NAME=aigou_admin
```

初始化数据库：

```bash
mysql -uroot -p < server/schema.mysql.sql
```

## 3. 安装依赖并构建

```bash
npm install
npm run build
node --check server/index.js
```

## 4. 使用 PM2 启动

```bash
pm2 start server/index.js --name aigou-admin --time
pm2 save
```

## 5. Nginx

可以参考项目中的 `nginx-example.conf`。

请把示例里的：

- `example.com`
- `/www/wwwroot/example.com`
- SSL 证书路径

替换成你自己的服务器配置。

## 6. 验证

```bash
curl -i http://127.0.0.1:8787/api/health
curl -k -i https://example.com/api/health
```

浏览器访问：

```text
https://example.com/
```

## 7. 安全提醒

- 不要提交 `server/.env`
- 不要提交 `server/data/`
- 不要使用默认管理员密码上线
- 支付、邮件、数据库、大模型 Key 都应只保存在服务器环境变量或后台配置中
