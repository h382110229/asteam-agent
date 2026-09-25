# ECCOM visual expression

## Purpose and boundaries

Start from what the audience needs to understand, not from how many paragraphs need to fit in boxes. Preserve the enterprise shell, source facts, and Baoyu's freedom to compose the body. Variety is useful only when it clarifies meaning.

Do not imitate a long web page: avoid tiny type, infinite scrolling, and interaction that disappears in a presentation. Prefer static, directly readable HTML; use the editable PPTX path when that format is requested. This guide is a judgment aid, not a Planner, Layout Router, chart engine, or component library.

## Extend the existing scratchpad

Reuse the existing title sequence and scratchpad; do not create a separate planning artifact. For each substantive content page, briefly note:

- the focus;
- the key evidence or source;
- source-critical items that cannot be dropped or redefined;
- the most important relationship or difference;
- the intended visual focus and necessary text.

One sentence may cover several fields. Do not force a table. A single fact, or a point that is clearer as prose, does not need a relationship diagram. Some detail may belong in speaker notes or an appendix, but never silently remove a key argument or win a visual review only by deleting content. Chart rows and columns, classification dimensions, and level definitions are facts: wording may be condensed, but do not silently delete rows or change meaning. Split pages for the speaking task, not to reach 22 pages or preserve the source page count.

## Compose meaning, not containers

Use scale, position, alignment, connection, contrast, color, and whitespace to express relationships that the source supports. Choose the form by judgment; there is no required mapping from a relationship type to a layout.

Let color carry stable meaning where the source supports it and follow the existing brand contract. If color or a check mark represents an example state, state its meaning and source. Do not add a new default palette. Use cards for genuine grouping, not to wrap every paragraph into an equal-weight tile. Content blocks may have different sizes. Do not change style merely to make adjacent pages look different.

SVG, Canvas, charts, local gradients and limited interaction are available when they clarify hierarchy, dependencies, differences, boundaries, proportion, flow or feedback. Semantic SVG diagrams are not decorative hand-drawn illustrations and are not excluded by the upstream illustration guidance. Prefer static DOM for text, layout, backgrounds and images; add scripts only for useful chart behaviour, comparison or demonstration. Do not require a picture on every page, layout rotation, a fixed component set, or counts of animations or components as evidence of quality.

### Three short contrasting examples

- **Three-layer evaluation:** If the point is structure, show the hierarchy. If the point is diagnosis, follow one failed check through its investigation. Do not draw three equal boxes merely because there are three sections.
- **Continuous feedback:** If the source supports a feedback relationship, make visible direction, where the result returns, and what it changes. Do not label a linear sequence a loop.
- **Flow, tree, or matrix:** Make direction or branching, hierarchy, and labels readable; preserve the selected matrix's row, column, and level meaning.
- **Complex architecture source image:** Choose a full image, a focused enlargement, a stepwise reveal, or a faithful simplification according to the page's question. Do not squeeze two dense images onto one page just to maximize source-image coverage.

These examples describe reasoning, not a default mode, menu, or template.

## Source images and readability

Before planning, inspect each source image and its surrounding context rather than relying only on text extraction, and keep a minimal image-to-source record. Record whether an image is adopted, enlarged, faithfully redrawn, or omitted and why. Use images when the content calls for them; neither all images nor no images are required, and unrelated advertising material does not need to be carried over. Preserve relationships and source labels, and do not attach the wrong image to a claim.

Important labels must be readable at normal presentation size. A label that is readable only after enlarging a screenshot does not pass. Inspect the image's intrinsic resolution, displayed area, and density of text inside the image; CSS font size or scale alone is not enough. When an image is difficult to read, reorganize the content, split the page, or highlight a meaningful region. Do not merely shrink it further.

If redrawing is necessary, preserve source facts and semantic relationships; do not invent relationships. For PPTX delivery, use the existing verified HTML-native export path first for text and simple shapes that must remain editable. Complex SVG may be rasterized; its editability boundary is judged by Gate R2, not claimed as fully native. HTML delivery does not require conversion of all content to editable PowerPoint objects. A purely conceptual decorative image is optional. Do not use image generation as a requirement.

## Representative-slide self-review

After the initial plan, choose at most three representative body pages from the actual content. Prefer pages that cover the hardest relationship, dense evidence, and different speaking tasks; do not force all three categories. Generate the actual HTML first and inspect screenshots before expanding the full deck.

This is an internal authoring step and does not add a user approval gate. In the existing scratchpad, note the page, observation, and whether it was adjusted. Check the first-glance focus, whether graphics communicate a relationship, and readability at normal size. Code inspection alone is not self-review. For interactive pages, the default state must convey the key content; progressive reveals need a reachable visible final state. Inspect meaningful reachable states for consistent text, relationships, units and sources, and for shell collisions. Interaction must not hide essential evidence or compensate for unreadable labels. Allow at most two feedback revisions for representative pages; if a clear problem remains, record it instead of claiming success.

## Final self-review

Inspect a real render of every page, then use a full-deck overview to judge narrative rhythm. Adjacent pages may repeat when their meaning is similar. Judge whether repetition is semantically justified, not whether the deck contains enough layout types. Geometry passing never replaces visual judgment; review the final HTML under Gate R4 and html-delivery.md; when PPTX is requested, export review remains part of Gate R4.
