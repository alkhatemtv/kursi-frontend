# Kursi.io Layout Schema — v2.0.0

> The contract between the seat-map editor, the public booking page, the AI layout generator, and the FastAPI backend.

**Schema version:** `2.0.0`
**Status:** Draft for Phase 2
**Replaces:** the implicit Phase 1 shape stored under `localStorage["kursi-events"]`

---

## 1. Goals

1. **One shape, all venues.** The same JSON document represents a 60-seat black-box theater and an 80,000-seat stadium. No structural fork between "small" and "large" layouts.
2. **Editor-agnostic.** The schema describes *what* a venue is, not *how* it is drawn. The Phase 2 canvas editor, the AI generator, and the booking page all consume the same document.
3. **Backend-friendly.** The document is a flat tree of UUID-keyed records, trivially serializable to PostgreSQL rows when the FastAPI backend takes over from `localStorage`.
4. **Forward-compatible.** Every document carries `schema_version`. Future migrations bump that field; consumers refuse to load documents with a version they do not understand.

## 2. Top-level document

A layout document has exactly these top-level fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | string (semver) | yes | Always `"2.0.0"` for Phase 2 launch. |
| `venue` | object | yes | Venue metadata. See §3. |
| `sections` | array of objects | yes | One or more sections. See §4. Empty array is invalid. |
| `seats` | array of objects | yes | All seats in the venue. May be empty for venues that do not sell seats (e.g. general-admission stadium pitch). See §5. |
| `categories` | array of objects | yes | Pricing/colour categories referenced by seats. See §6. |
| `objects` | array of objects | yes | Non-seat objects (stage, screen, walkways, labels). May be empty. See §7. |
| `layers` | array of objects | yes | Logical groupings for editor visibility/lock state. See §8. |

`editor_state` (§9) is **not** part of this document. It is persisted separately so that pan/zoom/grid preferences from one user do not leak into a saved venue shared with collaborators.

```json
{
  "schema_version": "2.0.0",
  "venue":      { ... },
  "sections":   [ ... ],
  "seats":      [ ... ],
  "categories": [ ... ],
  "objects":    [ ... ],
  "layers":     [ ... ]
}
```

## 3. Venue metadata

