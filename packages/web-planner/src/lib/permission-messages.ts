/**
 * Centralized copy for "you lack permission" tooltips shown on disabled planner controls (FUT-22).
 *
 * One canonical string per action keeps wording consistent across every surface and gives us a
 * single place to adjust tone or wire up i18n later. Reasons are grouped by resource/action because
 * the wording is context-specific (e.g. bucket rename vs reorder), not a 1:1 map of permission keys.
 */
export const PERMISSION_DENIED = {
  task: {
    create: "You don't have permission to create tasks.",
    edit: "You don't have permission to edit this task.",
    delete: "You don't have permission to delete tasks.",
    assign: "You don't have permission to assign people.",
    comment: "You don't have permission to comment on tasks.",
    move: "You don't have permission to move tasks.",
    restore: "You don't have permission to restore tasks.",
  },
  bucket: {
    create: "You don't have permission to create buckets.",
    rename: "You don't have permission to rename buckets.",
    reorder: "You don't have permission to reorder buckets.",
    delete: "You don't have permission to delete buckets.",
  },
  plan: {
    create: "You don't have permission to create plans.",
    delete: "You don't have permission to delete plans.",
    restore: "You don't have permission to restore plans.",
  },
  group: {
    create: "You don't have permission to create groups.",
    edit: "You don't have permission to edit this group.",
    restore: "You don't have permission to restore this group.",
    invite: "You don't have permission to invite members.",
    addMember: "You don't have permission to add members.",
  },
  trash: {
    permanentDelete: "You don't have permission to permanently delete items.",
  },
} as const;

export const LINKED_GROUP = {
  members: 'Members are managed in Microsoft 365. Add or remove them there.',
} as const;
