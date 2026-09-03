# Faire insights for the store-video onboarding prototype

Research compiled 2026-09-02 to inform a prototype in which a new retailer films a ~15-second walkthrough of their store, a vision model extracts structured signals (categories, style, materials, colors, price positioning, visible brands), and those signals cold-start personalization of the home feed.

Sources were read in full (Craft articles via the in-app browser; faire.com pages via fetch/browser). Quotes are verbatim from the source unless marked as paraphrase.

Sections:
- A. Personalized retrieval (QRP) and where a store-video signal plugs in
- B. Designing for joy, and joy moments for the video flow
- C. Ranking factors and retailer-facing language
- D. Faire's category taxonomy
- E. Glossary of Faire terms
- Appendix: supporting ML context (engagement embeddings, GNN)

---

## A. Personalized retrieval: QRP (Query-Retailer-Product)

Source: https://craft.faire.com/personalized-search-retrieval-at-faire-b210efb21133 (Roman Shraga, "Personalized search retrieval at Faire", Mar 9, 2026)

### A.1 Why it exists

- Framing: "Because retailers with vastly different assortments, geographies, and histories can issue the same query and expect meaningfully different results, semantic relevance alone is not enough."
- Worked example: the query "women's apparel" from a fashion boutique vs. a ski and snowboard shop. "Semantically, both queries are identical, but from a personalization perspective, they are not."
- Ranking-only personalization hit a ceiling: "If the retrieval layer doesn't 'see' the most relevant products for a specific retailer, no amount of ranking sophistication can bring them into view."
- Impact: QRP "achieves 85% order recall — the highest of all our sources — and is uniquely responsible for 20% of search orders." The next-highest unique contributor accounts for 3%.

### A.2 Architecture (three towers)

"QRP is a three-tower retrieval model:
- A query tower that encodes the user's search query
- A retailer tower that encodes who is searching
- A product tower that encodes candidate products"

"The query and retailer representations are fused into a single query-retailer embedding, which is then compared against product embeddings using cosine similarity."

**Query tower.** "FaireBERT, a compact fine-tuned BERT encoder with custom Faire-specific vocabulary." Output projected to a "256-dimensional embedding space."

**Retailer tower** ("the most distinctive component of QRP"). "It is composed of four sub-towers whose outputs are fused via a lightweight transformer. To ensure the model is robust to missing data, we randomly drop out the sub components during training." The sub-towers:

1. "A multi-tower retailer embedding capturing long-term behavior. This embedding is learned separately."
2. "A feature encoder over structured attributes such as store type, age, language, and trade zone."
3. "An attention-pooled encoder over historically carted products in search."
4. "An attention-pooled encoder over historical search queries."

"Attention pooling, rather than simple averaging, was a consistent win across recall and relevance metrics. More complex transformer pooling over history did not justify its cost and complexity."

**Product tower** ("mirrors the retailer tower in spirit"; five sub-towers):

1. "Textual product embeddings from our semantic embedding retrieval model."
2. "Vision product embeddings."
3. "Multi-tower brand embeddings capturing long-term behavior at the brand level. This embedding is learned separately."
4. "Attention-pooled historical carted queries (text)."
5. "Attention-pooled historical carted queries (vision)."

"These representations are fused with a single-layer transformer and projected into the same dimensional space as the query-retailer embedding."

**Query-retailer fusion.** "the final model uses a simple weighted average" of q (query embedding) and r (retailer embedding), where "α is a learned scalar controlling the relevance-personalization trade-off." "Many more expressive fusion schemes were tested, but most either failed to improve metrics or actively harmed relevance." The simplicity matters operationally: "in production both retailer and common query embeddings could be cached."

### A.3 Training data, negatives, and losses

- Data: "trained primarily on search engagement data, with cart events as the core positive signal. Orders are treated as stronger positives, while impressions without engagement are used to construct explicit negative signals." Roughly a year of history.
- Three uses of the same events:
  - "Carted products define positives for contrastive retrieval."
  - "Relevance labels (derived from large-scale LLM based labeling) supervise a binary relevance task."
  - "Impressed-but-not-engaged products supervise an auxiliary task designed to combat over-personalization."
