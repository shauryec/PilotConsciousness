# Pilot Consciousness

Advanced human-factors flight instruction. One-page marketing site.

**Live site:** https://pilotconsciousness.com *(once DNS is configured — see below)*

---

## What's here 

- `index.html` — the entire site. Single self-contained file: HTML, CSS, and JS all inline. No build step, no dependencies to install.
- `CNAME` — tells GitHub Pages to serve this repo at the custom domain `pilotconsciousness.com` instead of the default `github.io` URL. Delete this file if you don't want to use a custom domain yet.

Fonts (Oswald, Inter, JetBrains Mono) load from Google Fonts over a CDN link in the `<head>` — nothing to install locally.

---

## Deploy with GitHub Pages (free hosting)

1. **Create the repo.** On GitHub, click **New repository**. Name it whatever you like (e.g. `pilotconsciousness-site`). Public repos get free Pages hosting; private repos need a paid plan for Pages.

2. **Push this code.** From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

3. **Turn on Pages.** In the repo on GitHub: **Settings → Pages**. Under "Build and deployment," set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.

4. **Wait a minute, then check.** GitHub gives you a URL like `https://YOUR-USERNAME.github.io/YOUR-REPO/`. Open it — the site should be live there within a minute or two.

---

## Connecting the custom domain (pilotconsciousness.com)

The `CNAME` file in this repo already tells GitHub Pages to expect this domain. You still need to point the domain itself at GitHub — that part happens with your domain registrar (wherever you bought pilotconsciousness.com — GoDaddy, Namecheap, Google Domains, etc.), not on GitHub.

1. **At your domain registrar**, add these DNS records for the apex domain (`pilotconsciousness.com`):

   | Type | Name | Value |
   |------|------|-------|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |

   And, if you also want `www.pilotconsciousness.com` to work:

   | Type | Name | Value |
   |------|------|-------|
   | CNAME | www | YOUR-USERNAME.github.io |

2. **Back on GitHub**, go to **Settings → Pages**, enter `pilotconsciousness.com` under "Custom domain," and save. GitHub will verify DNS automatically (can take up to 24 hours, usually much faster).

3. **Enable HTTPS.** Once DNS verifies, check "Enforce HTTPS" in the same settings panel. GitHub issues a free certificate.

Full official reference: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site

---

## Editing the site

Everything lives in `index.html` — copy, styles, and the small scroll-progress script are all in that one file. To change text, search for the relevant section by its `id` (`hero`, `philosophy`, `who`, `method`, `doctrine`, `cta`) and edit the text directly. To preview changes locally, just open `index.html` in a browser — no server required.

The one contact address currently in the file is a placeholder:
```
mailto:hello@pilotconsciousness.com
```
Search and replace it with the real inbox before going live.

---

## License

All content © Pilot Consciousness. Not licensed for reuse.