```json
{
  "id":          "uuid",
  "name":        "string",
  "type":        "theater | cinema | stadium | opera | circle | conference | talk_show",
  "dimensions":  { "width_m": number, "depth_m": number },
  "owner_id":    "uuid",
  "created_at":  "ISO-8601 timestamp",
  "updated_at":  "ISO-8601 timestamp"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | Stable venue identifier. Never mutated after creation. |
| `name` | string | yes | Human-readable label, 1–120 chars. |
| `type` | enum | yes | One of `theater`, `cinema`, `stadium`, `opera`, `circle`, `conference`, `talk_show`. Drives default templates and category palettes; it is *not* a structural constraint. |
| `dimensions.width_m` | number | yes | Real-world floor width in metres. |
| `dimensions.depth_m` | number | yes | Real-world floor depth in metres. |
| `owner_id` | UUID v4 | yes | Auth0 user ID of the organizer who owns the venue. |
| `created_at` | ISO-8601 | yes | UTC timestamp, e.g. `2026-05-08T12:30:00Z`. |
| `updated_at` | ISO-8601 | yes | UTC timestamp; updated on every save. |

`dimensions` is in **metres** so that real-world planning (capacity per square metre, accessibility codes) is meaningful. Canvas units (used by seats and objects) are independent of metres — see §10.

## 4. Sections

Every venue has at least one section. Small venues use a single section called `main_floor`; large venues split into balcony, mezzanine, box tiers, terraces, etc.

```json
{
  "id":     "uuid",
  "name":   "string",
  "label":  "string",
  "origin": { "x": number, "y": number },
  "bounds": { "width": number, "height": number },
  "rotation_deg": number
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | Referenced by `seats[*].section_id`. |
| `name` | string | yes | Machine slug, e.g. `main_floor`, `balcony_left`. |
| `label` | string | yes | Display label shown to organizers and customers, e.g. `"Main Floor"`. |
| `origin.x`, `origin.y` | number | yes | Top-left corner of the section in canvas units (see §10). |
| `bounds.width`, `bounds.height` | number | yes | Section dimensions in canvas units. Used by the editor for hit-testing and AI generation; not enforced against seat positions. |
| `rotation_deg` | number | yes | Section rotation in degrees, 0 by default. Applied around `origin`. |

## 5. Seats

```json
{
  "id":           "uuid",
  "section_id":   "uuid",
  "x":            number,
  "y":            number,
  "row":          "string",
  "number":       "string",
  "category_id":  "uuid",
  "price_override": number | null,
  "accessibility": {
    "wheelchair": boolean,
    "companion":  boolean
  },
  "seat_type":   "standard | recliner | box | premium",
  "status":      "available | reserved | blocked | sold",
  "notes":       "string"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | Stable seat identifier. Bookings reference this. |
| `section_id` | UUID v4 | yes | Must match a `sections[*].id`. |
| `x`, `y` | number | yes | Position in canvas units, expressed in the **venue** coordinate space (not section-local). The editor may convert to/from section-local for editing. |
| `row` | string | yes | Row label, e.g. `"A"`, `"AA"`, `"12"`. Free-form so non-Latin venues (Arabic letters, Greek tiers) work. May be empty. |
| `number` | string | yes | Seat number within the row, e.g. `"7"`, `"7B"`. String, not int, so `"7B"` and `"007"` round-trip cleanly. |
| `category_id` | UUID v4 | yes | References `categories[*].id`. |
| `price_override` | number \| null | yes | If non-null, overrides the category default price. Stored as a number, not a string. Currency is venue-wide (KWD); not stored per-seat. |
| `accessibility.wheelchair` | boolean | yes | True if the seat itself is a wheelchair space. |
| `accessibility.companion` | boolean | yes | True if the seat is reserved as a companion seat next to a wheelchair space. |
| `seat_type` | enum | yes | One of `standard`, `recliner`, `box`, `premium`. Drives icon rendering and is purely visual; pricing comes from `category_id`/`price_override`. |
| `status` | enum | yes | `available`, `reserved` (held by a pending booking), `blocked` (organizer-disabled), `sold` (paid booking). The booking page treats anything other than `available` as unclickable. |
| `notes` | string | yes | Free-form organizer notes. May be empty. Not shown to customers. |

### Scaling note
80,000 seats × ~250 bytes/seat ≈ 20 MB JSON. That is fine for the backend (Postgres), but too large for a single `localStorage` blob and slow over the wire. Production deployments must:
- Send seats paginated by `section_id` from the API.
- Stream into the canvas editor section-by-section.
- Never load all seats into memory in the customer-facing booking page when the user is browsing a single section.

The schema does not change; the *delivery* changes.

## 6. Categories

```json
{
  "id":           "uuid",
  "name":         "string",
  "color":        "#RRGGBB",
  "default_price": number
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | Referenced by `seats[*].category_id`. |
| `name` | string | yes | Human-readable label, e.g. `"VIP"`, `"Gold"`. Bilingual labels are out of scope for v2.0; the backend translates names by lookup. |
| `color` | string | yes | Hex colour `#RRGGBB`. The booking-page legend and editor swatches share this value. |
| `default_price` | number | yes | KWD, integer or one decimal. Applied unless a seat has a `price_override`. |

## 7. Non-seat objects

Objects are everything that lives on the canvas but is not a seat: the stage, the screen, the pitch in a stadium, walkways, DJ booths, label markers.

```json
{
  "id":         "uuid",
  "type":       "stage | screen | pitch | dj_booth | walkway | label",
  "section_id": "uuid | null",
  "x":          number,
  "y":          number,
  "width":      number,
  "height":     number,
  "rotation_deg": number,
  "label":      "string",
  "z_index":    integer,
  "layer_id":   "uuid"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | |
| `type` | enum | yes | `stage`, `screen`, `pitch`, `dj_booth`, `walkway`, `label`. New types require a schema bump. |
| `section_id` | UUID v4 \| null | yes | Optional anchor. `null` = belongs to the venue, not a section. |
| `x`, `y` | number | yes | Top-left in canvas units. |
| `width`, `height` | number | yes | Bounding box in canvas units. A `label` object uses these for its hit-area. |
| `rotation_deg` | number | yes | Default 0. |
| `label` | string | yes | Display text. For `type: "label"` this is the visible string; for `stage` it is e.g. `"STAGE"`. May be empty. |
| `z_index` | integer | yes | Local z-order **within the same layer**. Cross-layer order comes from `layers[*].z_order` (§8). |
| `layer_id` | UUID v4 | yes | References `layers[*].id`. |

## 8. Layers

Layers are logical groupings the editor uses for visibility and locking. They map onto Illustrator-style layer panels.

```json
{
  "id":      "uuid",
  "name":    "string",
  "visible": boolean,
  "locked":  boolean,
  "z_order": integer
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 | yes | Referenced by `objects[*].layer_id`. |
| `name` | string | yes | Conventional names: `stage`, `seating`, `aisles`, `labels`. Custom names are allowed. |
| `visible` | boolean | yes | If false, hidden in the editor. The booking page **ignores** this — customers always see everything sellable. |
| `locked` | boolean | yes | If true, the editor blocks selection and dragging. |
| `z_order` | integer | yes | Higher = drawn on top. Layers with the same `z_order` use insertion order. |

Seats live in the `seating` layer implicitly — they do not carry a `layer_id`. This keeps the seat record small (recall the 80k-seat scaling note in §5).

## 9. Editor state (separate document)

`editor_state` is **not** stored inside the layout document. It belongs to a single editor session/user and is persisted under a different key.

```json
{
  "layout_id":    "uuid",
  "user_id":      "uuid",
  "zoom":         number,
  "pan_offset":   { "x": number, "y": number },
  "grid": {
    "enabled":      boolean,
    "size":         number,
    "snap":         boolean
  },
  "last_used_tool": "select | seat | erase | block | price | row | rect | curve | label | pan"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `layout_id` | UUID v4 | yes | The layout this state belongs to. |
| `user_id` | UUID v4 | yes | Owner of this state record. |
| `zoom` | number | yes | Editor zoom factor. `1.0` = 100%. Range `0.1` – `8.0`. |
| `pan_offset.x`, `.y` | number | yes | Canvas pan in pixels. |
| `grid.enabled` | boolean | yes | Whether the grid is drawn. |
| `grid.size` | number | yes | Grid spacing in canvas units. Phase 1 used 8. |
| `grid.snap` | boolean | yes | Whether new objects snap to grid. |
| `last_used_tool` | enum | yes | The tool that was active when the editor was last closed. |

Storage location:
- Browser-only (Phase 2 launch): `localStorage["kursi-editor-state:<layout_id>"]`.
- Once the backend supports it: `PATCH /editor-state/{layout_id}` per user.

## 10. Coordinates and units

- **`venue.dimensions`** is in **metres** (real-world).
- **`sections[*]`, `seats[*]`, `objects[*]`** positions are in **canvas units**. One canvas unit ≈ one pixel at 100% zoom. The mapping from metres to canvas units is *not* fixed by this schema — different venue types use different scales (a stadium fits at ~5 px/m, a theater at ~80 px/m). The editor stores the chosen scale as part of `editor_state` if needed for measuring tools.
- Coordinates are **venue-global**, not section-local. Sections describe a region; seats inside a section still use venue-global `x`/`y`. This is what lets a single hit-test pass at the booking page handle an entire 80k-seat layout without re-projecting through section transforms.
- `rotation_deg` is degrees, clockwise positive, around the object's `origin` (sections) or top-left corner (objects).

## 11. Versioning

- Every document carries `schema_version`.
- Phase 2 launches at `"2.0.0"`.
- Bump the **major** when a structural field is renamed, removed, or its meaning changes (consumers must migrate).
- Bump the **minor** when a new optional field is added (old consumers ignore it).
- Bump the **patch** for documentation-only clarifications.

Consumers must:
1. Read `schema_version` first.
2. Refuse to load a document whose major version they do not implement.
3. For minor mismatches, log a warning but proceed.

## 12. Migration from Phase 1

Phase 1 stored events under `localStorage["kursi-events"]` as an array. Each event had this implicit shape:

```js
{
  id, name, tag, template,
  seats: [{ id, x, y, catId, row, col, blocked, label, customPrice }],
  categories: [{ id, name, color, price }]
}
```

Bookings and blocked seats were keyed separately:
- `localStorage["kursi-booked"]`        → `{ eventId: [seatId, ...] }`
- `localStorage["kursi-blocked-seats"]` → `{ eventId: [seatId, ...] }`

### Migration mapping

| Phase 1 field | v2 field | Notes |
|---|---|---|
| `event.id` | `venue.id` | Re-stamped as a UUID v4 if not already one. |
| `event.name` | `venue.name` | Verbatim. |
| `event.tag` | `venue.type` | Mapped: `Theater→theater`, `Cinema→cinema`, `Talk Show→talk_show`, `Stadium→stadium`, `Opera→opera`, `Hall→conference`, `Custom→theater`. |
| `event.template` | dropped | Templates were a UI hint, not data. |
| (none) | `venue.dimensions` | Defaulted to `{ width_m: 30, depth_m: 20 }`; organizer is prompted on first edit. |
| (none) | `venue.owner_id` | Filled from current Auth0 `sub` claim, or a generated UUID for anonymous Phase 1 data. |
| (none) | `venue.created_at`, `updated_at` | Set to migration timestamp. |
| (none) | `sections[0]` | A single section `main_floor` is created spanning the bounding box of all seats. |
| `event.seats[*].id` | `seats[*].id` | Re-stamped as UUID v4 if it was a `s###` counter. A side table maps old IDs → new IDs so existing bookings still resolve. |
| `event.seats[*].x`, `y` | `seats[*].x`, `y` | Verbatim (canvas units). |
| `event.seats[*].catId` | `seats[*].category_id` | Re-stamped as UUID v4 via the categories map. |
| `event.seats[*].row`, `col` | `seats[*].row`, `seats[*].number` | Stringified. `col=0` becomes `"1"` (1-indexed for humans). |
| `event.seats[*].label` | `seats[*].notes` | Repurposed; the label was free-form Phase 1. |
| `event.seats[*].blocked` | `seats[*].status` | `true` → `"blocked"`, otherwise `"available"`. Then `kursi-booked` is consulted: if the seat ID appears there, status becomes `"sold"`. |
| `event.seats[*].customPrice` | `seats[*].price_override` | `null` stays `null`; numbers pass through. |
| (none) | `seats[*].accessibility` | Both flags default to `false`. |
| (none) | `seats[*].seat_type` | Defaults to `"standard"`. |
| `event.categories[*].id` | `categories[*].id` | Re-stamped as UUID v4 (Phase 1 used short slugs like `vip`, `gold`). A side table maps old → new for the seat re-stamping. |
| `event.categories[*].name` | `categories[*].name` | Verbatim. |
| `event.categories[*].color` | `categories[*].color` | Verbatim. |
| `event.categories[*].price` | `categories[*].default_price` | Verbatim. |
| (none) | `objects` | Empty array. The Phase 1 stage element was a CSS-positioned div, not a data record; the migrator detects it and emits a single `type: "stage"` object centred on the canvas. |
| (none) | `layers` | Default 4 layers created: `stage` (z=0), `seating` (z=10), `aisles` (z=20), `labels` (z=30). All visible, all unlocked. |

### Migration runner

A one-shot script `migrateLayoutV1ToV2(eventV1) → layoutV2` will live alongside the editor. It:
1. Reads each entry in `kursi-events`.
2. Produces a v2 document.
3. Writes it to `localStorage["kursi-layouts:<new-uuid>"]`.
4. Leaves `kursi-events` untouched until the user confirms the migration succeeded (a toast with an "Undo" affordance).

The migration is **idempotent**: running it twice is a no-op once a v2 document already exists for a given v1 event.

---

## Appendix A — Complete example: small theater (60 seats, 2 rows of 30)

```json
{
  "schema_version": "2.0.0",
  "venue": {
    "id": "1f4e2c8a-7b16-4c2a-9e5d-1f0a3b8c4d20",
    "name": "Black Box Theater",
    "type": "theater",
    "dimensions": { "width_m": 12.0, "depth_m": 10.0 },
    "owner_id": "9c7d6f3e-2a14-4b5c-8d9e-0f1a2b3c4d5e",
    "created_at": "2026-05-08T12:00:00Z",
    "updated_at": "2026-05-08T12:00:00Z"
  },
  "sections": [
    {
      "id": "a0000000-0000-4000-8000-000000000001",
      "name": "main_floor",
      "label": "Main Floor",
      "origin": { "x": 0, "y": 0 },
      "bounds": { "width": 960, "height": 600 },
      "rotation_deg": 0
    }
  ],
  "categories": [
    {
      "id": "c0000000-0000-4000-8000-000000000001",
      "name": "Front Row",
      "color": "#f59e0b",
      "default_price": 25.0
    },
    {
      "id": "c0000000-0000-4000-8000-000000000002",
      "name": "Back Row",
      "color": "#94a3b8",
      "default_price": 15.0
    }
  ],
  "objects": [
    {
      "id": "o0000000-0000-4000-8000-000000000001",
      "type": "stage",
      "section_id": "a0000000-0000-4000-8000-000000000001",
      "x": 180,
      "y": 30,
      "width": 600,
      "height": 60,
      "rotation_deg": 0,
      "label": "STAGE",
      "z_index": 0,
      "layer_id": "L0000000-0000-4000-8000-000000000001"
    }
  ],
  "layers": [
    { "id": "L0000000-0000-4000-8000-000000000001", "name": "stage",   "visible": true, "locked": false, "z_order":  0 },
    { "id": "L0000000-0000-4000-8000-000000000002", "name": "seating", "visible": true, "locked": false, "z_order": 10 },
    { "id": "L0000000-0000-4000-8000-000000000003", "name": "aisles",  "visible": true, "locked": false, "z_order": 20 },
    { "id": "L0000000-0000-4000-8000-000000000004", "name": "labels",  "visible": true, "locked": false, "z_order": 30 }
  ],
  "seats": [
    {
      "id": "s0000000-0000-4000-8000-000000000001",
      "section_id": "a0000000-0000-4000-8000-000000000001",
      "x": 60, "y": 200,
      "row": "A", "number": "1",
      "category_id": "c0000000-0000-4000-8000-000000000001",
      "price_override": null,
      "accessibility": { "wheelchair": false, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": ""
    },
    {
      "id": "s0000000-0000-4000-8000-000000000002",
      "section_id": "a0000000-0000-4000-8000-000000000001",
      "x": 90, "y": 200,
      "row": "A", "number": "2",
      "category_id": "c0000000-0000-4000-8000-000000000001",
      "price_override": null,
      "accessibility": { "wheelchair": false, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": ""
    },
    "// ... seats A.3 through A.30 follow the same pattern, x increases by 30 each step ...",
    {
      "id": "s0000000-0000-4000-8000-000000000031",
      "section_id": "a0000000-0000-4000-8000-000000000001",
      "x": 60, "y": 260,
      "row": "B", "number": "1",
      "category_id": "c0000000-0000-4000-8000-000000000002",
      "price_override": null,
      "accessibility": { "wheelchair": true, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": "Wheelchair-accessible space"
    },
    "// ... seats B.2 through B.30 follow with the back-row category ..."
  ]
}
```

> Note: the `"// ..."` strings above are shorthand for this document. A real layout file is pure JSON with no comments — the runtime generator emits all 60 seat records explicitly. Row A is generated by the loop `for n in 1..30: x = 60 + (n-1)*30, y = 200`; row B by the same loop with `y = 260`.

## Appendix B — Complete example: stadium section (curved row of 200 seats)

This is one section of a larger stadium. The schema is identical; only the seat count and the curved geometry differ. Seats lie on an arc of radius 800 canvas units, sweeping 90° from `-45°` to `+45°` around the pitch centre `(2000, 1500)`.

```json
{
  "schema_version": "2.0.0",
  "venue": {
    "id": "2f5e3d9b-8c27-4d3b-af6e-2f1b4c9d5e30",
    "name": "Kuwait National Stadium",
    "type": "stadium",
    "dimensions": { "width_m": 220.0, "depth_m": 180.0 },
    "owner_id": "9c7d6f3e-2a14-4b5c-8d9e-0f1a2b3c4d5e",
    "created_at": "2026-05-08T12:00:00Z",
    "updated_at": "2026-05-08T12:00:00Z"
  },
  "sections": [
    {
      "id": "b0000000-0000-4000-8000-000000000001",
      "name": "north_terrace_row_22",
      "label": "North Terrace — Row 22",
      "origin": { "x": 1200, "y": 700 },
      "bounds": { "width": 1600, "height": 800 },
      "rotation_deg": 0
    }
  ],
  "categories": [
    {
      "id": "c1000000-0000-4000-8000-000000000001",
      "name": "Terrace",
      "color": "#7dd3fc",
      "default_price": 8.0
    }
  ],
  "objects": [
    {
      "id": "o1000000-0000-4000-8000-000000000001",
      "type": "pitch",
      "section_id": null,
      "x": 1500,
      "y": 1200,
      "width": 1000,
      "height": 600,
      "rotation_deg": 0,
      "label": "Pitch",
      "z_index": 0,
      "layer_id": "L1000000-0000-4000-8000-000000000001"
    }
  ],
  "layers": [
    { "id": "L1000000-0000-4000-8000-000000000001", "name": "stage",   "visible": true, "locked": false, "z_order":  0 },
    { "id": "L1000000-0000-4000-8000-000000000002", "name": "seating", "visible": true, "locked": false, "z_order": 10 },
    { "id": "L1000000-0000-4000-8000-000000000003", "name": "aisles",  "visible": true, "locked": false, "z_order": 20 },
    { "id": "L1000000-0000-4000-8000-000000000004", "name": "labels",  "visible": true, "locked": false, "z_order": 30 }
  ],
  "seats": [
    {
      "id": "s1000000-0000-4000-8000-000000000001",
      "section_id": "b0000000-0000-4000-8000-000000000001",
      "x": 1434.31,
      "y": 934.31,
      "row": "22",
      "number": "1",
      "category_id": "c1000000-0000-4000-8000-000000000001",
      "price_override": null,
      "accessibility": { "wheelchair": false, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": ""
    },
    {
      "id": "s1000000-0000-4000-8000-000000000002",
      "section_id": "b0000000-0000-4000-8000-000000000001",
      "x": 1437.86,
      "y": 931.46,
      "row": "22",
      "number": "2",
      "category_id": "c1000000-0000-4000-8000-000000000001",
      "price_override": null,
      "accessibility": { "wheelchair": false, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": ""
    },
    "// ... 196 more seats follow the same arc ...",
    {
      "id": "s1000000-0000-4000-8000-0000000000c8",
      "section_id": "b0000000-0000-4000-8000-000000000001",
      "x": 2565.69,
      "y": 934.31,
      "row": "22",
      "number": "200",
      "category_id": "c1000000-0000-4000-8000-000000000001",
      "price_override": null,
      "accessibility": { "wheelchair": false, "companion": false },
      "seat_type": "standard",
      "status": "available",
      "notes": ""
    }
  ]
}
```

The seat positions in row 22 are generated by the parametric formula:

```
cx = 2000, cy = 1500, r = 800
for n in 1..200:
  theta = -45° + (n - 1) * (90° / 199)
  x = cx + r * sin(theta)
  y = cy - r * cos(theta)
```

Adding row 23 (200 more seats) means another loop with `r = 830`. Adding the entire stadium (80,000 seats across 80 rows × 4 stands × 250 seats) is the same loop multiplied — **the schema does not change**. Only the count of records grows.
