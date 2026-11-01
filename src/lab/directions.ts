export const DIRECTIONS = [
  { id: "brutal", name: "Neo-brutalist · original", idea: "Thick outlines, flat bold blocks and offset shadows in an icy palette." },
  { id: "brutal-ice", name: "Neo-brutalist · Ice block", idea: "Chunky frozen-block cards with snow caps, and icicles dripping off the thick outlines." },
  { id: "brutal-stickers", name: "Neo-brutalist · Princess stickers", idea: "Thick-outlined crown, castle, wand and snowflake stickers, tiara badges and silver offset shadows." },
  { id: "storybook", name: "Storybook · original", idea: "Illustrated, rounded and soft, with small magical details." },
  { id: "storybook-globe", name: "Storybook · Snow globe", idea: "Fairy-tale book pages with a castle backdrop, and the photo inside a snow globe." },
  { id: "storybook-papercut", name: "Storybook · Paper-cut", idea: "A layered paper-cut winter forest and castle with depth, and paper snowflakes." },
  { id: "luxe", name: "Editorial luxe · original", idea: "A big display serif in silver and white, lots of space, refined motion." },
  { id: "luxe-couture", name: "Editorial luxe · Ice palace couture", idea: "Silver foil, chandelier sparkle, a script name and a tiara monogram." },
  { id: "luxe-ballet", name: "Editorial luxe · Winter ballet", idea: "Pale ice, satin ribbons, pearls and graceful motion." },
] as const;

export type DirectionMeta = (typeof DIRECTIONS)[number];
export type DirectionId = DirectionMeta["id"];

export const directionById = (id: string): DirectionMeta | undefined => DIRECTIONS.find((d) => d.id === id);
