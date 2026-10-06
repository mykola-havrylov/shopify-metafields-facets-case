# Shopify metafields & facets case

Work in progress. A Dawn fork for a synthetic coffee catalog (24–30 generated products) that shows native metafields/metaobjects plus Search & Discovery facets replacing a paid app. Demo store only, not a client project.

Full case README (live link with storefront password, schema, metrics, limitations) lands in the documentation task.

## Base theme

[Dawn](https://github.com/Shopify/dawn) `v16.0.0`. Dawn's license is kept verbatim in [`LICENSE.md`](LICENSE.md); original additions are covered by [`LICENSE`](LICENSE).

## Local checks

```sh
npm ci
npm run format:check
npm run lint
npm test
npm run theme-check   # requires Shopify CLI
```

## Asset records

- [Third-party assets](docs/third-party-assets.md)
- [AI-generated assets](docs/ai-assets.md)