- Loss 1, contrastive: "aligns query-retailer embeddings with products that were carted in search while pushing them away from negatives. We use a mix of in-batch negatives and randomly sampled negatives." Graded positives: "engagements that were later judged irrelevant are down-weighted, while those that resulted in orders are up-weighted."
- Loss 2, relevance classification: "binary cross-entropy task ... supervised by graded relevance labels produced by a teacher model. Its role is to explicitly anchor the retrieval space to semantic relevance."
- Loss 3, engagement: "penalizes products which were shown but not engaged with ... encourages diversity and helps counteract over-personalization and 'siloing' effects."
- Trade-off: "accepting slightly lower raw recall in exchange for materially better relevance, engagement quality, and long-term discovery behavior."

### A.4 Evaluation

"Recall@K over engaged products"; "Segmented recall, broken down by query frequency (head, torso, tail) and retailer cohorts (e.g., low-engagement, non-NAM)"; "Relevance AUC"; "Irrelevance@K"; and "Shuffled-retailer controls, where retailer embeddings are randomly permuted to ensure the model is not overly reliant on memorizing past engaged brands and categories."

### A.5 What they said about low-engagement / cold-start retailers

- The tension is named up front: "personalization signals are uneven. Retailers with years of order history provide rich signals, while new or low-engagement retailers do not."
- Two structural answers already in the model: (a) sub-tower dropout so the retailer tower is "robust to missing data"; (b) a sub-tower of "retailer signals that are not tied to engagement" (the structured-attribute encoder), which they credit for reducing irrelevance.
- Failure modes to avoid: "Erosion of search intent" and "Discovery stagnation" (over-impressions making "the marketplace feel static").
- Explicit open question: "dynamic personalization strength for low-engagement retailers, better handling of exploration vs. exploitation, and leveraging in-session signals for dynamic personalization."
- Qualitative behavior: for broad queries like "candle" or "hats," "European retailers see more European brands, retailers with prior children's product engagement see results skewed accordingly." For narrow or brand-specific queries, "results converge."

### A.6 Vocabulary to mirror in the demo's "how it works" copy

| Faire term | Meaning |
|---|---|
| retailer tower / product tower / query tower | the three encoders |
| query-retailer embedding | the fused vector retrieval runs against |
| retailer context | who is searching (attributes + history) |
| structured attributes: store type, age, language, trade zone | non-behavioral retailer features |
| long-term behavior embedding | separately learned engagement embedding |
| carted products / historical search queries | attention-pooled history sub-towers |
| vision product embeddings | image-based product features (already in the product tower) |
| relevance-personalization trade-off (α) | learned fusion scalar |
| over-personalization / siloing / discovery stagnation | failure modes |
| low-engagement retailers | Faire's cold-start cohort name |
| Recall@K, Irrelevance@K, shuffled-retailer control | eval vocabulary |

### A.7 Proposal: where a "store video embedding + extracted attributes" plugs into the retailer tower

