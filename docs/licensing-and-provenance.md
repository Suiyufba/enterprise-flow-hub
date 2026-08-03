# 商业授权与实例溯源

Enterprise Flow Hub 使用 Ed25519 离线签名授权。私钥由产品所有者单独保管，源码和部署镜像只包含公钥，因此普通部署方不能自行签发有效授权。

## 防护层

1. **离线验签**：授权令牌包含客户、部署 ID、允许域名和到期时间，并由 Ed25519 私钥签名。
2. **实例绑定**：数据卷首次启动生成独立 installation ID；部署 ID、installation ID 与 license ID 共同生成 20 位溯源指纹。
3. **审计留痕**：所有写操作的 `audit_logs.changes._provenance` 自动包含产品、指纹和授权状态。
4. **导出留痕**：Markdown 导出加入 HTML 注释标记，JSON 导出加入 `_provenance` 字段。
5. **数据库留痕**：`installation_provenance` 保存实例 ID、指纹、授权状态及首次/最近运行时间。
6. **商业强制模式**：生产环境使用 `LICENSE_ENFORCEMENT=enforce`，验签失败时保留只读和导出能力，但阻止业务写入，避免数据被锁死。

该机制不向外部服务器上传客户数据，也不包含隐蔽遥测。若需要识别来源，可通过合法取得的导出文件、审计记录或数据库副本核对指纹。

## 签发授权

私钥不要提交到 Git。使用独立目录并设置 `0600` 权限：

```bash
node backend/scripts/license-admin.mjs issue \
  --private-key /secure/path/ed25519-private.pem \
  --license-id lic-customer-001 \
  --customer "客户名称" \
  --deployment customer-production-1 \
  --host customer.example.com \
  --expires 2027-12-31T23:59:59+08:00
```

将输出完整写入服务器的 `LICENSE_TOKEN`。生产环境同时配置：

```dotenv
LICENSE_DEPLOYMENT_ID=customer-production-1
LICENSE_HOST=https://customer.example.com
LICENSE_ENFORCEMENT=enforce
```

## 验收

管理员登录后请求：

```bash
curl -H "Authorization: Bearer SESSION_TOKEN" http://HOST/api/license/status
```

重点确认：`valid=true`、`state=valid`、部署 ID 和域名正确，并记录返回的 `fingerprint`。
