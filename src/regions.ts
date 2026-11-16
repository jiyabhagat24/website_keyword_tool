export const REGIONS = [
  "North",
  "East",
  "West",
  "South",
  "Central",
  "North-East",
] as const;
export type Region = (typeof REGIONS)[number];

const BY_REGION: Record<Region, string[]> = {
  North: [
    "delhi ncr",
    "delhi",
    "haryana",
    "punjab",
    "himachal pradesh",
    "jammu & kashmir",
    "jammu and kashmir",
    "ladakh",
    "chandigarh",
    "uttarakhand",
    "uttar pradesh",
    "rajasthan",
    "lucknow",
    "jaipur",
  ],
  East: [
    "west bengal",
    "odisha",
    "orissa",
    "bihar",
    "jharkhand",
    "kmr",
    "andaman & nicobar islands",
    "andaman and nicobar islands",
  ],
  West: [
    "maharashtra",
    "gujarat",
    "goa",
    "dadra & nagar havelli",
    "dadra and nagar havelli",
    "daman & diu",
    "dadra & nagar havelli and daman & diu",
    "mmr",
    "pmr",
    "nagpur",
    "amr",
  ],
  South: [
    "karnataka",
    "tamil nadu",
    "kerala",
    "telangana",
    "andhra pradesh",
    "puducherry",
    "lakshadweep",
    "bengaluru",
    "cmr",
    "coimbatore",
    "hyderabad",
    "kochi",
    "ernakulam",
    "thiruvananthapuram",
  ],
  Central: ["madhya pradesh", "chhattisgarh", "indore"],
  "North-East": [
    "assam",
    "arunachal pradesh",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "tripura",
    "sikkim",
  ],
};

const LOOKUP = new Map<string, Region>(
  (Object.entries(BY_REGION) as [Region, string[]][]).flatMap(([r, names]) =>
    names.map((n) => [n, r] as [string, Region]),
  ),
);

const clean = (name: string) =>
  name.toLowerCase().replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Region of a place tab name, or null for India or an unknown name. */
export function regionOf(name: string): Region | null {
  return LOOKUP.get(clean(name)) ?? null;
}
