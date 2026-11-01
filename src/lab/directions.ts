export const DIRECTIONS = [
  { id: "brutal", name: "Neo-brutalist · original", idea: "Thick outlines, flat bold blocks and offset shadows in an icy palette." },
  { id: "brutal-ice", name: "Neo-brutalist · Ice block", idea: "Brutalism carved from ice: frozen slabs with snow caps and icicles, an icicle countdown and an ice tiara." },
  { id: "brutal-stickers", name: "Neo-brutalist · Princess stickers", idea: "A princess sticker book: die-cut crown, castle and wand stickers that slap on with a wobble, some holographic." },
  { id: "storybook", name: "Storybook · original", idea: "Illustrated, rounded and soft, with small magical details." },
  { id: "storybook-globe", name: "Storybook · Snow globe", idea: "A fairy-tale book where the photo and the winner sit in a snow globe that shakes and settles." },
  { id: "storybook-papercut", name: "Storybook · Paper-cut", idea: "A pop-up paper winter: cut layers drift in parallax, cards have scalloped edges, the winner pops up off the page." },
  { id: "luxe", name: "Editorial luxe · original", idea: "A big display serif in silver and white, lots of space, refined motion." },
  { id: "luxe-couture", name: "Editorial luxe · Ice palace couture", idea: "A crystal-curtain invitation: silver foil script, a tiara 'D' crest and every shape cut like a gem." },
  { id: "luxe-ballet", name: "Editorial luxe · Winter ballet", idea: "A winter ballet programme: satin ribbons, pearls and pale curtains that open on the winner." },
] as const;

export type DirectionMeta = (typeof DIRECTIONS)[number];
export type DirectionId = DirectionMeta["id"];

export const directionById = (id: string): DirectionMeta | undefined => DIRECTIONS.find((d) => d.id === id);
