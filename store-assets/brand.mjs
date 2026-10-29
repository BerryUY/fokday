// Per-project brand config. Fill it from the real brand (site CSS, logo SVG) — never invent colors or fonts.
export const BRAND = {
  name: 'Marca',
  logo: 'logo.svg',            // file inside assets/brand/
  logoLight: null,             // optional version for dark slides
  wordmarkHtml: 'marca<span style="color:var(--accent-deep)">.</span>', // '' if the logo already contains the name
  fontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..600&family=JetBrains+Mono:wght@400;500;600&family=Sora:wght@300..800&display=block',
  handle: '@marca',
  web: 'marca.com',
};
