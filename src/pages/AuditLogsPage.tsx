import React, { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { apiClient, AuditLogDTO } from '../services/apiClient';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getAuditLogs();
      setLogs(res.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Governance & Audit Logs
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Immutable chronological log of submissions, approvals, rejections, conversions, publishing toggles, agent assignments, and role updates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchLogs()}
          className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#064E3B]" />
          Refresh
        </button>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-3">Actor & Role</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Entity</th>
                <th className="py-3 px-4">Change Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DA] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#77796F]">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#77796F]">
                    No audit events recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F1F0E8]/40">
                    <td className="py-3 px-4 font-mono text-[11px] text-[#77796F] whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-[#20251F]">{l.actorName}</span>
                      <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F1F0E8] border border-[#E5E4DA] text-[#77796F]">
                        {l.actorRole}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] font-semibold text-[#064E3B]">
                      {l.action}
                    </td>
                    <td className="py-3 px-3 text-[#77796F]">
                      {l.entityType} #{l.entityId}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[#77796F] max-w-xs truncate">
                      {l.newValue ? JSON.stringify(l.newValue) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
