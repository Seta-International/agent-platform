interface Props {
  count: number;
  onMove: (toBucketId: string | null) => void;
  onAssign: () => void;
  onSetDue: () => void;
  onDelete: () => void;
}

export function GridBulkActionFooter({ count, onMove, onAssign, onSetDue, onDelete }: Props) {
  return (
    <footer
      role="toolbar"
      className="grid-bulk-action-footer"
      aria-label={`${count} tasks selected`}
    >
      <span>{count} selected</span>
      <button type="button" onClick={() => onMove(null)}>
        Move
      </button>
      <button type="button" onClick={onAssign}>
        Assign
      </button>
      <button type="button" onClick={onSetDue}>
        Set due
      </button>
      <button type="button" onClick={onDelete}>
        Delete
      </button>
    </footer>
  );
}
