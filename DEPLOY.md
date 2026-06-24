# AIGOU 部署说明

## 1. 上传后目录

保持以下结构：

```text
aigou-admin/
  dist/
  server/
  package.json
  package-lock.json
  DEPLOY.md
```

本部署包包含完整的 `server/data/` 和 `server/.env` 初始文件，适合清空旧站后重新上传部署。

## 2. 首次部署配置

如果服务器上还没有 `server/.env`：

```bash
cp server/.env.example server/.env
```

然后编辑 `server/.env`：

- 默认后台账号是 `admin`，默认密码是 `Admin@123456`
- 上线后建议把 `ADMIN_PASSWORD` 改成你自己的后台密码
- `SESSION_SECRET` 改成随机长字符串
- `APP_BASE_URL` 改成正式域名，例如 `https://admin.jindunlianghua.cn`
- 使用 MySQL 时，把 `STORAGE=json` 改成 `STORAGE=mysql`，并填写数据库连接
- `LLM_MODEL` 是默认模型，后台也可以读取接口模型列表后自由切换

## 3. 安装依赖

```bash
npm install
```

## 4. 启动或重启

```bash
npm start
```

PM2 方式：

```bash
pm2 restart aigou-admin
```

## 5. PbootCMS 站点接入

登录后台后：

1. 添加站点
2. 进入桥接向导
3. 下载 `aigou-publish.php`
4. 上传到目标 PbootCMS 站点根目录
5. 保存接口地址和栏目

## 6. 更新后检查

- 打开 `/api/health`，确认后端正常
- 后台进入“模型设置”，填写 API 地址和 Key，点击“读取模型”
- 选择模型并保存，再生成 1 篇文章测试
- 如页面仍显示旧版本，清理浏览器缓存或硬刷新
