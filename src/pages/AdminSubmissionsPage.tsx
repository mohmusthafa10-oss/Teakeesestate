import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { PropertySubmission } from '../types/crm';

export const AdminSubmissionsPage: React.FC = () => {
  const [submissions, setSubmissions] = useState<PropertySubmission[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<PropertySubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);

  const fetchSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (statusFilter !== 'All') {
        params.status_filter = statusFilter;
      }
      if (search.trim()) {
        params.seller_name = search.trim();
      }
      const data = await apiClient.getAdminSubmissions(params);
      setSubmissions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load property submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSubmissions();
  };

  const handleViewDetail = async (subId: string) => {
    setDetailLoading(true);
    try {
      const detail = await apiClient.getAdminSubmission(subId);
      setSelectedSub(detail);
    } catch (err: any) {
      alert('Failed to load submission details: ' + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (subId: string) => {
    setActionLoading(true);
    try {
      await apiClient.approveAdminSubmission(subId);
      alert('Submission approved successfully.');
      if (selectedSub && selectedSub.id === subId) {
        setSelectedSub({ ...selectedSub, status: 'Approved' });
      }
      fetchSubmissions();
    } catch (err: any) {
      alert('Approval failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedSub || !rejectReason.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.rejectAdminSubmission(selectedSub.id, rejectReason);
      alert('Submission rejected.');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedSub({ ...selectedSub, status: 'Rejected' });
      fetchSubmissions();
    } catch (err: any) {
      alert('Rejection failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async (subId: string) => {
    if (!confirm('Are you sure you want to convert this approved submission into an active Property?')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiClient.convertAdminSubmission(subId);
      alert(`Property created successfully with Code: ${res.property_code}`);
      if (selectedSub && selectedSub.id === subId) {
        setSelectedSub({ ...selectedSub, status: 'Converted to Property' });
      }
      fetchSubmissions();
    } catch (err: any) {
      alert('Conversion failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Converted to Property':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Under Review':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#20251F]">Property Submissions (Admin)</h1>
          <p className="text-sm text-[#5E655B] mt-1">
            Review, verify, and approve public property listings submitted by owners.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-[#E4E3D8]">
        <div className="flex flex-wrap gap-2">
          {['All', 'Pending Review', 'Under Review', 'Approved', 'Rejected', 'Converted to Property'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === tab
                  ? 'bg-[#325343] text-white'
                  : 'bg-[#F1F0E8] text-[#5E655B] hover:bg-[#E4E3D8]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by seller name..."
            className="px-3 py-1.5 text-sm rounded-lg border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-1 focus:ring-[#325343] w-full sm:w-64"
          />
          <button
            type="submit"
            className="px-4 py-1.5 text-sm bg-[#325343] text-white rounded-lg hover:bg-[#253f33] transition"
          >
            Search
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E4E3D8] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#5E655B]">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="p-8 text-center text-[#5E655B]">No property submissions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF9F5] border-b border-[#E4E3D8] text-xs font-semibold text-[#5E655B] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Seller Name</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E3D8]">
                {submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAF9F5]/60 transition">
                    <td className="py-3 px-4 font-mono font-medium text-[#20251F]">{s.reference}</td>
                    <td className="py-3 px-4 font-medium text-[#20251F]">{s.seller_name}</td>
                    <td className="py-3 px-4 text-[#5E655B]">{s.phone}</td>
                    <td className="py-3 px-4 text-[#5E655B]">{s.type}</td>
                    <td className="py-3 px-4 text-[#5E655B]">{s.location}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleViewDetail(s.id)}
                        className="text-xs font-medium px-3 py-1 bg-[#325343]/10 text-[#325343] hover:bg-[#325343]/20 rounded-md transition"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Detail Modal */}
      {selectedSub && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-xl border border-[#E4E3D8] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-[#E4E3D8] pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-[#325343] bg-[#325343]/10 px-2 py-0.5 rounded">
                  {selectedSub.reference}
                </span>
                <h2 className="text-xl font-bold text-[#20251F] mt-1">{selectedSub.seller_name}</h2>
                <p className="text-xs text-[#5E655B]">{selectedSub.phone} • {selectedSub.location}</p>
              </div>
              <button
                onClick={() => setSelectedSub(null)}
                className="text-[#8E948B] hover:text-[#20251F] text-2xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-[#FAF9F5] p-4 rounded-xl">
              <div>
                <span className="text-[#8E948B] block">Type</span>
                <span className="font-semibold text-[#20251F]">{selectedSub.type}</span>
              </div>
              <div>
                <span className="text-[#8E948B] block">Expected Price</span>
                <span className="font-semibold text-[#20251F]">
                  {selectedSub.expected_price ? `₹${selectedSub.expected_price.toLocaleString()}` : 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[#8E948B] block">Size</span>
                <span className="font-semibold text-[#20251F]">{selectedSub.size ? `${selectedSub.size} Cents` : 'Not specified'}</span>
              </div>
              <div>
                <span className="text-[#8E948B] block">Status</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(selectedSub.status)}`}>
                  {selectedSub.status}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-1">Description</h3>
              <p className="text-sm text-[#20251F] bg-[#FAF9F5] p-3 rounded-xl whitespace-pre-line">
                {selectedSub.description || 'No description provided.'}
              </p>
            </div>

            {selectedSub.notes && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-1">Seller Notes / History</h3>
                <p className="text-sm text-[#5E655B] bg-amber-50 border border-amber-200 p-3 rounded-xl whitespace-pre-line">
                  {selectedSub.notes}
                </p>
              </div>
            )}

            {selectedSub.media && selectedSub.media.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5E655B] mb-2">Attached Media ({selectedSub.media.length})</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedSub.media.map((m) => (
                    <div key={m.id} className="rounded-xl border border-[#E4E3D8] overflow-hidden bg-[#FAF9F5]">
                      {m.mime_type.startsWith('image') ? (
                        <img src={m.url} alt={m.original_filename} className="w-full h-28 object-cover" />
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center text-xs text-[#5E655B] p-2 text-center">
                          Document: {m.original_filename}
                        </div>
                      )}
                      <div className="p-1.5 text-[10px] text-[#5E655B] truncate text-center">
                        {m.original_filename}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[#E4E3D8]">
              {selectedSub.status === 'Approved' && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleConvert(selectedSub.id)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  Convert to Property
                </button>
              )}

              {(selectedSub.status === 'Pending Review' || selectedSub.status === 'Under Review') && (
                <>
                  <button
                    disabled={actionLoading}
                    onClick={() => setShowRejectModal(true)}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-xl transition disabled:opacity-50"
                  >
                    Reject Submission
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleApprove(selectedSub.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
                  >
                    Approve Submission
                  </button>
                </>
              )}

              <button
                onClick={() => setSelectedSub(null)}
                className="px-4 py-2 bg-[#F1F0E8] text-[#5E655B] hover:bg-[#E4E3D8] text-xs font-semibold rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-[#20251F]">Reject Submission</h3>
            <p className="text-xs text-[#5E655B]">
              Please state the reason for rejecting this submission (e.g., incomplete documentation, invalid contact, duplicate listing).
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full p-3 text-sm rounded-xl border border-[#D5D4C7] bg-[#FAF9F5] focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#5E655B] hover:bg-[#F1F0E8] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || !rejectReason.trim()}
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
