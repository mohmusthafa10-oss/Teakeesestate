import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { Investment } from '../types/crm';
import {
  calculateROI,
  formatCurrency,
  formatDate,
  getTodayISO,
} from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  StatusTag,
} from '../components/common/UIPrimitives';

export const InvestmentsPage: React.FC = () => {
  const { db, navigate, updateDb } = useCRM();
  const currency = db.settings.currencySymbol;

  const [invModalOpen, setInvModalOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deleting, setDeleting] = useState<Investment | null>(null);
  const [investorModalOpen, setInvestorModalOpen] = useState(false);

  // Investment form
  const [propertyId, setPropertyId] = useState(db.properties[0]?.id || '');
  const [investorId, setInvestorId] = useState(db.investors[0]?.id || '');
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [additionalExpenses, setAdditionalExpenses] = useState('0');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [actualReturn, setActualReturn] = useState('0');
  const [investmentDate, setInvestmentDate] = useState(getTodayISO());
  const [durationMonths, setDurationMonths] = useState('12');
  const [status, setStatus] = useState<Investment['status']>('Active');
  const [notes, setNotes] = useState('');

  // Investor form
  const [invName, setInvName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invEmail, setInvEmail] = useState('');

  const openAddModal = () => {
    setEditing(null);
    setPropertyId(db.properties[0]?.id || '');
    setInvestorId(db.investors[0]?.id || '');
    setInvestmentAmount('');
    setAdditionalExpenses('0');
    setExpectedReturn('');
    setActualReturn('0');
    setInvestmentDate(getTodayISO());
    setDurationMonths('12');
    setStatus('Active');
    setNotes('');
    setInvModalOpen(true);
  };

  const openEditModal = (inv: Investment) => {
    setEditing(inv);
    setPropertyId(inv.propertyId);
    setInvestorId(inv.investorId);
    setInvestmentAmount(String(inv.investmentAmount));
    setAdditionalExpenses(String(inv.additionalExpenses));
    setExpectedReturn(String(inv.expectedReturn));
    setActualReturn(String(inv.actualReturn));
    setInvestmentDate(inv.investmentDate);
    setDurationMonths(String(inv.durationMonths));
    setStatus(inv.status);
    setNotes(inv.notes);
    setInvModalOpen(true);
  };

  const summary = useMemo(() => {
    let totalInvested = 0;
    let totalExpectedReturn = 0;
    let totalActualReturn = 0;
    let activeCount = 0;

    db.investments.forEach((inv) => {
      totalInvested += inv.investmentAmount + inv.additionalExpenses;
      totalExpectedReturn += inv.expectedReturn;
      totalActualReturn += inv.actualReturn;
      if (inv.status === 'Active') activeCount += 1;
    });

    const expectedRoi =
      totalInvested > 0
        ? ((totalExpectedReturn - totalInvested) / totalInvested) * 100
        : 0;

    return {
      totalInvested,
      expectedRoi,
      totalActualReturn,
      activeCount,
    };
  }, [db.investments]);

  const livePreview = calculateROI(
    Number(investmentAmount) || 0,
    Number(additionalExpenses) || 0,
    Number(actualReturn) > 0 ? Number(actualReturn) : Number(expectedReturn) || 0
  );

  const maxChartAmount = Math.max(
    1,
    ...db.investments.map((i) =>
      Math.max(
        i.investmentAmount + i.additionalExpenses,
        i.expectedReturn,
        i.actualReturn
      )
    )
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Investments & ROI
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Track capital deployment, additional project expenses, and automatic ROI = (Net Profit / Total Investment) × 100.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInvestorModalOpen(true)}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#064E3B]" />
            Add Investor
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Investment
          </button>
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#151D18] text-[#FFFFFF] rounded-xl p-4">
          <p className="text-[11px] text-[#A8B9A2]">Total Investments</p>
          <p className="text-xl font-mono tabular-nums font-semibold mt-1">
            {formatCurrency(summary.totalInvested, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Expected Portfolio ROI</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#064E3B] mt-1">
            {summary.expectedRoi.toFixed(1)}%
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Actual Returns Realized</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#20251F] mt-1">
            {formatCurrency(summary.totalActualReturn, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-4">
          <p className="text-[11px] text-[#77796F]">Active Investments</p>
          <p className="text-xl font-mono tabular-nums font-semibold text-[#20251F] mt-1">
            {summary.activeCount}
          </p>
        </div>
      </div>

      {/* Investment Performance Bar Comparison */}
      {db.investments.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#20251F]">
              Investment Performance Comparison
            </h2>
            <div className="flex items-center gap-4 text-[11px] text-[#77796F]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#A8B9A2]" />
                Total Capital
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#176B50]" />
                Expected Return
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#064E3B]" />
                Actual Return
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {db.investments.map((inv) => {
              const prop = db.properties.find((p) => p.id === inv.propertyId);
              const totalCost = inv.investmentAmount + inv.additionalExpenses;
              const basisReturn =
                inv.actualReturn > 0 ? inv.actualReturn : inv.expectedReturn;
              const roi = calculateROI(
                inv.investmentAmount,
                inv.additionalExpenses,
                basisReturn
              );
              return (
                <div key={inv.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#20251F]">
                      {inv.code} · {prop?.title || 'Property'}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#064E3B]">
                      ROI: {roi.roiPct.toFixed(1)}% ({formatCurrency(roi.netProfit, currency)} net)
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 bg-[#F1F0E8] rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${Math.round((totalCost / maxChartAmount) * 100)}%`,
                        }}
                        className="h-full bg-[#A8B9A2] rounded-full"
                      />
                    </div>
                    <div className="h-2 bg-[#F1F0E8] rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${Math.round(
                            (inv.expectedReturn / maxChartAmount) * 100
                          )}%`,
                        }}
                        className="h-full bg-[#176B50] rounded-full"
                      />
                    </div>
                    {inv.actualReturn > 0 && (
                      <div className="h-2 bg-[#F1F0E8] rounded-full overflow-hidden">
                        <div
                          style={{
                            width: `${Math.round(
                              (inv.actualReturn / maxChartAmount) * 100
                            )}%`,
                          }}
                          className="h-full bg-[#064E3B] rounded-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Investments Table */}
      {db.investments.length === 0 ? (
        <EmptyState
          title="No investments logged yet"
          description="Track capital deployed across properties and monitor expected vs realized ROI."
          actionLabel="Log Investment"
          onAction={openAddModal}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-3">Property</th>
                  <th className="py-3 px-3">Investor</th>
                  <th className="py-3 px-3">Capital + Exp.</th>
                  <th className="py-3 px-3">Expected Return</th>
                  <th className="py-3 px-3">Actual Return</th>
                  <th className="py-3 px-3">ROI</th>
                  <th className="py-3 px-3">Date / Term</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {db.investments.map((inv) => {
                  const prop = db.properties.find((p) => p.id === inv.propertyId);
                  const investor = db.investors.find((r) => r.id === inv.investorId);
                  const basis =
                    inv.actualReturn > 0 ? inv.actualReturn : inv.expectedReturn;
                  const { totalInvestment, roiPct } = calculateROI(
                    inv.investmentAmount,
                    inv.additionalExpenses,
                    basis
                  );
                  return (
                    <tr key={inv.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#77796F]">
                        {inv.code}
                      </td>
                      <td className="py-3 px-3">
                        {prop ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'property-detail', id: prop.id })
                            }
                            className="font-semibold text-[#064E3B] hover:underline text-left cursor-pointer"
                          >
                            {prop.title}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {investor?.name || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(totalInvestment, currency)}
                        <span className="block text-[10px] text-[#77796F]">
                          +{formatCurrency(inv.additionalExpenses, currency)} exp
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(inv.expectedReturn, currency)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#064E3B] whitespace-nowrap">
                        {inv.actualReturn > 0
                          ? formatCurrency(inv.actualReturn, currency)
                          : 'Pending'}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#064E3B]">
                        {roiPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-[#77796F] whitespace-nowrap">
                        {formatDate(inv.investmentDate)} · {inv.durationMonths}m
                      </td>
                      <td className="py-3 px-3">
                        <StatusTag status={inv.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(inv)}
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] cursor-pointer"
                            title="Edit Investment"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(inv)}
                            className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
                            title="Delete Investment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Investment Modal */}
      <Modal
        open={invModalOpen}
        onClose={() => setInvModalOpen(false)}
        title={editing ? `Edit Investment — ${editing.code}` : 'Log Property Investment'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!propertyId || !investorId || !investmentAmount) return;
            updateDb(
              (prev) =>
                crmService.upsertInvestment(prev, {
                  id: editing?.id,
                  propertyId,
                  investorId,
                  investmentAmount: Number(investmentAmount),
                  additionalExpenses: Number(additionalExpenses) || 0,
                  expectedReturn: Number(expectedReturn) || 0,
                  actualReturn: Number(actualReturn) || 0,
                  investmentDate,
                  durationMonths: Number(durationMonths) || 12,
                  status,
                  notes,
                }),
              editing ? 'Investment updated' : 'Investment logged'
            );
            setInvModalOpen(false);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium mb-1">Property *</label>
              <select
                required
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {db.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Investor *</label>
              <select
                required
                value={investorId}
                onChange={(e) => setInvestorId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {db.investors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Investment Amount ({currency}) *
              </label>
              <input
                type="number"
                required
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Additional Expenses ({currency})
              </label>
              <input
                type="number"
                value={additionalExpenses}
                onChange={(e) => setAdditionalExpenses(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Expected Return ({currency})
              </label>
              <input
                type="number"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Actual Return ({currency})
              </label>
              <input
                type="number"
                value={actualReturn}
                onChange={(e) => setActualReturn(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Investment Date</label>
              <input
                type="date"
                value={investmentDate}
                onChange={(e) => setInvestmentDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duration (Months)</label>
              <input
                type="number"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Investment['status'])}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="bg-[#E4EBE0]/60 rounded-lg px-3 py-2 flex flex-col justify-center">
              <span className="text-[11px] text-[#77796F]">Calculated ROI</span>
              <span className="text-sm font-mono font-semibold text-[#064E3B]">
                {livePreview.roiPct.toFixed(1)}% ({formatCurrency(livePreview.netProfit, currency)} net)
              </span>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setInvModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Investment
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Investor Modal */}
      <Modal
        open={investorModalOpen}
        onClose={() => setInvestorModalOpen(false)}
        title="Register Investor Profile"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!invName.trim()) return;
            updateDb(
              (prev) =>
                crmService.upsertInvestor(prev, {
                  name: invName,
                  phone: invPhone,
                  email: invEmail,
                }),
              'Investor added'
            );
            setInvName('');
            setInvPhone('');
            setInvEmail('');
            setInvestorModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Investor Name *</label>
            <input
              type="text"
              required
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={invPhone}
              onChange={(e) => setInvPhone(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input
              type="email"
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInvestorModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Investor
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Investment Record"
        message={`Remove investment ${deleting?.code}?`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          updateDb(
            (prev) => crmService.deleteInvestment(prev, deleting.id),
            'Investment removed'
          );
          setDeleting(null);
        }}
      />
    </div>
  );
};
