export { editRequisition } from './backend/domain/edit-requisition.ts';
export { openRequisition } from './backend/domain/open-requisition.ts';
export {
  getRequisition,
  listRequisitions,
  type RequisitionDetail,
  type RequisitionListRow,
} from './backend/domain/read-requisitions.ts';
export {
  closeRequisition,
  holdRequisition,
  resumeRequisition,
} from './backend/domain/requisition-lifecycle.ts';
export {
  setRequisitionJd,
  setRequisitionSkills,
} from './backend/domain/set-requisition-content.ts';
export type { OpenRequisitionInput } from './contracts.ts';
