/** RBAC roles — passive users are schedulable profiles without login. */
export const userRoles = ["admin", "user", "passive"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "paused", "banned", "deleted"] as const;
export type UserStatus = (typeof userStatuses)[number];