Treat the walkthrough as a fifth retailer sub-tower, a "store-content encoder," sitting beside the four that exist today (long-term behavior embedding, structured-attribute feature encoder, attention-pooled carted products, attention-pooled search queries). Concretely: sample the 15-second clip at ~1-2 fps, embed frames with the same vision encoder that already produces the product tower's "vision product embeddings" so that the retailer's shelves and the catalog's product photos share one visual space, and attention-pool the frame vectors (the pooling choice Faire found "a consistent win") into a single 256-d store-content vector. Feed the structured extraction (categories, style tags, materials, color palette, price positioning, visible brands) into the existing structured-attribute feature encoder as additional categorical/multi-hot features, entering exactly the way store type, age, language, and trade zone do now, which keeps this signal in the sub-tower Faire credits for being "not tied to engagement" and for lowering irrelevance. Because the retailer tower is already trained with random sub-tower dropout to be "robust to missing data," adding the video sub-tower changes nothing about the fusion transformer's contract: it is dropped during training for retailers without a video and is simply absent at serving time for the rest, so the model cannot come to depend on it. The payoff for cold start is that a zero-history retailer gets a non-default r on day one, so the learned fusion α·q + (1-α)·r is blending the query with a real retailer vector instead of a mean embedding; Faire's own qualitative examples ("retailers with prior children's product engagement see results skewed accordingly") are exactly the effect we want to reproduce from shelf content rather than from carts. Visible brands and extracted categories double as a warm start for the two history sub-towers: initialize the new retailer's long-term-behavior embedding as the attention-weighted mean of the "multi-tower brand embeddings" of brands seen on shelf (the same warm-start logic the GNN post uses across retrains), and synthesize a handful of pseudo-queries from the extraction ("hand-poured soy candles," "linen aprons," "ceramic mugs under $12 wholesale") to seed the attention-pooled historical-queries encoder so the retailer tower is not empty on those inputs either. No new labels are needed: the contrastive loss over carted products remains the target, the video-derived features are appended to training rows for retailers who have them, and the existing relevance and engagement losses keep the new sub-tower from over-personalizing or siloing. Launch criteria fall out of their existing evaluation harness, namely Recall@K lift on the "low-engagement" retailer cohort with Irrelevance@K held flat, plus a shuffled-video control (permute store-content vectors across retailers) to prove the model reads the video rather than memorizing it. Finally, the video gives a principled answer to their open question about "dynamic personalization strength for low-engagement retailers": condition α (or a per-retailer confidence gate) on whether r is content-derived or behavior-derived, and decay the video's weight as carted products and queries accumulate, so the walkthrough is the on-ramp to personalization rather than a permanent anchor.

---

## B. Designing for joy

Source: https://craft.faire.com/designing-for-joy-increased-orders-by-8-836ea307fa8a (Sam Chieng, "Designing for joy increased orders by 8%", Jun 25, 2025)

### B.1 What Faire changed

Context. "As a wholesale marketplace, Faire connects independent brands and retailers. To keep their wholesale costs low, brands often require order minimums. These order minimums can be a blocker for new retailers to the platform, making them hesitant to commit to an order." Brand order minimums "can be high (sometimes over $300), and they're one of the biggest blockers for new retailers on our platform."

Research origin. "the Faire Design team had embarked on a research project that involved running our own physical retail shop to put ourselves in the shoes of our customers." Finding: "the checkout experience — particularly the milestone of reaching a brand's order minimum — was falling flat. What should have felt rewarding and straightforward instead felt confusing and underwhelming." Goal: "transform a point of friction into a true moment of delight."

The choreographed sequence after "Add to cart" (headings verbatim):

1. **Animated cart badge and button text.** "The cart badge animates to show a new brand has been added, and the button text updates to 'Added to cart!' — a small but effective confirmation that the action was successful."
2. **Smoother, more informative success toast.** "a success toast slides in from the right, providing helpful details like the quantity added, total cart value, and the brand's order minimum. Previously, this toast appeared abruptly, which felt jarring. Adding smooth animation helps pace the moment and makes the message easier to absorb."
3. **Animated order minimum progress bar.** "we added a real-time progress bar to the toast. With each item added, the bar updates smoothly, offering clear and continuous visual feedback."
4. **Confetti upgrade and a nudge to checkout.** "While we always had a confetti animation to celebrate reaching the order minimum, the original animation felt dated and too subtle."

Illustration system. The Creative team was "updating Faire's illustration system ... The designs were bolder and more colorful, and better reflected our brand." Lead Brand Designer Chris Lopez "used elements from our new illustration system to create smaller decorative confetti, ensuring these new shapes were in line with our new illustrations." Three revisions before landing on "a design that was both delightful and technically sound."

Variables they tuned for the confetti: "Placement on screen; Timing; Overall volume/size; Speed of moment; Emotional feeling; Engineering constraints, like load time."

Tone bar: "It had to be joyful and playful without overwhelming the experience — more of an intimate birthday party than a backyard rager."

