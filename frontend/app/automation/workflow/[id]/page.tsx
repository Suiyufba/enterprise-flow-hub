"use client";

import { useParams } from "next/navigation";
import WorkflowEditor from "../../WorkflowEditor";

export default function EditWorkflowPage() {
  const { id } = useParams<{ id: string }>();
  return <WorkflowEditor id={id} />;
}
