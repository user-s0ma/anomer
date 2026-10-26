import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** 日時はミリ秒の整数で持つ */
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  timestamp("createdAt")
    .$defaultFn(() => new Date())
    .notNull();
const updatedAt = () =>
  timestamp("updatedAt")
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull();

// ---------------------------------------------------------------- better-auth の表

export const user = sqliteTable("User", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "Session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt").notNull(),
    token: text("token").unique().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("Session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "Account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("Account_userId_idx").on(table.userId),
    uniqueIndex("Account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable("Verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- 店とデータ

/** 1アカウント＝1店 */
export const shop = sqliteTable("Shop", {
  userId: text("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** 店の場所の都市の名前 (画面に出す) */
  city: text("city").notNull(),
  /** IANA のタイムゾーン。「昨日」はこの時刻で決める */
  timezone: text("timezone").notNull(),
  /** データの最初の日 (YYYY-MM-DD) */
  dataStart: text("dataStart").notNull(),
  /** データを最後にそろえた時刻 */
  syncedAt: timestamp("syncedAt"),
  createdAt: createdAt(),
});

/** 店がつないだデータ源 (プラグイン) と、その設定 (プラグインごとの JSON) */
export const shopSource = sqliteTable(
  "ShopSource",
  {
    userId: text("userId")
      .notNull()
      .references(() => shop.userId, { onDelete: "cascade" }),
    sourceId: text("sourceId").notNull(),
    config: text("config").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sourceId] })],
);

/** ファイルを上げるデータ源の、上げたファイルを日別にまとめたもの (Upload の JSON) */
export const sourceUpload = sqliteTable(
  "SourceUpload",
  {
    userId: text("userId")
      .notNull()
      .references(() => shop.userId, { onDelete: "cascade" }),
    sourceId: text("sourceId").notNull(),
    upload: text("upload").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sourceId] })],
);

/** 数字ごとの日別の値。dataStart から並べた JSON の配列 (まだ届いていない日は null) */
export const series = sqliteTable(
  "Series",
  {
    userId: text("userId")
      .notNull()
      .references(() => shop.userId, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    /** この数字を返したデータ源 */
    sourceId: text("sourceId").notNull(),
    startDate: text("startDate").notNull(),
    values: text("values").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.metric] })],
);

export type InvestigationStatus = "running" | "done" | "failed";

/** 1回の調査。質問、AI が読み取った期間と候補、計算の結果、AI の説明 */
export const investigation = sqliteTable(
  "Investigation",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => shop.userId, { onDelete: "cascade" }),
    question: text("question").notNull(),
    locale: text("locale").notNull(),
    status: text("status").$type<InvestigationStatus>().notNull(),
    /** AI が読み取った質問 (QuestionPlan の JSON) */
    plan: text("plan"),
    /** 原因の候補から外した数字と理由 (JSON) */
    excluded: text("excluded"),
    /** 計算の結果 (InvestigationResult の JSON) */
    result: text("result"),
    /** AI の説明 (Explanation の JSON) */
    explanation: text("explanation"),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finishedAt"),
  },
  (table) => [index("Investigation_user_created_idx").on(table.userId, table.createdAt)],
);

/** 回数の上限を数える。key は「何を・いつ」(例 ip:<hash>:2026-11-05)、count はその回数 */
export const usage = sqliteTable("Usage", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
