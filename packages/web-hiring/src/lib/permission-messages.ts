/**
 * Centralized copy for "you lack permission" tooltips shown on disabled hiring controls,
 * matching the convention in web-planner/src/lib/permission-messages.ts.
 */
export const PERMISSION_DENIED = {
  requisition: {
    create: "You don't have permission to create requisitions.",
    edit: "You don't have permission to edit this requisition.",
    manage: "You don't have permission to manage this requisition.",
  },
} as const;