Process: "a joint kickoff between Product Design, Creative, and Engineering. Product Design shared the storyboard that mapped out the flow, edge cases, and UI transitions, Engineering provided input on feasibility and technical constraints, and Creative introduced the new illustration system and pinpointed moments where we could add the most delight."

### B.2 How they measured it and the 8% result

- Headline: "adding a small celebratory burst of color when a retailer reaches a brand order minimum in their cart — directly increased orders by about 8%."
- Attribution is to the bundle: "Alone, the new confetti animation was powerful — but combined with our other changes to the checkout experience, it completely updated how our retailers experience buy on Faire today and even impacted our bottom line, increasing orders by 8%."
- Note for our write-up: the post reports the outcome but does not describe experiment design (holdout, duration, or significance). Treat "8% orders" as Faire's reported result for the redesigned add-to-cart / order-minimum sequence, with confetti as the headline element.

### B.3 Design principles they articulated

- "always take the time to walk in your customers' shoes — you're likely missing important moments to show up for your customers in the product if you don't."
- "don't underestimate the power of designing for moments of celebration. Small elements like illustrated icons and animations can help customers visualize their progress and celebrate small (or big!) wins, helping them use your product more effectively."
- Craft: "we paid close attention to animation details like timing, sequencing, and easing. Each element on its own may seem minor, but together they tell a clear visual story — helping customers understand what's happening and what they need to do next."
- Restraint: joyful "without overwhelming the experience"; respect "engineering constraints, like load time."
- Progress made visible: the real-time progress bar toward the minimum is the mechanic that turns a blocker into a goal.

### B.4 Proposed joy moments for the onboarding video flow

Each moment follows Faire's pattern: visible progress, paced animation (timing / sequencing / easing), illustrated elements from a bold, colorful system, and a celebration sized like "an intimate birthday party."

1. **Roll camera** (pre-record framing)
   - What: a viewfinder with illustrated corner brackets and a shelf-line guide so the retailer knows what "good" looks like; a 15-second ring fills around the record button with soft haptic ticks at 5 and 10 seconds.
   - Interaction: ring fills with ease-out; at 15s it snaps closed and the button morphs into a check.
   - Copy: "Show us your shelves. 15 seconds is plenty." Sub: "Walk it like a customer would. No need to tidy up — we're looking for your style, not your dust."

2. **Reading the room** (the 10-20 second analysis wait)
   - What: instead of a spinner, three or four frames from their own clip slide in as illustrated polaroids; as the model works, small tags "peel" off the frames (a candle, a linen napkin, a terracotta swatch) and drift into a tray at the bottom.
   - Interaction: each status line keyed to an actual pipeline milestone so the copy is honest; staggered 300-400ms entrances with spring easing.
   - Copy sequence: "Looking at your shelves..." → "Noticing your palette..." → "Reading the price tags..." → "Spotting brands you already carry..." → "Almost there."

3. **Here's what we noticed** (signal reveal)
   - What: a "store profile" card assembles itself: category chips first, then style words, materials, a row of color swatches, a price-positioning slider that settles into place, and brand logos last.
   - Interaction: chips are tappable to remove or edit; removing one gives a soft shrink-out, adding one a pop-in; the card gently re-sorts.
   - Copy: "Here's what we noticed." Sub: "You know your store best — tap anything to tweak it." Confirm state: "Got it. We'll keep that in mind."

4. **Your palette** (color moment)
   - What: the extracted palette rolls out like paint chips, then briefly tints the loading surface and feed header so the product feels made from their store.
   - Interaction: chips fan out left-to-right (60ms stagger), then collapse into a single pill in the header.
   - Copy: "Your palette: warm neutrals with a hit of terracotta." (generated from the extraction)

5. **Brands that belong on your shelves** (match counter)
   - What: a counter climbs while a progress bar (a nod to the order-minimum bar) fills: "Finding brands for you..." then the number lands.
   - Interaction: count-up over ~1.2s with ease-out; bar completes just before the reveal.
   - Copy: "1,240 brands look like they belong on your shelves." Sub: "Most have low minimums, and your first order with any of them ships with free returns."

