import type { WowClass } from "../src/lib/model";
import warrior from "./class-emojis/warrior.png";
import paladin from "./class-emojis/paladin.png";
import hunter from "./class-emojis/hunter.png";
import rogue from "./class-emojis/rogue.png";
import priest from "./class-emojis/priest.png";
import shaman from "./class-emojis/shaman.png";
import mage from "./class-emojis/mage.png";
import warlock from "./class-emojis/warlock.png";
import druid from "./class-emojis/druid.png";

export const classImages: Record<WowClass, ArrayBuffer> = {
  warrior,
  paladin,
  hunter,
  rogue,
  priest,
  shaman,
  mage,
  warlock,
  druid,
};
