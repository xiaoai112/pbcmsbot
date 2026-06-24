# AIGOU 智能文章生成与自动发布后台

AIGOU 是一套面向内容运营、站群管理和 PbootCMS 网站自动发布场景的智能文章生成后台系统。系统支持多用户注册、会员管理、大模型文章生成、违禁词替换、图片素材管理、定时发布、PbootCMS 站点桥接发布、锚文本随机插入、站点发布统计、邮件通知以及易支付会员充值等功能。

本项目适合用于企业官网内容更新、SEO 软文生产、站群内容管理、自动化发布后台、会员制内容发布工具等场景。

版权所有：1330600100。二次开发与定制合作请联系 QQ。

## 功能概览

- 多用户注册、登录、会员管理
- 管理员与会员独立权限
- 管理员可启用、禁用、删除会员
- 管理员可重置会员密码
- 管理员和会员均可修改自己的密码
- 会员可填写邮箱接收发布通知
- 集成易支付收款
- 会员可在线充值并自动延长有效期
- 管理员可自定义周卡、月卡、季卡、年卡或自定义天数套餐
- 支持 OpenAI 兼容大模型接口
- 支持读取模型列表并自由切换模型
- 支持多个关键词逐篇生成文章
- 支持违禁词替换和模板复制
- 支持图片上传、缩略图展示、批量管理
- 支持 PbootCMS 桥接发布
- 支持读取 PbootCMS 目标站栏目
- 支持锚文本随机插入
- 支持定时从“我的文章”中抽取指定数量文章发送
- 每篇文章发送成功后自动标记为已发送
- 支持发布日志、站点统计和邮件通知
- 支持网站名称、Logo、首页广告位管理

## 技术栈

- 前端：React + Vite
- 后端：Node.js 原生 HTTP 服务
- 图标：lucide-react
- 邮件：nodemailer
- 数据存储：JSON 文件或 MySQL
- 部署：PM2 + Nginx

## 目录结构

```text
aigou-admin/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   └── styles.css
├── server/
│   ├── index.js
│   ├── .env.example
│   ├── schema.mysql.sql
│   └── pbootcms-bridge.example.php
├── DEPLOY.md
├── SERVER-UPLOAD.md
└── README.md
```

## 本地运行

安装依赖：

```bash
npm install
```

启动前端开发服务：

```bash
npm run dev
```

启动后端服务：

```bash
npm start
```

构建前端：

```bash
npm run build
```

## 后端配置

复制环境变量示例：

```bash
cp server/.env.example server/.env
```

常用配置：

```env
PORT=8787
STORAGE=json
APP_BASE_URL=http://127.0.0.1:8787
COOKIE_SECURE=false

ADMIN_USER=admin
ADMIN_PASSWORD=ChangeThisPasswordNow
SESSION_SECRET=change-this-to-a-long-random-string

LLM_MODEL=gpt-4.1-mini
```

使用 MySQL 时：

```env
STORAGE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=aigou
DB_PASSWORD=your_mysql_password
DB_NAME=aigou_admin
```

初始化 MySQL：

```bash
mysql -uroot -p < server/schema.mysql.sql
```

## 默认管理员

首次启动时，系统会根据 `.env` 自动创建管理员账号。

默认示例：

```text
账号：admin
密码：ChangeThisPasswordNow
```

正式部署前请务必修改管理员密码和 `SESSION_SECRET`。

## 易支付配置

管理员登录后台后，在“系统设置”中配置易支付：

- 易支付接口地址
- 商户 ID
- 商户 Key
- 收款站点名称
- 会员套餐

异步回调地址：

```text
https://你的域名/api/payment/notify
```

支付成功后，系统会自动延长会员有效期。重复回调不会重复增加时长。

## PbootCMS 发布

系统提供桥接文件：

```text
server/pbootcms-bridge.example.php
```

使用方式：

1. 在后台站点管理中添加目标站点。
2. 下载或复制桥接文件。
3. 将桥接文件上传到 PbootCMS 站点根目录。
4. 在后台填写桥接接口地址和 Token。
5. 点击读取目标站栏目。
6. 选择栏目后即可发布文章。

## 部署建议

推荐使用 PM2：

```bash
npm install --omit=dev
npm run build
pm2 start server/index.js --name aigou-admin --time
pm2 save
```

Nginx 反向代理示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 安全提醒

- 不要泄露 `server/.env`
- 不要泄露 `server/data/`
- 不要泄露 `node_modules/`
- 不要泄露真实 API Key、数据库密码、SMTP 授权码、易支付商户 Key
- 上线后请启用 HTTPS
- 正式环境不要继续使用默认管理员密码

## 版权

版权所有：1330600100。二次开发与定制合作请联系 QQ。