6. **Your Faire, built from your store** (the feed transforms)
   - What: the generic feed re-shuffles in place: cards crossfade into personalized ones and section headers retitle to Faire's own surfaces ("Ideas for you," "Popular with stores like yours," "Brands you might like," "New brands near you"). A small confetti burst using the same illustrated shapes fires once when the feed lands.
   - Interaction: rows animate in top-down; confetti volume kept low, no more than ~1.5s, no sound.
   - Copy: "Your Faire, built from your store." Sub: "Every row below was shaped by your walkthrough. It'll keep learning as you browse, follow brands, and add to cart."

7. **From your walkthrough** (provenance receipts)
   - What: recommended products carry a small tag that explains why; tapping it opens the exact frame from their video that triggered it.
   - Interaction: tag expands into a mini card with the frame thumbnail and the matched attribute highlighted.
   - Copy examples: "From your walkthrough: ceramic + linen." / "Because you carry hand-poured candles." / "Priced like the rest of your shelf."

Guardrails borrowed from Faire: one celebration per flow (the feed landing), everything else is progress feedback; test load time of any confetti asset; keep copy in second person and about the retailer's store, not about the model.

---

## C. Ranking factors and retailer-facing language

### C.1 Help center: "Understanding Search and Ranking on Faire"

Source: https://www.faire.com/support/articles/360060904552

- Purpose statement: "Faire's search engine uses machine learning to provide a customized shopping experience to our retailers which enables them to easily find products for their stores."
- Scale: "We consider over 100 factors to determine how we rank search results. This helps us produce a list of products that is personalized and unique to each retailer."
- Three categories that contribute to ranking (verbatim headings):
  1. **Product names, descriptions, and categories** — "We first match the search terms that retailers use with words used in your product title, description, product type, and category. Exact matches will automatically be prioritized in the ranking, and synonyms or relevant items will be included after exact matches."
  2. **Retailers' prior activity and engagement** — "We consider the retailers' previous search and purchase history, answers to preference quizzes, navigation behaviors on the site, and even products that similar retailers have purchased. The more likely we think a product is to be added to the retailers' cart, the higher we'll rank it."
  3. **Brand performance** — "Product conversion," "Review rating," "Return rate," "Order cancellations," "Order fulfillment timing." Weighted "based on broad patterns over weeks and months, not on individual actions."
- Category navigation: "we fetch the top 1000 products within that category, based on text relevance and the retailers' historical activity and engagement on Faire." "the same ranking logic is applied to both search results and category navigation results."
- Price/minimum signals: "Retailers will often filter search results by minimum prices, we recommend keeping minimums at $150 or lower."
- Note the phrase "answers to preference quizzes": Faire already treats explicit onboarding preferences as a ranking input. The store video is a richer, lower-effort preference quiz, which is the cleanest one-line framing for the prototype.

### C.2 Blog: "5 new ways to find fresh brands on Faire"

Source: https://www.faire.com/blog/for-retailers/5-new-ways-to-find-fresh-brands-on-Faire (For retailers, July 20, 2026)

Surfaces named: "the homepage, product pages, brand pages, Trends Hub, and Local Hub."

1. **Find more new arrivals on your homepage** — "products from brands that recently joined Faire, shown alongside the categories, styles, and suppliers you already browse." Feed name: "the Ideas for you feed." Feedback loop: "Follow a few brands that feel like a fit, browse their catalogs, or add promising products to cart. Those actions help shape future recommendations."
2. **Discover fresh options when comparing products** — "newer brands in the same category, style, or price range." Sections: "'Similar products' and 'Popular with stores like yours'."
3. **Browse brands inspired by ones you already love** — "the Brands you might like section includes new and emerging brands that share a similar style, category, or customer fit."
4. **Spot fast-moving products in the Trends Hub** — "products that are selling unusually well compared with their own recent history, then personalizes the experience based on your category and buying behavior."
5. **Shop nearby brands in the Local Hub** — "add local products," "add regional depth," "bringing a more local story to the shelf."

