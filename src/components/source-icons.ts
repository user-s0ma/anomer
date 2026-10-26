import { Camera, CloudSun, Megaphone, ShoppingBag, type LucideIcon } from "lucide-react";
import type { SourceDefinition } from "@/lib/sources/types";

/** データ源の種類ごとのアイコン (データ源の画面とトップで使う) */
export const SOURCE_ICONS: Record<SourceDefinition["icon"], LucideIcon> = {
  orders: ShoppingBag,
  ads: Megaphone,
  social: Camera,
  weather: CloudSun,
};
