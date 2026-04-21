# 3D Project

一个基于 Vite 和 Three.js 的 3D 汽车展厅与竞速 Demo，支持车型切换、展厅灯光效果、比赛倒计时和 HUD 结果展示。

## Online Demo

GitHub Pages 发布地址将是：

`https://<your-github-username>.github.io/3d-project/`

如果后续仓库名不是 `3d-project`，需要同步修改 [vite.config.js](./vite.config.js) 里的 `base` 配置。

## Local Development

```bash
npm install
npm run dev
```

本地预览生产构建：

```bash
npm run build
npm run preview
```

## GitHub Pages Deployment

仓库内已经包含 GitHub Actions 工作流 [deploy.yml](./.github/workflows/deploy.yml)。

发布流程：

1. 将项目推送到 GitHub 仓库 `3d-project`
2. 在仓库 `Settings > Pages` 中把 Source 设置为 `GitHub Actions`
3. 向 `main` 分支推送代码后，Actions 会自动构建并部署 `dist`

## Project Notes

- 生产环境资源路径会自动带上 `/3d-project/` 前缀，兼容 GitHub Pages 项目站点。
- `public/` 下的静态资源应通过 `import.meta.env.BASE_URL` 对应的 helper 生成 URL，不要再手写根路径。
- 当前模型资源位于 `public/car1.glb` 和 `public/car2.glb`。