Closing language worth reusing: "products that fit your unique store and customers"; "Build an assortment that feels fresh, relevant, and distinct"; "Every product you buy has to earn its place on your shelves."

### C.3 Signal map: what Faire says it uses vs. what the walkthrough provides

| Faire signal (their words) | Retailer-facing surface / phrase | What the video supplies on day one |
|---|---|---|
| categories, product type | "same category," category navigation | extracted categories / subcategories |
| styles | "similar style," "styles ... you already browse" | style tags (e.g., modern farmhouse, minimalist, boho) |
| price range | "same ... price range," minimum filters | price positioning from visible tags / product tier |
| similar retailers / customer fit | "Popular with stores like yours," "similar ... customer fit" | store type + assortment vector to find neighbors |
| store type, trade zone, language, country | structured attributes (QRP/GNN) | store type inferred from layout; location from account |
| local | "Local Hub," "nearby brands" | account location (not from video) |
| new brands | "New Brands," "brands that recently joined Faire" | exploration slot sized by confidence |
| brands engaged | brand embeddings, "Brands you might like" | visible brands on shelf |
| preference quiz answers | onboarding preferences | the video is the quiz |
| follows, carts, orders | "Those actions help shape future recommendations" | not available yet; video decays as these accrue |

---

## D. Faire's category taxonomy (as shown in the faire.com navigation)

Source: https://www.faire.com (navigation, fetched 2026-09-02). Note: https://www.faire.com/categories returns 404; the taxonomy below is the top two levels of the site nav. The GNN post says Faire has "more than 2,000 categories," so leaf-level taxonomy is deeper than this. URL pattern observed: `/category/Home%20Decor`, `/category/Beauty%20&%20Wellness/subcategory/Skincare`, `/category/Paper%20&%20Novelty/subcategory/Stationery%20&%20Writing`, `/category/Women/subcategory/Apparel`, `/category/Gifts`, `/category/Trending%20Products`.

Top-level nav items: Featured, New Brands, Home Decor, Food & Drink, Women, Beauty & Wellness, Jewelry, Paper & Novelty, Kids & Baby, Pets, Men, Books. Also observed as hubs: Gifts, Trending Products (Trends Hub), Local Hub.

- **Home Decor**: Bath; Bedding; Candles & Holders; Garden & Outdoor; Home Accents; Home Fragrances; Household Supplies & DIY; Kitchen & Tabletop; Storage & Organization; Throw Pillows & Blankets; Wall Decor
- **Food & Drink**: Baking; Beverages; Cereals, Grains, & Pastas; Coffee & Tea; Condiments & Sauces; Confections; Dairy & Meats; Jams & Spreads; Snacks; Food Baskets & Kits
- **Women**: Accessories; Footwear; Apparel
- **Beauty & Wellness**: Bath & Body; Fitness & Yoga; Fragrance; Health & Wellness; Haircare; Makeup; Men's Grooming; Personal Care; Skincare; Spa & Spiritual; CBD Topicals
- **Jewelry**: Body Jewelry; Bracelets; Brooches; Cufflinks & Tie Clips; Earrings; Jewelry Sets; Jewelry Storage & Care; Necklaces; Rings; Watches
- **Paper & Novelty**: Crafts & Hobbies; Games & Puzzles; Gift Wrapping; Greeting Cards; Party Supplies; Stationery & Writing; Stickers, Pins, & Magnets
- **Kids & Baby**: Bath & Safety; Gear & Essentials; Maternity; Nursery & Decor; Paper & Novelty; Toys & Learning; Baby Accessories; Kids Accessories; Baby Apparel; Kids Apparel
- **Pets**: Cats; Dogs; Other Pets
- **Men**: Grooming; Accessories; Footwear; Apparel
- **Books**: Fiction & Literature; Non-Fiction; Kids & Young Adult; Magazines & Decorative Books; Book Accessories
- **New Brands**: mirrors the main categories, filtered to recently joined brands
- **Featured**: rotating editorial section (no fixed subcategories in the nav)

