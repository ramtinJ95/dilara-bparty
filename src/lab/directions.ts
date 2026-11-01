export const DIRECTIONS = [
  { id: "aurora", name: "Aurora glass", idea: "A pale icy-sky aurora drifting over white snow, with frosted glass cards." },
  { id: "pearl", name: "Holographic pearl", idea: "Light pearl surfaces with iridescent foil and chrome headline type." },
  { id: "chrome", name: "Y2K chrome bubble", idea: "Inflated silver lettering and glossy bubble buttons, straight out of 2001." },
  { id: "clay", name: "Soft 3D ice clay", idea: "Chunky, squishy claymorphism in pastel ice colours." },
  { id: "brutal", name: "Playful neo-brutalist", idea: "Thick outlines, flat bold blocks and offset shadows in an icy palette." },
  { id: "luxe", name: "Editorial luxe", idea: "A big display serif in silver and white, lots of space, refined motion." },
  { id: "gameshow", name: "Ice game show", idea: "A bright game-show stage on light ice: big bold answer tiles, glow and energy." },
  { id: "crystal", name: "Crystal facets", idea: "Geometric diamond facets, sparkle particles and prismatic light." },
  { id: "storybook", name: "Modern storybook", idea: "Illustrated, rounded and soft, with small magical details." },
  { id: "bento", name: "Maximal bento", idea: "A high-energy bento grid of tiles, stickers and badges." },
] as const;

export type DirectionMeta = (typeof DIRECTIONS)[number];
export type DirectionId = DirectionMeta["id"];

export const directionById = (id: string): DirectionMeta | undefined => DIRECTIONS.find((d) => d.id === id);
