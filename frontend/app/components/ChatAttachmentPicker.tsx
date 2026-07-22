"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { FileRecord } from "shared";
import { API, fetchJson, getStoredToken } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { AppIcon } from "./AppIcon";

export type ChatAttachmentPickerHandle = {
  openPicker: () => void;
  processFiles: (files: File[] | FileList) => void;
};

const ACCEPT = ".pdf,.doc,.docx,.xlsx,.xlsm,.csv,.tsv,.txt,.md,.json,.png,.jpg,.jpeg,.webp";
const SUPPORTED_EXTENSIONS = new Set(ACCEPT.split(","));

export async function alignChatAttachments(files: FileRecord[], projectId: string): Promise<FileRecord[]> {
  return Promise.all(files.map((file) => file.projectId === projectId
    ? file
    : fetchJson<FileRecord>(`/files/${file.id}/project`, {
      method: "PATCH",
      body: JSON.stringify({ projectId }),
    })));
}

export const ChatAttachmentPicker = forwardRef<ChatAttachmentPickerHandle, {
  projectId?: string;
  files: FileRecord[];
  onChange: (files: FileRecord[]) => void;
  disabled?: boolean;
}>(function ChatAttachmentPicker({ projectId, files, onChange, disabled = false }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(selected: File[] | FileList) {
    if (!projectId) {
      showToast("请先选择业务子类", "error");
      return;
    }
    const incoming = Array.from(selected).slice(0, Math.max(0, 6 - files.length));
    if (!incoming.length) return;
    const unsupported = incoming.find((file) => {
      const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : "";
      return !SUPPORTED_EXTENSIONS.has(extension);
    });
    if (unsupported) {
      showToast(`暂不支持 ${unsupported.name}，请上传 Word、PDF、Excel、文本或图片文件`, "error");
      return;
    }
    if (incoming.some((file) => file.size > 20 * 1024 * 1024)) {
      showToast("单个附件不能超过 20MB", "error");
      return;
    }
    setUploading(true);
    const uploaded: FileRecord[] = [];
    try {
      for (const file of incoming) {
        const formData = new FormData();
        formData.append("relatedType", "project");
        formData.append("relatedId", projectId);
        formData.append("file", file);
        const headers: Record<string, string> = {};
        const token = getStoredToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (user?.id) headers["x-user-id"] = user.id;
        const response = await fetch(`${API}/files/upload`, { method: "POST", headers, body: formData });
        if (!response.ok) throw new Error(await response.text());
        uploaded.push(await response.json() as FileRecord);
      }
      onChange([...files, ...uploaded]);
      showToast(`已上传 ${uploaded.length} 个附件`, "success");
    } catch {
      if (uploaded.length) onChange([...files, ...uploaded]);
      showToast("附件上传失败，请重试", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
    processFiles: (selected) => { void uploadFiles(selected); },
  }));

  return (
    <div className="chat-attachment-picker">
      <input ref={inputRef} className="invoice-ocr-input" type="file" accept={ACCEPT} multiple onChange={(event) => void uploadFiles(event.target.files ?? [])} />
      <button
        className="composer-invoice-ocr"
        type="button"
        disabled={disabled || uploading || !projectId || files.length >= 6}
        onClick={() => inputRef.current?.click()}
        title="上传 Word、PDF、Excel、文本或图片"
      >
        <AppIcon name="file" /> {uploading ? "上传中..." : "上传文件"}
      </button>
      {files.length > 0 && (
        <div className="chat-attachment-list" aria-label="本轮附件">
          {files.map((file) => (
            <span className="chat-attachment-chip" key={file.id} title={file.filename}>
              <AppIcon name={file.mimeType.startsWith("image/") ? "image" : "document"} />
              <span>{file.filename}</span>
              <button type="button" aria-label={`移除附件 ${file.filename}`} onClick={() => onChange(files.filter((item) => item.id !== file.id))}><AppIcon name="x" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
