/**
 * 店を置ける米国の都市と、天気を取る NOAA の観測所 (GHCN-Daily の ID)。
 * どの観測所も 2026-10-20 の最高・最低気温と降水量がそろうことを確かめた (NCEI Access Data Service)
 */
export type City = { id: string; label: string; station: string; timezone: string };

export const CITIES: City[] = [
  { id: "atlanta", label: "Atlanta, GA", station: "USW00013874", timezone: "America/New_York" },
  { id: "austin", label: "Austin, TX", station: "USW00013904", timezone: "America/Chicago" },
  { id: "boston", label: "Boston, MA", station: "USW00014739", timezone: "America/New_York" },
  { id: "chicago", label: "Chicago, IL", station: "USW00094846", timezone: "America/Chicago" },
  { id: "dallas", label: "Dallas, TX", station: "USW00003927", timezone: "America/Chicago" },
  { id: "denver", label: "Denver, CO", station: "USW00003017", timezone: "America/Denver" },
  { id: "honolulu", label: "Honolulu, HI", station: "USW00022521", timezone: "Pacific/Honolulu" },
  { id: "houston", label: "Houston, TX", station: "USW00012960", timezone: "America/Chicago" },
  { id: "las-vegas", label: "Las Vegas, NV", station: "USW00023169", timezone: "America/Los_Angeles" },
  { id: "los-angeles", label: "Los Angeles, CA", station: "USW00023174", timezone: "America/Los_Angeles" },
  { id: "miami", label: "Miami, FL", station: "USW00012839", timezone: "America/New_York" },
  { id: "minneapolis", label: "Minneapolis, MN", station: "USW00014922", timezone: "America/Chicago" },
  { id: "nashville", label: "Nashville, TN", station: "USW00013897", timezone: "America/Chicago" },
  { id: "new-orleans", label: "New Orleans, LA", station: "USW00012916", timezone: "America/Chicago" },
  { id: "new-york", label: "New York, NY", station: "USW00094728", timezone: "America/New_York" },
  { id: "philadelphia", label: "Philadelphia, PA", station: "USW00013739", timezone: "America/New_York" },
  { id: "phoenix", label: "Phoenix, AZ", station: "USW00023183", timezone: "America/Phoenix" },
  { id: "portland", label: "Portland, OR", station: "USW00024229", timezone: "America/Los_Angeles" },
  { id: "salt-lake-city", label: "Salt Lake City, UT", station: "USW00024127", timezone: "America/Denver" },
  { id: "san-antonio", label: "San Antonio, TX", station: "USW00012921", timezone: "America/Chicago" },
  { id: "san-diego", label: "San Diego, CA", station: "USW00023188", timezone: "America/Los_Angeles" },
  { id: "san-francisco", label: "San Francisco, CA", station: "USW00023234", timezone: "America/Los_Angeles" },
  { id: "seattle", label: "Seattle, WA", station: "USW00024233", timezone: "America/Los_Angeles" },
  { id: "washington", label: "Washington, DC", station: "USW00013743", timezone: "America/New_York" },
];

export const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));
