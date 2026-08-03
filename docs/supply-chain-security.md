# 发布物签名与供应链验证

## 发布策略

- GitHub 仓库为私有仓库，核心 Agent、MCP 编排和商业授权实现不再匿名公开。
- 每次 `main` 部署都会为前后端镜像写入 OCI 来源、commit SHA 和许可证标签。
- Docker Buildx 生成最大级别构建来源证明和镜像内 SBOM。
- GitHub OIDC 通过 Sigstore/Cosign 为前后端镜像做无长期密钥签名。
- Anchore Syft 额外生成 SPDX JSON SBOM；SBOM 本身通过 Cosign 生成 Sigstore bundle，保留 90 天。

## 验证官方镜像

把 `IMAGE@sha256:DIGEST` 换成实际镜像引用：

```bash
cosign verify \
  --certificate-identity "https://github.com/Suiyufba/enterprise-flow-hub/.github/workflows/deploy.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  IMAGE@sha256:DIGEST
```

验证结果中的 GitHub Actions 身份、仓库、workflow、commit 和镜像 digest 必须一致。签名附着在 GHCR 的 OCI referrer 中，可用 `cosign tree IMAGE@sha256:DIGEST` 查看。

## 验证 SBOM

从对应 Actions 运行下载 `signed-sbom-bundles-COMMIT`，再执行：

```bash
cosign verify-blob \
  --bundle backend-sbom.sigstore.json \
  --certificate-identity "https://github.com/Suiyufba/enterprise-flow-hub/.github/workflows/deploy.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  backend-sbom.spdx.json
```

## 授权边界

代码可见性、许可证、运行时授权和发布签名解决不同问题：

1. 私有仓库限制源码获取。
2. PolyForm Noncommercial 1.0.0 明确非商业使用范围。
3. Ed25519 运行时授权绑定合法商业部署。
4. Cosign/SBOM 证明官方发布物的来源和完整性。

以上机制均为公开、可审计的本地验证或供应链证明，不包含秘密遥测。
