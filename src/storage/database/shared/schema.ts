import { pgTable, index, serial, varchar, text, timestamp } from "drizzle-orm/pg-core"

export const promotionCandidates = pgTable("promotion_candidates", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id", { length: 128 }).notNull(),
	originalConversation: text("original_conversation").notNull(),
	extractedMemory: text("extracted_memory").notNull(),
	aiReason: text("ai_reason"),
	category: varchar({ length: 50 }),
	contentFingerprint: varchar("content_fingerprint", { length: 64 }),
	duplicateCount: varchar("duplicate_count").default('0'),
	status: varchar({ length: 20 }).default('pending').notNull(),
	reviewerNote: text("reviewer_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("pc_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("pc_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("pc_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("pc_fingerprint_idx").using("btree", table.contentFingerprint.asc().nullsLast().op("text_ops")),
]);

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const publicMemories = pgTable("public_memories", {
	id: serial().primaryKey().notNull(),
	category: varchar({ length: 50 }).notNull(),
	content: text().notNull(),
	sourceUserId: varchar("source_user_id", { length: 128 }),
	sourceConversation: text("source_conversation"),
	status: varchar({ length: 20 }).default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("pm_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("pm_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);
