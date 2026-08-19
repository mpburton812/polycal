import { blob, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { users } from "./identity";
import { networks } from "./networks";
import { proposalComments } from "./proposals";

/** Runtime image storage in Turso BLOB column per architecture decision. */
export const storedImages = sqliteTable("stored_images", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  createdAt: text("created_at").notNull(),
});

/** Network-wide chat messages on the Feed tab (PC-228). */
export const networkChatMessages = sqliteTable("network_chat_messages", {
  id: text("id").primaryKey(),
  networkId: text("network_id").references(() => networks.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  /** Cached Open Graph preview for the first URL in body (PC-279). */
  linkPreviewId: text("link_preview_id"),
}, (table) => [
  index("idx_network_chat_messages_network_created").on(table.networkId, table.createdAt),
]);

/** Threaded replies on network chat messages (PC-234). */
export const networkChatComments = sqliteTable("network_chat_comments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => networkChatMessages.id),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  /** Cached Open Graph preview for the first URL in body (PC-279). */
  linkPreviewId: text("link_preview_id"),
}, (table) => [
  index("idx_network_chat_comments_message_created").on(table.messageId, table.createdAt),
]);

export const networkChatMessageImages = sqliteTable("network_chat_message_images", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => networkChatMessages.id),
  imageId: text("image_id")
    .notNull()
    .references(() => storedImages.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const networkChatCommentImages = sqliteTable("network_chat_comment_images", {
  id: text("id").primaryKey(),
  commentId: text("comment_id")
    .notNull()
    .references(() => networkChatComments.id),
  imageId: text("image_id")
    .notNull()
    .references(() => storedImages.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Shared Open Graph / link-preview cache for Feed posts (PC-279). */
export const feedLinkPreviews = sqliteTable("feed_link_previews", {
  id: text("id").primaryKey(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  canonicalUrl: text("canonical_url").notNull(),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  siteName: text("site_name"),
  /** ok | failed */
  status: text("status").notNull().default("ok"),
  fetchedAt: text("fetched_at").notNull(),
  errorCode: text("error_code"),
});

/** Tracks pending feed image uploads before attach to a message/comment (PC-236). */
export const feedImageUploads = sqliteTable("feed_image_uploads", {
  imageId: text("image_id")
    .primaryKey()
    .references(() => storedImages.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

/** Likes on feed milestones, chats, and comments (PC-239). */
export const feedLikes = sqliteTable(
  "feed_likes",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.targetType, table.targetId, table.userId)],
);
