# AI-generated assets

Every asset created with an AI tool is disclosed here: tool, purpose and creation date.
AI-generated assets are never presented as real photographs. Update this file in the same PR that adds, replaces or removes such an asset.

| Asset                                                                          | Tool                             | Purpose                                                                                     | Date       |
| ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| 28 product images, `data/images/<product-handle>.jpg` (1200x1200 JPEG, square) | Codex (OpenAI), image generation | Product images for the demo catalog: a bag of coffee on a grey background. Not photographs. | 2026-10-07 |

The prompts are in [`data/images/prompts.json`](../data/images/prompts.json) and the full brief in [`data/images/brief.md`](../data/images/brief.md); both are generated from the catalog data by `npm run generate-image-prompts`. The product names and roaster names are fictional, so the pouches carry no text or logos. Every image is uploaded with alt text that starts with "AI-generated image of".

## Scope

This table covers non-code assets only: images, logos, generated product data and similar media.
