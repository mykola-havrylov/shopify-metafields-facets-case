# Product images

Products have one image each: a bag of coffee on a grey background. The images are **AI-generated**, not photographs, and are disclosed as such (alt text on every image, [ai-assets.md](ai-assets.md), the README).

Uploading and attaching them is also a worked example of a batch media job: idempotent, with a dry run, validated before anything is sent.

## Brief and prompts

`npm run generate-image-prompts` writes two files from the catalog, so they never drift from the product data:

- `data/images/brief.md`: the instruction for whoever generates the images. Output rules, the style shared by all images and, per product, the description, bag design, accent and a ready prompt.
- `data/images/prompts.json`: the same data for scripts.

What stays the same: a seamless light grey background, one soft light, a square front view with the camera slightly above, a matte stand-up pouch with a blank label.
What changes: the **bag design** follows the roaster (one packaging family per roaster), the thin **accent band** has the color of the processing method (the same color as its swatch in the theme), and the scattered **beans** have the color of the roast level.

Names are deliberately left out of the prompts: image models print whatever name they are given, and the pouches must carry no text, logos or barcodes.

## Files

Images live in `data/images/` and are named after the product handle: `yirgacheffe-kochere.jpg`. JPEG or PNG, square, 1000-4000 px (target 1200), at most 800 KB.

```sh
npm run images:check       # offline: every product has exactly one valid image, nothing unexpected
```

## Uploading

Run after `npm run seed:catalog`:

```sh
npm run upload-images -- --dry-run    # reads only
npm run upload-images                 # uploads what is missing
npm run upload-images -- --replace    # deletes the product's images and uploads again
```

Per product: `stagedUploadsCreate` (PUT target) -> the bytes are sent to the staged URL -> `productUpdate` attaches the image as media -> the script waits for Shopify to finish processing (status `READY`).

- Idempotent: a product that already has an image with the expected alt text is `UNCHANGED`. A product with other images (for example added by hand) is reported as a `CONFLICT` and left alone unless `--replace` is given. A `FAILED` image is replaced automatically.
- The alt text is `AI-generated image of a bag of <product> coffee by <roaster>`, so the disclosure travels with the image on the storefront.
- `npm run verify` requires every product to have an image in status `READY`.

## Provenance

Every generated batch is recorded in [ai-assets.md](ai-assets.md): the tool, the date and the prompt file (`data/images/prompts.json`). Update it in the same PR that adds or replaces images, and keep the tool's terms of use on commercial and public use in mind when choosing it.