Mapping notes for the prototype's extraction schema: "candles" maps to Home Decor > Candles & Holders (and Home Fragrances); "kitchen & tabletop" is a real subcategory name; "stationery" is Paper & Novelty > Stationery & Writing; "apparel" lives under Women, Men, and Kids & Baby; "garden" is Home Decor > Garden & Outdoor; "beauty & wellness," "food & drink," "kids & baby," "pets," and "jewelry" are top-level names and should be used exactly as written.

---

## E. Glossary of Faire terms (one-liners for native-sounding copy)

Sources: https://www.faire.com ; https://www.faire.com/support/articles/360015892572 ; https://www.faire.com/support/articles/360016658851 ; https://www.faire.com/support/articles/360015892592 ; https://www.faire.com/support/articles/4645924980763 ; https://www.faire.com/support/articles/360019040531 ; https://www.faire.com/insider ; https://www.faire.com/open-with-faire

- **Retailer** — the buyer on Faire: anyone "buying inventory for a brick-and-mortar store, online shop, or pop-up shop." (Faire cites roughly 3 million retailers in the Jan 2026 GNN post.)
- **Brand** — the seller/maker whose products retailers buy wholesale (roughly 140,000 brands per the same post). Faire's tagline: "The global wholesale platform powering independent retail."
- **Wholesale price** — what the retailer pays the brand per unit; the standard expectation is that retailers "sell your products at a reasonable margin. Typically that margin is 50%—or 2x the wholesale price."
- **MSRP / retail price** — the suggested shelf price a consumer pays; Faire's pricing policy requires "wholesale and MSRP pricing must be the same or lower on Faire as on other places you sell your products."
- **Order minimum** — the smallest order value a brand accepts per order; the site promises "Low order minimums—Thousands of brands with low or no minimums," Faire recommends brands keep minimums "at $150 or lower," and reaching a brand's minimum in cart is the moment that triggers confetti.
- **Net 60 / 60-day payment terms** — "a payment option we offer on Faire that allows you to buy new inventory now and pay for it 60 days later"; "Faire covers the upfront cost of your order"; "this is not a loan and we do not charge interest." Site copy: "60 days to pay, interest free."
- **Payment on shipment** — the alternative to terms: "your payment will be due when the order is shipped by the brand."
- **Free returns on first order** — "We offer free returns on your first order with any new brand you try. If you're not satisfied, we'll send you a prepaid shipping label." Also phrased as "free returns on all opening orders" and "Free and easy returns—You get free returns on every first order with a brand."
- **Insider** — Faire's paid retailer membership: "Free shipping on thousands of brands," early access to online buying events, and phone support, for a "$19.99/month membership fee" after a free 30-day trial.
- **Open with Faire** — "a program that helps new store owners successfully open their businesses. The program offers $2,500 up to $20,000 in interest-free, 60-day payment terms." Eligibility: opening this year, opened in the last 12 months, or expanding to a new location. Headline: "Dream store, here we come."
- **Faire Direct** — a brand's own link/widget that brings its existing retail partners onto Faire (retailers may receive Faire Direct credit, which is non-refundable).
- **Faire Markets** — Faire's online buying events (Insider members get early access).
- **Top Shop** — a brand quality program with a quarterly catalog check; non-compliance with pricing reviews can mean "disqualification from programs like Top Shop."
- **Ideas for you** — the personalized homepage feed.
- **Popular with stores like yours / Similar products / Brands you might like** — named recommendation sections on product and brand pages.
- **Trends Hub / Local Hub** — hubs for "products gaining momentum on Faire" and "nearby brands."
- **Faire Messenger** — in-platform messaging between retailers and brands.

---

## Appendix: supporting ML context

### Engagement-based embeddings (Jan 17, 2023)

Source: https://craft.faire.com/how-we-use-engagement-based-embeddings-to-improve-search-and-recommendation-on-faire-912277de4e6d (Qinyu Wang)

