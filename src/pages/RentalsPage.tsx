import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Receipt, Trash2, UserPlus } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { apiClient } from '../services/apiClient';
import { RentalBooking, RentalStatus, RentalType } from '../types/crm';
import {
  formatCurrency,
  formatDate,
  getTodayISO,
  offsetDaysISO,
} from '../utils/formatters';
import {
  ConfirmDialog,
  EmptyState,
  Modal,
  StatusTag,
} from '../components/common/UIPrimitives';

export const RentalsPage: React.FC = () => {
  const { db, navigate, updateDb, notify, refreshDb } = useCRM();
  const currency = db.settings.currencySymbol;
  const today = getTodayISO();
  const nextWeek = offsetDaysISO(7);

  const [statusFilter, setStatusFilter] = useState<'All' | RentalStatus>('All');
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [editing, setEditing] = useState<RentalBooking | null>(null);
  const [deleting, setDeleting] = useState<RentalBooking | null>(null);

  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [expenseTarget, setExpenseTarget] = useState<RentalBooking | null>(null);

  // Booking Form
  const [propertyId, setPropertyId] = useState(db.properties[0]?.id || '');
  const [tenantId, setTenantId] = useState(db.tenants[0]?.id || '');
  const [rentalType, setRentalType] = useState<RentalType>('Daily Stay');
  const [rateAmount, setRateAmount] = useState('');
  const [bookingDate, setBookingDate] = useState(today);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(offsetDaysISO(3));
  const [deposit, setDeposit] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [incomeReceived, setIncomeReceived] = useState('');
  const [status, setStatus] = useState<RentalStatus>('Booked');
  const [maintenanceNotes, setMaintenanceNotes] = useState('');

  // Tenant Form
  const [tenName, setTenName] = useState('');
  const [tenPhone, setTenPhone] = useState('');
  const [tenEmail, setTenEmail] = useState('');
  const [tenIdProof, setTenIdProof] = useState('');

  // Expense Form
  const [expCategory, setExpCategory] = useState('Housekeeping & Maintenance');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(today);

  const overview = useMemo(() => {
    const managedProps = db.properties.filter((p) => p.isManaged);
    const totalIncome = db.rentalBookings.reduce(
      (s, b) => s + (b.incomeReceived || 0),
      0
    );
    const upcomingCheckIns = db.rentalBookings.filter(
      (b) => b.checkIn >= today && b.checkIn <= nextWeek && b.status !== 'Maintenance'
    ).length;
    const upcomingCheckOuts = db.rentalBookings.filter(
      (b) => b.checkOut >= today && b.checkOut <= nextWeek
    ).length;

    return {
      managedCount: managedProps.length,
      available: db.rentalBookings.filter((b) => b.status === 'Available').length,
      booked: db.rentalBookings.filter((b) => b.status === 'Booked').length,
      occupied: db.rentalBookings.filter((b) => b.status === 'Occupied').length,
      upcomingCheckIns,
      upcomingCheckOuts,
      totalIncome,
    };
  }, [db.properties, db.rentalBookings, today, nextWeek]);

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return db.rentalBookings;
    return db.rentalBookings.filter((b) => b.status === statusFilter);
  }, [db.rentalBookings, statusFilter]);

  const openAddBooking = () => {
    setEditing(null);
    setPropertyId(
      db.properties.find((p) => p.isManaged)?.id || db.properties[0]?.id || ''
    );
    setTenantId(db.tenants[0]?.id || '');
    setRentalType('Daily Stay');
    setRateAmount('');
    setBookingDate(today);
    setCheckIn(today);
    setCheckOut(offsetDaysISO(3));
    setDeposit('0');
    setContractRef('');
    setIncomeReceived('0');
    setStatus('Booked');
    setMaintenanceNotes('');
    setBookingModalOpen(true);
  };

  const openEditBooking = (b: RentalBooking) => {
    setEditing(b);
    setPropertyId(b.propertyId);
    setTenantId(b.tenantId || '');
    setRentalType(b.rentalType);
    setRateAmount(String(b.rateAmount));
    setBookingDate(b.bookingDate);
    setCheckIn(b.checkIn);
    setCheckOut(b.checkOut);
    setDeposit(String(b.deposit));
    setContractRef(b.contractRef);
    setIncomeReceived(String(b.incomeReceived));
    setStatus(b.status);
    setMaintenanceNotes(b.maintenanceNotes);
    setBookingModalOpen(true);
  };

  const getBookingExpenses = (bookingId: string) =>
    db.expenses
      .filter((e) => e.entityType === 'Rental' && e.entityId === bookingId)
      .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Stay & Rentals Operations
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Manage daily stays, long-term rentals, guest check-ins/outs, deposits, contracts, and maintenance expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTenantModalOpen(true)}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/50 text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#064E3B]" />
            Add Tenant / Guest
          </button>
          <button
            type="button"
            onClick={openAddBooking}
            className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Rental / Stay
          </button>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-[#151D18] text-[#FFFFFF] rounded-xl p-3.5">
          <p className="text-[11px] text-[#A8B9A2]">Rental Income</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {formatCurrency(overview.totalIncome, currency)}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Managed Props</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {overview.managedCount}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Available</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {overview.available}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Booked</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {overview.booked}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Occupied</p>
          <p className="text-lg font-mono tabular-nums font-semibold text-[#064E3B] mt-1">
            {overview.occupied}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Check-ins (7d)</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {overview.upcomingCheckIns}
          </p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-xl p-3.5">
          <p className="text-[11px] text-[#77796F]">Check-outs (7d)</p>
          <p className="text-lg font-mono tabular-nums font-semibold mt-1">
            {overview.upcomingCheckOuts}
          </p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-3 flex flex-wrap gap-1.5">
        {(['All', 'Available', 'Booked', 'Occupied', 'Maintenance', 'Vacant'] as const).map(
          (st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                statusFilter === st
                  ? 'bg-[#064E3B] text-[#FFFFFF]'
                  : 'bg-[#F1F0E8]/60 text-[#20251F] hover:bg-[#E4EBE0]'
              }`}
            >
              {st}
            </button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No rental or stay records"
          description="Create a stay booking or monthly lease linked to a managed property."
          actionLabel="Add Rental / Stay"
          onAction={openAddBooking}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Property & Owner</th>
                  <th className="py-3 px-3">Rental Type / Rate</th>
                  <th className="py-3 px-3">Tenant / Guest</th>
                  <th className="py-3 px-3">Check-in → Check-out</th>
                  <th className="py-3 px-3">Deposit & Contract</th>
                  <th className="py-3 px-3">Income / Exp.</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {filtered.map((b) => {
                  const prop = db.properties.find((p) => p.id === b.propertyId);
                  const owner = prop
                    ? db.sellers.find((s) => s.id === prop.sellerId)
                    : undefined;
                  const tenant = b.tenantId
                    ? db.tenants.find((t) => t.id === b.tenantId)
                    : undefined;
                  const expTotal = getBookingExpenses(b.id);

                  return (
                    <tr key={b.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() =>
                            prop && navigate({ page: 'property-detail', id: prop.id })
                          }
                          className="font-semibold text-[#064E3B] hover:underline text-left cursor-pointer"
                        >
                          {prop?.title || 'Property'}
                        </button>
                        <p className="text-[11px] text-[#77796F]">
                          {b.code} · Owner: {owner?.name || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-medium text-[#20251F]">{b.rentalType}</span>
                        <span className="block text-[11px] font-mono tabular-nums text-[#064E3B]">
                          {formatCurrency(b.rateAmount, currency)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-[#20251F]">
                          {tenant?.name || 'Vacant / Open'}
                        </span>
                        {tenant?.phone && (
                          <span className="block text-[11px] font-mono text-[#77796F]">
                            {tenant.phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px] whitespace-nowrap">
                        <span>{formatDate(b.checkIn)}</span>
                        <span className="text-[#77796F]"> → </span>
                        <span>{b.checkOut ? formatDate(b.checkOut) : 'Open'}</span>
                        <span className="block text-[10px] text-[#77796F]">
                          Booked {formatDate(b.bookingDate)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] whitespace-nowrap">
                        <span className="font-mono tabular-nums">
                          Dep: {formatCurrency(b.deposit, currency)}
                        </span>
                        <span className="block text-[#77796F] font-mono">
                          {b.contractRef || 'No ref'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span className="text-[#064E3B] font-semibold">
                          +{formatCurrency(b.incomeReceived, currency)}
                        </span>
                        <span className="block text-[11px] text-[#C96C60]">
                          -{formatCurrency(expTotal, currency)} exp
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={b.status}
                          onChange={async (e) => {
                            const newStatus = e.target.value as RentalStatus;
                            try {
                              await apiClient.updateRental(b.id, { status: newStatus });
                              updateDb(
                                (prev) =>
                                  crmService.upsertRentalBooking(prev, {
                                    ...b,
                                    status: newStatus,
                                  }),
                                `Rental status changed to ${newStatus}`
                              );
                              await refreshDb();
                            } catch (err: any) {
                              notify(err.message || 'Failed to update rental status', 'error');
                            }
                          }}
                          className="h-7 px-2 text-[11px] border border-[#E5E4DA] rounded bg-[#FFFFFF]"
                        >
                          <option value="Available">Available</option>
                          <option value="Booked">Booked</option>
                          <option value="Occupied">Occupied</option>
                          <option value="Maintenance">Maintenance</option>
                          <option value="Vacant">Vacant</option>
                        </select>
                        {b.maintenanceNotes && (
                          <p className="text-[10px] text-[#77796F] truncate max-w-[140px] mt-1">
                            {b.maintenanceNotes}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setExpenseTarget(b)}
                            title="Log Maintenance Expense"
                            className="p-1.5 rounded-md hover:bg-[#E4EBE0] text-[#064E3B] cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditBooking(b)}
                            title="Edit Booking"
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(b)}
                            title="Delete Booking"
                            className="p-1.5 rounded-md hover:bg-[#C96C60]/15 text-[#C96C60] cursor-pointer"
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

      {/* Add/Edit Rental Booking Modal */}
      <Modal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title={editing ? `Edit Rental — ${editing.code}` : 'Add Stay / Rental Record'}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!propertyId || !rateAmount) return;
            try {
              const payload = {
                property_id: propertyId,
                tenant_id: tenantId || undefined,
                rental_type: rentalType,
                rate_amount: Number(rateAmount),
                booking_date: bookingDate,
                check_in: checkIn,
                check_out: checkOut,
                deposit: Number(deposit) || 0,
                contract_ref: contractRef,
                income_received: Number(incomeReceived) || 0,
                status,
                maintenance_notes: maintenanceNotes,
              };
              if (editing) {
                await apiClient.updateRental(editing.id, payload);
              } else {
                await apiClient.createRental(payload);
              }
              updateDb(
                (prev) =>
                  crmService.upsertRentalBooking(prev, {
                    id: editing?.id,
                    propertyId,
                    tenantId: tenantId || undefined,
                    rentalType,
                    rateAmount: Number(rateAmount),
                    bookingDate,
                    checkIn,
                    checkOut,
                    deposit: Number(deposit) || 0,
                    contractRef,
                    incomeReceived: Number(incomeReceived) || 0,
                    status,
                    maintenanceNotes,
                  }),
                editing ? 'Rental updated' : 'Rental booking created'
              );
              await refreshDb();
              setBookingModalOpen(false);
            } catch (err: any) {
              notify(err.message || 'Failed to save rental booking', 'error');
            }
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
              <label className="block text-xs font-medium mb-1">Tenant / Guest</label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="">None / Vacant</option>
                {db.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Rental Type</label>
              <select
                value={rentalType}
                onChange={(e) => setRentalType(e.target.value as RentalType)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Daily Stay">Daily Stay</option>
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Rate ({currency}) *
              </label>
              <input
                type="number"
                required
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Check-in Date</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Check-out Date</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Deposit ({currency})
              </label>
              <input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Income Received ({currency})
              </label>
              <input
                type="number"
                value={incomeReceived}
                onChange={(e) => setIncomeReceived(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contract Reference</label>
              <input
                type="text"
                value={contractRef}
                onChange={(e) => setContractRef(e.target.value)}
                placeholder="e.g. LSE-2026-051"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RentalStatus)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Available">Available</option>
                <option value="Booked">Booked</option>
                <option value="Occupied">Occupied</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Vacant">Vacant</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Maintenance Notes</label>
              <textarea
                rows={2}
                value={maintenanceNotes}
                onChange={(e) => setMaintenanceNotes(e.target.value)}
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setBookingModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Rental
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Tenant Modal */}
      <Modal
        open={tenantModalOpen}
        onClose={() => setTenantModalOpen(false)}
        title="Register Tenant / Stay Guest"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!tenName.trim()) return;
            updateDb(
              (prev) =>
                crmService.upsertTenant(prev, {
                  name: tenName,
                  phone: tenPhone,
                  email: tenEmail,
                  idProof: tenIdProof,
                }),
              'Tenant / Guest registered'
            );
            setTenName('');
            setTenPhone('');
            setTenEmail('');
            setTenIdProof('');
            setTenantModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={tenName}
              onChange={(e) => setTenName(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={tenPhone}
              onChange={(e) => setTenPhone(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input
              type="email"
              value={tenEmail}
              onChange={(e) => setTenEmail(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">ID / KYC Reference</label>
            <input
              type="text"
              value={tenIdProof}
              onChange={(e) => setTenIdProof(e.target.value)}
              placeholder="Passport / Aadhaar / GSTIN"
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTenantModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Guest
            </button>
          </div>
        </form>
      </Modal>

      {/* Log Expense Modal */}
      <Modal
        open={Boolean(expenseTarget)}
        onClose={() => setExpenseTarget(null)}
        title={`Log Maintenance Expense — ${expenseTarget?.code || ''}`}
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!expenseTarget || !expAmount) return;
            updateDb(
              (prev) =>
                crmService.addExpense(prev, {
                  entityType: 'Rental',
                  entityId: expenseTarget.id,
                  category: expCategory,
                  description: expDesc,
                  amount: Number(expAmount),
                  date: expDate,
                }),
              'Rental expense logged'
            );
            setExpDesc('');
            setExpAmount('');
            setExpenseTarget(null);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Category</label>
            <input
              type="text"
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Amount ({currency}) *
            </label>
            <input
              type="number"
              required
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              className="w-full h-9 px-3 text-xs font-mono border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Date</label>
            <input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setExpenseTarget(null)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Record Expense
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Rental Booking"
        message={`Delete booking ${deleting?.code}?`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiClient.deleteRental(deleting.id);
            updateDb(
              (prev) => crmService.deleteRentalBooking(prev, deleting.id),
              'Rental booking deleted'
            );
            await refreshDb();
          } catch (err: any) {
            notify(err.message || 'Failed to delete rental booking', 'error');
          } finally {
            setDeleting(null);
          }
        }}
      />
    </div>
  );
};
