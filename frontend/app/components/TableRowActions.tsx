import Link from "next/link";
import { AppIcon } from "./AppIcon";

export function TableRowActions({
  viewHref,
  editHref,
  onEdit,
}: {
  viewHref: string;
  editHref?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="table-actions">
      <Link className="table-action-link" href={viewHref}>
        <AppIcon name="eye" /> 查看
      </Link>
      {editHref && (
        <Link className="table-action-link" href={editHref}>
          <AppIcon name="edit" /> 编辑
        </Link>
      )}
      {onEdit && (
        <button className="table-action-button" onClick={onEdit} type="button">
          <AppIcon name="edit" /> 编辑
        </button>
      )}
    </div>
  );
}