- Scale at the time: "over 600,000 independent retailers with over 85,000 brands."
- Migrated from LightFM (factorization machine) to a PyTorch "two-tower model architecture (inspired by the work from Youtube)" with "a retailer tower and a product tower" and cosine similarity.
- Positives: "add-to-cart, checkout, and product page visits." Negatives: "in-batch shuffling during the training process to generate negative samples on the fly" (K = 3 shuffles), with a "Modified WARP loss."
- Side features pooled into the product embedding: "the product's brand, the product's taxonomy type, and the product's country." These are the earliest published example of non-behavioral features in Faire's retailer/product embeddings and a precedent for adding video-derived attributes.
- Surfaces: category navigation and search (Elasticsearch rescore of top 100k candidates, +20ms), brand page "similar brands," and the homepage where "for each individual carousel, we rank products and brands based on their retailer<>product/brand embedding similarity score."
- Also mentioned: "query<>product embeddings" and "Multi-Modal Embedding trained on product description and product image."

### Graph neural networks (Jan 15, 2026)

Source: https://craft.faire.com/graph-neural-networks-at-faire-386024e5a6d9 (Bo Ning Wang)

- Scale: "roughly 3 million retailers with over 11 million products across more than 2,000 categories sold by 140,000 brands."
- Motivation directly relevant to cold start: prior DeepFM "primarily memorizes past engagement and struggles to generalize to new products or exploratory behavior"; the graph approach can "surface new, relevant items even when direct engagement signals are sparse."
- Graph: "a bipartite engagement graph connecting retailers and products." **Retailer node features**: "categorical embeddings from retailer-specific attributes like store type, country, and an ID embedding unique to the retailer." **Product node features**: "pre-trained text embeddings derived from product attributes (such as the product name and description)" plus "the product's category, its brand (and the brand's country), and a learned product ID embedding."
- Edges weighted by "the frequency of interactions and the type of engagement (click, favorite, add-to-cart, order)" with time decay.
- Architecture: two-tower GNN with "graph attention network (GAT) convolution," one-hop neighbor sampling (up to 50 neighbors), MLP projection, dot-product similarity, served via "a real-time K-nearest-neighbor service (using Elasticsearch)."
- Training: edge-weighted BCE; in-batch plus global negatives; dual optimizers; "warm-start initialization for the embeddings" across retrains.
- Results: time-decayed edge loss lifted recall@10 by "+25.8% (relative)"; online A/B on category navigation pages: "+10.5% increase in order recall@10," "+12% increase in order recall@100," and "+4.85% lift in orders on the category pages."
- Roadmap: multi-hop aggregation, adding brand and category nodes to a heterogeneous graph, multi-task engagement objectives.
- Implication for the prototype: a new retailer with no edges is represented only by store type, country, and an untrained ID embedding; video-derived attributes are a natural extension of the retailer node feature vector, and visible brands give the retailer initial (pseudo-)edges into the graph.

---

## Source list

1. https://craft.faire.com/personalized-search-retrieval-at-faire-b210efb21133
2. https://craft.faire.com/designing-for-joy-increased-orders-by-8-836ea307fa8a
3. https://craft.faire.com/how-we-use-engagement-based-embeddings-to-improve-search-and-recommendation-on-faire-912277de4e6d
4. https://craft.faire.com/graph-neural-networks-at-faire-386024e5a6d9
5. https://www.faire.com/support/articles/360060904552
6. https://www.faire.com/blog/for-retailers/5-new-ways-to-find-fresh-brands-on-Faire
7. https://www.faire.com (category navigation and marketing copy)
8. https://www.faire.com/support/articles/360015892572 (benefits of buying on Faire)
9. https://www.faire.com/support/articles/360016658851 (60-day payment terms)
10. https://www.faire.com/support/articles/360015892592 (how returns work)
11. https://www.faire.com/support/articles/4645924980763 (What is Open with Faire?)
12. https://www.faire.com/support/articles/360019040531 (pricing policy, wholesale/MSRP)
13. https://www.faire.com/insider
14. https://www.faire.com/open-with-faire
