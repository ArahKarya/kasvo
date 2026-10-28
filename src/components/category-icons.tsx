import {
  Briefcase, Car, Coffee, Film, Gift, GraduationCap, HandHeart, HeartPulse, Home, Landmark, Plane, Receipt, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sparkles, Store, Tag, TrendingUp, Users, Utensils, Wallet, Zap, type LucideIcon,
} from "lucide-react";

/** The icons a category can use; the key is what is stored in Category.icon. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, "shopping-cart": ShoppingCart, "shopping-bag": ShoppingBag, shirt: Shirt,
  car: Car, plane: Plane, zap: Zap, smartphone: Smartphone, home: Home, "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap, film: Film, sparkles: Sparkles, "hand-heart": HandHeart, users: Users,
  landmark: Landmark, receipt: Receipt, briefcase: Briefcase, gift: Gift, store: Store, "trending-up": TrendingUp,
  wallet: Wallet, tag: Tag,
};

/** Tile hues; the icon and name always carry the meaning, the colour only helps scanning. */
export const CATEGORY_COLORS: Record<string, string> = {
  green: "#1f8a5b", teal: "#0f8a8a", blue: "#2f6fd1", purple: "#7c4fd6", pink: "#c44d8a",
  red: "#c94a3c", orange: "#d9711f", amber: "#c99512", slate: "#64748b",
};

interface CategoryIconProps {
  icon?: string | null;
  color?: string | null;
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/** A soft-tinted square tile with the category's icon. */
export function CategoryIcon({ icon, color, size = 36, className = "" }: CategoryIconProps) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Tag;
  const hue = (color && CATEGORY_COLORS[color]) || CATEGORY_COLORS.slate;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${className}`}
      style={{ width: size, height: size, color: hue, background: `color-mix(in srgb, ${hue} 14%, transparent)` }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
