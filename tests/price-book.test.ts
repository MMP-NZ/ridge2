import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import {
  DEFAULT_PRICE_BOOK,
  listPriceBook,
  seedPriceBook,
  createPriceBookItem,
  updatePriceBookItem,
  deactivatePriceBookItem,
} from "@/lib/price-book/items";
import { parsePriceToCents, parseQuantityToThousandths, formatQuantity } from "@/lib/quotes/parse";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

describe("the standard price book", () => {
  test("covers every service the build plan names, including the winter ones", () => {
    const names = DEFAULT_PRICE_BOOK.map((i) => i.name.toLowerCase());

    // build-plan M4: "...plus leak repairs and roof prep (needed for winter campaigns)"
    for (const service of ["painting", "prep", "re-roofing", "repairs", "leak repairs", "spouting", "moss"]) {
      expect(names.some((n) => n.includes(service))).toBe(true);
    }
  });

  test("prices every item in whole cents, ex GST", () => {
    for (const item of DEFAULT_PRICE_BOOK) {
      expect(Number.isInteger(item.unitPriceCents)).toBe(true);
      expect(item.unitPriceCents).toBeGreaterThan(0);
    }
  });

  test("seedPriceBook fills an empty book and never overwrites the roofer's own pricing", async () => {
    const tenant = await makeTenant(ownerDb, "Seed Co");

    const seeded = await withRooferTenantContext(tenant.id, (tx) => seedPriceBook(tx, tenant.id));
    expect(seeded).toHaveLength(DEFAULT_PRICE_BOOK.length);

    // He re-prices roof painting to his own rate...
    const painting = seeded.find((i) => i.name === "Roof painting")!;
    await withRooferTenantContext(tenant.id, (tx) =>
      updatePriceBookItem(tx, tenant.id, painting.id, { unitPriceCents: 6_000 }),
    );

    // ...and a second seed (a re-run, or onboarding clicked twice) leaves it alone.
    await withRooferTenantContext(tenant.id, (tx) => seedPriceBook(tx, tenant.id));

    const after = await withRooferTenantContext(tenant.id, (tx) => listPriceBook(tx, tenant.id));
    expect(after).toHaveLength(DEFAULT_PRICE_BOOK.length);
    expect(after.find((i) => i.name === "Roof painting")!.unitPriceCents).toBe(6_000);
  });
});

describe("editing the price book", () => {
  test("retiring an item hides it from the list but keeps it for later", async () => {
    const tenant = await makeTenant(ownerDb, "Retire Co");
    const item = await withRooferTenantContext(tenant.id, (tx) =>
      createPriceBookItem(tx, tenant.id, { name: "Ridge capping", kind: "per_metre", unitPriceCents: 5_500 }),
    );

    await withRooferTenantContext(tenant.id, (tx) => deactivatePriceBookItem(tx, tenant.id, item.id));

    expect(await withRooferTenantContext(tenant.id, (tx) => listPriceBook(tx, tenant.id))).toHaveLength(0);
    expect(await withRooferTenantContext(tenant.id, (tx) => listPriceBook(tx, tenant.id, true))).toHaveLength(1);
  });

  test("a roofer can't edit another roofer's rates, even with the right item id", async () => {
    const mine = await makeTenant(ownerDb, "Price Mine");
    const theirs = await makeTenant(ownerDb, "Price Theirs");
    const theirItem = await withRooferTenantContext(theirs.id, (tx) =>
      createPriceBookItem(tx, theirs.id, { name: "Roof painting", kind: "per_m2", unitPriceCents: 4_850 }),
    );

    const result = await withRooferTenantContext(mine.id, (tx) =>
      updatePriceBookItem(tx, mine.id, theirItem.id, { unitPriceCents: 1 }),
    );

    expect(result).toBeNull();
    const [unchanged] = await ownerDb.select().from(schema.priceBookItems);
    expect(unchanged.unitPriceCents).toBe(4_850);
  });

  test("two roofers can each have an item of the same name", async () => {
    const a = await makeTenant(ownerDb, "Same Name A");
    const b = await makeTenant(ownerDb, "Same Name B");

    await withRooferTenantContext(a.id, (tx) =>
      createPriceBookItem(tx, a.id, { name: "Roof painting", kind: "per_m2", unitPriceCents: 4_850 }),
    );
    await withRooferTenantContext(b.id, (tx) =>
      createPriceBookItem(tx, b.id, { name: "Roof painting", kind: "per_m2", unitPriceCents: 5_200 }),
    );

    expect(await ownerDb.select().from(schema.priceBookItems)).toHaveLength(2);
  });
});

describe("parsing what the roofer types", () => {
  test.each([
    ["48.50", 4_850],
    ["48.5", 4_850],
    ["48", 4_800],
    ["$48.50", 4_850],
    ["1,250.00", 125_000],
    [" 48.50 ", 4_850],
    ["0.01", 1],
    // The classic float trap: 1.15 * 100 is 114.99999999999999 in binary
    // floating point. Parsing the halves as integers avoids it entirely.
    ["1.15", 115],
  ])("parsePriceToCents(%j) is %i cents", (raw, expected) => {
    expect(parsePriceToCents(raw)).toBe(expected);
  });

  test.each(["", "abc", "-5", "48.505", "4 8", "48.50.1", "1e3"])(
    "parsePriceToCents(%j) refuses rather than guessing",
    (raw) => {
      expect(parsePriceToCents(raw)).toBeNull();
    },
  );

  test.each([
    ["12.5", 12_500],
    ["12", 12_000],
    ["0.125", 125],
    ["148.75", 148_750],
  ])("parseQuantityToThousandths(%j) is %i", (raw, expected) => {
    expect(parseQuantityToThousandths(raw)).toBe(expected);
  });

  test("a quantity survives a round trip back into the form", () => {
    for (const raw of ["12.5", "12", "0.125", "148.75", "999"]) {
      expect(formatQuantity(parseQuantityToThousandths(raw)!)).toBe(raw.replace(/^(\d+)$/, "$1"));
    }
  });
});
