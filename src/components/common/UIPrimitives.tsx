import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { getStatusTone } from '../../utils/formatters';

export const StatusTag: React.FC<{ status: string; className?: string }> = ({
  status,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${getStatusTone(
        status
      )} ${className}`}
    >
      {status}
    </span>
  );
};

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export const Breadcrumbs: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#77796F] mb-3">
      {items.map((item, idx) => (
        <React.Fragment key={`${item.label}-${idx}`}>
          {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#A8B9A2]" />}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="hover:text-[#064E3B] transition-colors font-medium cursor-pointer"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-[#20251F] font-medium truncate max-w-[260px]">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidthClass = 'max-w-2xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#151D18]/50 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${maxWidthClass} bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="px-6 py-4 border-b border-[#E5E4DA] flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#20251F]">{title}</h2>
            {subtitle && <p className="text-xs text-[#77796F] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#77796F] hover:text-[#20251F] hover:bg-[#F1F0E8] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidthClass="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              danger ? 'bg-[#C96C60]/15 text-[#C96C60]' : 'bg-[#E4EBE0] text-[#064E3B]'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-sm text-[#20251F] leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5E4DA]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-[#20251F] hover:bg-[#F1F0E8] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-medium rounded-lg text-[#FFFFFF] transition-colors cursor-pointer ${
              danger
                ? 'bg-[#C96C60] hover:bg-[#B2594E]'
                : 'bg-[#064E3B] hover:bg-[#176B50]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const Pagination: React.FC<{
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}> = ({ totalItems, page, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="px-4 py-3 border-t border-[#E5E4DA] flex items-center justify-between gap-4 text-xs text-[#77796F]">
      <span className="tabular-nums">
        Showing {start}–{end} of {totalItems} records
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-8 px-2.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-[#20251F] disabled:opacity-40 hover:bg-[#F1F0E8] transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>
        <span className="px-2 tabular-nums font-medium text-[#20251F]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-8 px-2.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] text-[#20251F] disabled:opacity-40 hover:bg-[#F1F0E8] transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl py-12 px-6 text-center">
    <div className="w-11 h-11 rounded-xl bg-[#E4EBE0] text-[#064E3B] flex items-center justify-center mx-auto mb-3">
      <Building2 className="w-5 h-5" />
    </div>
    <h3 className="text-sm font-semibold text-[#20251F]">{title}</h3>
    <p className="text-xs text-[#77796F] max-w-md mx-auto mt-1 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 px-4 py-2 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-[#FFFFFF] text-xs font-medium transition-colors cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const PropertyThumbnail: React.FC<{
  src?: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = 'w-12 h-10 rounded-lg' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-[#E4EBE0] text-[#064E3B] flex items-center justify-center border border-[#E5E4DA] shrink-0`}
      >
        <Building2 className="w-4 h-4 opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover border border-[#E5E4DA] shrink-0 bg-[#E4EBE0]`}
    />
  );
};

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useCRM();

  if (toasts.length === 0) return null;

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-[#151D18] text-[#FFFFFF] border border-[#2F3E34] rounded-xl px-4 py-3 shadow-lg flex items-start gap-2.5"
        >
          {toast.type === 'success' && (
            <CheckCircle2 className="w-4 h-4 text-[#70A76B] shrink-0 mt-0.5" />
          )}
          {toast.type === 'error' && (
            <XCircle className="w-4 h-4 text-[#C96C60] shrink-0 mt-0.5" />
          )}
          {toast.type === 'info' && (
            <Info className="w-4 h-4 text-[#A8B9A2] shrink-0 mt-0.5" />
          )}
          <p className="text-xs leading-relaxed flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="text-[#A8B9A2] hover:text-[#FFFFFF] cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
