# AI-generated assets

Every asset created with an AI tool is disclosed here: tool, purpose and creation date.
AI-generated assets are never presented as real photographs. Update this file in the same PR that adds, replaces or removes such an asset.

| Asset                                                                          | Tool                             | Purpose                                                                                     | Date       |
| ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| 28 product images, `data/images/<product-handle>.jpg` (1200x1200 JPEG, square) | Codex (OpenAI), image generation | Product images for the demo catalog: a bag of coffee on a grey background. Not photographs. | 2026-10-07 |

The prompts are in [`data/images/prompts.json`](../data/images/prompts.json) and the full brief in [`data/images/brief.md`](../data/images/brief.md); both are generated from the catalog data by `npm run generate-image-prompts`. The product names and roaster names are fictional, so the pouches carry no text or logos. Every image is uploaded with alt text that starts with "AI-generated image of".

## Status of the images

The product images in `data/images/` were generated using OpenAI tools through Codex for this portfolio demo. They depict fictional products and are not photographs of actual merchandise.

The repository author does not assert copyright in the AI-generated portions of these images. This statement does not determine their copyright status under applicable law or waive any third-party rights. The repository's MIT [`LICENSE`](../LICENSE) is unchanged and applies to the code, scripts, tests and documentation; it is not a claim over these images.

Terms that apply to the use of the output: [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/).

## Scope

This table covers non-code assets only: images, logos, generated product data and similar media.
