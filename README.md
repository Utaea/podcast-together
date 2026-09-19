# 一起听播客

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Utaea/podcast-together/tree/main/worker)

<img src="./resources/screenshot_index.png" width="700" />

<img src="./resources/screenshot_listening.png" width="700" />

> 跟你的好友一起实时连线听播客！

<br>

## 😎 如何使用

1. 打开小宇宙 App，在单集详情页，点击屏幕右上角的分享按钮（如下图所示），再点击复制链接。

<img src="./resources/xyz_share.jpg" width="500" />

2. 访问部署后的前端地址创建房间，依页面提示粘贴上一步复制的链接即可。

<br>

## 🎧 介绍

网易云音乐能一起听歌却不支持一起听 Podcast，小宇宙也不支持，Spotify 需要成为会员才能一起听......

百度了一下，没有人提供这项服务，我就只好自己开发了🥲

### 1 无需登录，直接听

输入昵称，就可以进入房间，跟好友一起听啦！目前最多支持 15 人同时一起听。

### 2 支持小宇宙 / Apple Podcast 中国区

目前已知支持 `xiaoyuzhoufm.com/episode/` 或者 `podcasts.apple.com/cn/` 的链接（不支持短链），后者解析稍慢是正常的，如果解析失败不妨稍后再尝试。

另外，还支持 https 协议的 CDN 链接，也就是你上传 `.mp3` 文件至任意可公网访问的云上，获得 https 链接后即可粘贴到创建页面中一起听。

### 3 支持深色模式

<img src="./resources/screenshot_index_dm3.png" width="700" />

<img src="./resources/screenshot_listening_dm.png" width="700" />

<img src="./resources/phone_room.png" width="500" />

从一开始就支持深色模式！晚上一起听，再也不亮瞎眼🙈

### 4 没了

功能这么少？一起听，应该如此简单！

<br>

## 🧑‍💻 部署

本项目支持将前端独立部署到 Cloudflare Pages，后端部署到 Cloudflare Workers。
具体步骤参见 [`CLOUDFLARE.md`](./CLOUDFLARE.md)。

<br>

## 特别鸣谢

以下名单不区分先后顺序。

1. [Vite](https://cn.vitejs.dev/) + [Vue 3](https://staging-cn.vuejs.org/) + [Vue-Router](https://router.vuejs.org/zh/guide/) + [Pinia](https://pinia.vuejs.org/)

你值得拥有的前端工具链

2. [TypeScript](https://github.com/microsoft/TypeScript)

让前端开发具备类型检查的能力。我常阅读[这份指南](https://ts.xcatliu.com/)

3. [Shikwasa](https://github.com/jessuni/shikwasa)

一个开源、专为播客设计的前端网页播放器。

4. [pnpm](https://www.pnpm.cn/)

对 npm 软件包管理器做了一系列改进。

5. [小宇宙](https://www.xiaoyuzhoufm.com/)

感谢小宇宙的单集链接支持 Open-Graph 协议，能获取到 og:audio 的 meta 标签

6. [fluentui-emoji](https://github.com/microsoft/fluentui-emoji)

感谢微软开源的 emoji，非常 Nice!!!

7. [uiball-loaders](https://uiball.com/loaders/)

超好看且好用的加载图标/动画，没有之一。

8. 你

~~谢谢你玩我~~

谢谢你看到这里！

## 开源协议

MIT
