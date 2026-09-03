# Sample store assets — research notes

Assets live in `public/samples/<store-slug>/` (`01.jpg`…`06.jpg`, `cover.jpg`, optional `walkthrough.mp4`); metadata is in `public/samples/manifest.json`.
All photos were downloaded at ≤1600px, viewed individually, then normalized with macOS `sips` (max edge 1600px, JPEG q85; `cover.jpg` is a 400px-wide thumbnail of `01.jpg`).

## Sources and licensing

| Source | License | Terms that matter here |
|---|---|---|
| Unsplash | [Unsplash License](https://unsplash.com/license) | Free for commercial and non-commercial use, no permission or attribution required (credit is given anyway in the manifest). Cannot be used to build a competing stock service; visible brands/people are not released. |
| Pexels | [Pexels License](https://www.pexels.com/license/) | Free to use, modify, no attribution required (credited anyway). Identifiable people, brands, and private property in photos are not model/property-released; do not imply endorsement. |

No Google Maps, Yelp, Instagram, or brand-website imagery was used. Wikimedia Commons was queried via its API but its results for gift/apparel interiors were thin and mostly CC BY-SA (share-alike) or off-type (Cracker Barrel, Home Depot, museum shops), so nothing from Commons was used.

Access notes: `unsplash.com` search/napi pages and `pexels.com`/`pixabay.com` search pages are behind Anubis/Cloudflare bot-checks for curl, and the Browser pane refused `unsplash.com`. The WebFetch tool renders those search pages fine, so discovery was done with WebFetch (search page → photo IDs + alt text), and downloads used the un-gated endpoints: `https://unsplash.com/photos/<id>/download?force=true&w=1600` (302 to `images.unsplash.com`; the redirect's `dl=` filename carries the photographer slug) and `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=1600`. Pexels videos are at `https://videos.pexels.com/video-files/<id>/<id>-{uhd|hd|sd}_<w>_<h>_<fps>fps.mp4`; the exact variant names were found by probing HEAD requests (the `/video/<id>/download/` endpoint 404s).

## bookshop — "Marginalia Books & Paper" (Book Store)

| File | Source | Credit | Why |
|---|---|---|---|
| 01 | Unsplash lUVOWdpPEW4 | Christopher Stites | Warm indie bookstore: wooden shelves, face-out displays, chandelier, whale mural, suspended books. Cover image. |
| 02 | Pexels 3952095 | Ksenia Chernaya | Sunlit bookstore with tables of art/photo books and a hanging polar bear. Russian shelf labels visible; tiny pedestrians outside the window only. |
| 03 | Pexels 29509137 | Zeynep M. | Bright cozy indie shop: book table, window seat, white shelves. |
| 04 | Pexels 17910625 | Zeynep M. | Backlit cookbook shelves with a wooden ladder. |
| 05 | Pexels 18176577 | Rao Qingwei | Gift/stationery table inside a bookstore (koi lantern, framed prints, notebooks, plush). Some licensed (Harry Potter) merch is visible. |
| 06 | Pexels 5865624 | Rachel Claire | "Cards $6 by local artists" display on a bookshop counter with children's books and plush. The store's own name appears on flyers; the dark rectangle is the back of a monitor (no screen content). |

No video: every Pexels "bookstore" clip features a person browsing (the one people-free candidate, 1580502, is a library).

Rejected/alternates: Cvw4fs16tmI (KaLisa Veer, used-book aisle with ladder — strong alternate, portrait), GbGit2Az57Y (Qingyu, face-out art books — alternate), 28826082 (stationery shop, film grain — alternate), YoQbGvLu8DE (two shoppers mid-frame), 2JIvboGLeho (Stockholm public library, not a store), wBhsiYCkSIs (Daunt Books — large, recognizable), Cux2L7lpDnQ (modern art-book gallery look), UiCjeZm9C3U / P8gLaJ-PZL0 (close-ups), JQpgb0CijyI (person's arm), 6436374 (Paris shop, shopper in the back), 32472616 / 10792150 / 57I496odF5c / Kfha_Cs1N4k (too dark or cluttered).

## home-gift — "Hearth & Ember Home" (Home Decor Store)

| File | Source | Credit | Why |
|---|---|---|---|
| 01 | Pexels 5531743 | Rachel Claire | Eclectic home-goods boutique: candles, skincare, pillows, throws, ceramics, framed art. Cover image. |
| 02 | Unsplash gIK8upCKV9A | Zoshua Colah | Wall of neutral textured vases on wood-panel shelving with price tags (reads like a larger retailer, but a perfect "neutral minimalist" shot). |
| 03 | Pexels 14723067 | Matthias Briz | White cubby shelves of planters/ceramics with trailing pothos and a ladder — modern-farmhouse plant & pottery shop. |
| 04 | Pexels 5490931 | Rachel Claire | Scandinavian design store: letter banner, lamps, textiles, desk accessories. |
| 05 | Unsplash q0CNR8R8oLg | Anton Borzenkov | Black-and-white vases on industrial shelving, candles, bottles on a concrete table — minimalist concept store. |
| 06 | Pexels 11949990 | Nico de Beer | Handmade-goods shop under a reed ceiling: ceramics, wooden utensils, baskets, linens (some apparel too). |

Video: Pexels 7668419 (MART PRODUCTION), 15.5s, 2732×1440, 9.4MB. Slow pan over hand-glazed pottery on a shop table with racks behind; no people. Not a room walkthrough, but usable as "walkthrough" b-roll. Alternate: 7669187 (same shoot, 12s, 6MB).

Rejected/alternates: 6265333 (Kaderdygnn, wooden kitchen-utensil bazaar — warm but cluttered; alternate), 14770811 (Amar, grand garden/antiques showroom — too large), 14529355 / 14770809 / 14770817 (Amar, pottery shelves — decent alternates, portrait), 6252266 / 6252261 / 7314464 / 5402991 / _GDHAgMgs7A (Moroccan/Turkish ceramics — colorful, off-brief), ABb49AEqNvI / GOynU9HLxPo (typewriter antiques), 27180805 / 30155592 / 15173335 (product close-ups), Vze7JtQMARM (outdoor stall), 28805061 / 29989998 / 5865772 (cluttered vintage), Hb1H5cafAbM (busy), 7JpFEW-8ySk (gift boxes, weak).

## boutique — "Juniper & June" (Apparel Boutique)

| File | Source | Credit | Why |
|---|---|---|---|
| 01 | Pexels 8386651 | Ron Lach | Bright white boutique: pastel pink/blue/cream racks around a bird-of-paradise plant. Cover image. |
| 02 | Unsplash O8lxsc1RwCQ | Tyler Davis | Boho rack of blush/sage tops with leather bags and candles on the shelf above. |
| 03 | Pexels 3965551 | Ksenia Chernaya | Brass rail of dresses, plants, terracotta fitting rooms with linen curtains. |
| 04 | Pexels 8386654 | Ron Lach | Pink houndstooth cardigan, lime pleated skirt, and pastel heels on a white/brass rack. |
| 05 | Pexels 1827130 | Zhanzat Mamytova | Pink-toned loungewear boutique: robes on a rack, slippers, folded knits, Hollywood mirror, gift baskets. |
| 06 | Pexels 14789188 | Yasemin Aydoğdu | Jewelry corner: layered necklaces on busts, ring trays, earrings on a slate board, dried flowers. |

Video: Pexels 8322393 (Ron Lach), 18.8s, 1080×2048 vertical, 9.7MB. Slow shot of clothing racks in a boutique; no people (frames sampled at 5/30/55/80/97%). Vertical framing mimics a phone recording. Alternate: 8306450 (Ron Lach, landscape, 5s, 7.8MB).

Rejected/alternates: 7679718 (MART PRODUCTION, necklace stand with racks behind — good alternate for jewelry), 1488467 (Kish, mannequins with bags — darker, mall-like; alternate), 10689371 (Alyssa DeGarde, dresses in window light — overexposed, sanitizer dispenser in frame), 32549955 (mall storefront, exterior), 16470015 (ZARA tag), 4169370 (person's hair in frame), 5531709 / 5531541 / 5864245 / 8311890 (dark/monochrome), 8306359 (hanger close-up), 7679757 (fitting-room mirror), 5418892 / 5424922 / 4940756 / 35717265 (minimal or gray, off-brief), jewelry rejects 20299702 / 33561789 / 11048312 (fine-jewelry vitrines), 18120192 (bracelet close-up), 38209396 (B&W).
