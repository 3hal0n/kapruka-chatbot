// Saved gift profiles powering the "Occasion Vibe Calendar & Gift Countdown".
// These are richer than the backend allergen profiles (recipient_profiles.json)
// because the calendar needs a display name, occasion, target date, vibe summary
// and a budget hint that maps onto the sidebar Budget filter options.

export interface GiftProfile {
  id: string;
  /** Display name shown on the card, e.g. "Amma", "Nishantha". */
  name: string;
  /** Occasion label — MUST match a LeftSidebar Occasion <option> value. */
  occasion: "Birthday" | "Anniversary" | "Christmas" | "Mother's Day" | "Father's Day";
  /** Target month (1-12) and day-of-month for the recurring occasion. */
  month: number;
  day: number;
  /** Short vibe profile summary string. */
  vibeSummary: string;
  /** Known allergen / thing to avoid — surfaced in Ruki's proactive greeting. */
  allergen: string;
  /** Budget hint — MUST match a LeftSidebar Budget <option> value. */
  budget: "Under Rs. 2,500" | "Rs. 2,500 - 5,000" | "Rs. 5,000 - 10,000" | "Above Rs. 10,000";
}

export const GIFT_PROFILES: GiftProfile[] = [
  {
    id: "amma",
    name: "Amma",
    occasion: "Birthday",
    month: 7,
    day: 14,
    vibeSummary: "Loves serene mornings, herbal tea & handcrafted Ceylon treasures.",
    allergen: "cashews",
    budget: "Rs. 2,500 - 5,000",
  },
  {
    id: "nishantha",
    name: "Nishantha",
    occasion: "Anniversary",
    month: 9,
    day: 2,
    vibeSummary: "Classic gentleman — leather, cricket lore & a fine cup of coffee.",
    allergen: "shellfish",
    budget: "Rs. 5,000 - 10,000",
  },
  {
    id: "duwa",
    name: "Duwa",
    occasion: "Birthday",
    month: 8,
    day: 21,
    vibeSummary: "Gen-Z creative — pastel aesthetics, K-pop & cosy stationery.",
    allergen: "almonds",
    budget: "Under Rs. 2,500",
  },
  {
    id: "thaththa",
    name: "Thaththa",
    occasion: "Father's Day",
    month: 6,
    day: 15,
    vibeSummary: "Practical at heart — gadgets, gardening & timeless watches.",
    allergen: "peanuts",
    budget: "Rs. 5,000 - 10,000",
  },
  {
    id: "ayya",
    name: "Ayya",
    occasion: "Christmas",
    month: 12,
    day: 25,
    vibeSummary: "Adventurer — trekking gear, dark chocolate & vinyl records.",
    allergen: "dairy",
    budget: "Above Rs. 10,000",
  },
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "July 14" — long month + day, for the occasion line. */
export function formatOccasionDate(month: number, day: number): string {
  return `${MONTHS_LONG[month - 1]} ${day}`;
}

/** "Jul 14" — compact form for the timeline marker. */
export function formatShortDate(month: number, day: number): string {
  return `${MONTHS_SHORT[month - 1]} ${day}`;
}

/**
 * Whole days from today until the next occurrence of (month, day).
 * If this year's date has already passed, counts to next year's.
 * Returns 0 when the occasion is today.
 */
export function daysUntil(month: number, day: number, now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), month - 1, day);
  if (target.getTime() < start.getTime()) {
    target = new Date(now.getFullYear() + 1, month - 1, day);
  }
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - start.getTime()) / MS_PER_DAY);
}
