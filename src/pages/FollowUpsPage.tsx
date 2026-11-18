import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { crmService } from '../services/crmService';
import { FollowUp, FollowUpActivityType } from '../types/crm';
import { formatDate, getTodayISO, offsetDaysISO } from '../utils/formatters';
import {
  EmptyState,
  Modal,
  StatusTag,
} from '../components/common/UIPrimitives';

type FollowUpCategory = 'Today' | 'Overdue' | 'Upcoming' | 'Completed';

export const FollowUpsPage: React.FC = () => {
  const { db, currentUser, route, navigate, updateDb, visibleFollowUps } = useCRM();
  const today = getTodayISO();

  const [category, setCategory] = useState<FollowUpCategory>(
    (route.filterCategory as FollowUpCategory) || 'Today'
  );
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [agentFilter, setAgentFilter] = useState('All');

  // Calendar Month State
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  // Add/Edit Follow-up Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [title, setTitle] = useState('');
  const [relatedType, setRelatedType] = useState<'Lead' | 'Seller'>('Lead');
  const [relatedId, setRelatedId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUser.id);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(db.settings.followUpDefaults.defaultTime || '10:30');
  const [activityType, setActivityType] = useState<FollowUpActivityType>('Call');
  const [notes, setNotes] = useState('');

  // Complete + Chain Next Follow-up Modal
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [scheduleNext, setScheduleNext] = useState(true);
  const [nextDate, setNextDate] = useState(offsetDaysISO(3));
  const [nextTitle, setNextTitle] = useState('');
  const [nextType, setNextType] = useState<FollowUpActivityType>('Call');

  useEffect(() => {
    if (
      route.filterCategory &&
      ['Today', 'Overdue', 'Upcoming', 'Completed'].includes(route.filterCategory)
    ) {
      setCategory(route.filterCategory as FollowUpCategory);
    }
  }, [route.filterCategory]);

  const counts = useMemo(() => {
    const base = visibleFollowUps.filter(
      (f) => agentFilter === 'All' || f.assignedAgentId === agentFilter
    );
    return {
      Today: base.filter((f) => f.status === 'Pending' && f.date === today).length,
      Overdue: base.filter((f) => f.status === 'Pending' && f.date < today).length,
      Upcoming: base.filter((f) => f.status === 'Pending' && f.date > today).length,
      Completed: base.filter((f) => f.status === 'Completed').length,
    };
  }, [visibleFollowUps, agentFilter, today]);

  const filteredList = useMemo(() => {
    return visibleFollowUps
      .filter((f) => {
        if (agentFilter !== 'All' && f.assignedAgentId !== agentFilter) return false;
        if (category === 'Today') return f.status === 'Pending' && f.date === today;
        if (category === 'Overdue') return f.status === 'Pending' && f.date < today;
        if (category === 'Upcoming') return f.status === 'Pending' && f.date > today;
        return f.status === 'Completed';
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [visibleFollowUps, agentFilter, category, today]);

  const openAddModal = (prefillDate?: string) => {
    setEditing(null);
    setTitle('');
    setRelatedType('Lead');
    setRelatedId(db.leads[0]?.id || '');
    setPropertyId('');
    setAssignedAgentId(currentUser.id);
    setDate(prefillDate || today);
    setTime(db.settings.followUpDefaults.defaultTime || '10:30');
    setActivityType('Call');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (fup: FollowUp) => {
    setEditing(fup);
    setTitle(fup.title);
    setRelatedType(fup.relatedType);
    setRelatedId(fup.relatedId);
    setPropertyId(fup.propertyId || '');
    setAssignedAgentId(fup.assignedAgentId);
    setDate(fup.date);
    setTime(fup.time);
    setActivityType(fup.activityType);
    setNotes(fup.notes);
    setModalOpen(true);
  };

  const openCompleteModal = (fup: FollowUp) => {
    setCompleting(fup);
    setCompletionNotes('');
    setScheduleNext(true);
    setNextDate(offsetDaysISO(3));
    setNextTitle(`Next step: ${fup.title}`);
    setNextType('Call');
  };

  const calendarDays = useMemo(() => {
    const first = new Date(calMonth.year, calMonth.month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const cells: { dateStr: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ dateStr: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(calMonth.month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ dateStr: `${calMonth.year}-${mStr}-${dStr}`, dayNum: d });
    }
    return cells;
  }, [calMonth]);

  const monthLabel = new Date(calMonth.year, calMonth.month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const getContactName = (f: FollowUp) =>
    f.relatedType === 'Lead'
      ? db.leads.find((l) => l.id === f.relatedId)?.name || 'Lead'
      : db.sellers.find((s) => s.id === f.relatedId)?.name || 'Seller';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Follow-ups & Reminders
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Track overdue calls, daily tasks, and schedule automatic next follow-ups across leads and sellers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list' ? 'bg-[#064E3B] text-[#FFFFFF]' : 'text-[#77796F]'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Task List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'calendar' ? 'bg-[#064E3B] text-[#FFFFFF]' : 'text-[#77796F]'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Calendar
            </button>
          </div>
          <button
            type="button"
            onClick={() => openAddModal()}
            className="h-9 px-4 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Follow-up
          </button>
        </div>
      </div>

      {/* Category Tabs & Agent Filter */}
      <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['Today', 'Overdue', 'Upcoming', 'Completed'] as FollowUpCategory[]).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  setViewMode('list');
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                  category === cat && viewMode === 'list'
                    ? cat === 'Overdue'
                      ? 'bg-[#C96C60] text-[#FFFFFF]'
                      : 'bg-[#064E3B] text-[#FFFFFF]'
                    : 'bg-[#F1F0E8]/70 text-[#20251F] hover:bg-[#E4EBE0]'
                }`}
              >
                <span>{cat}</span>
                <span className="font-mono tabular-nums text-[11px] opacity-85">
                  {counts[cat]}
                </span>
              </button>
            )
          )}
        </div>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="h-9 px-3 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
        >
          <option value="All">All Agents</option>
          {db.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {viewMode === 'calendar' ? (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#20251F]">{monthLabel}</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setCalMonth((prev) =>
                    prev.month === 0
                      ? { year: prev.year - 1, month: 11 }
                      : { year: prev.year, month: prev.month - 1 }
                  )
                }
                className="p-1.5 rounded-lg border border-[#E5E4DA] hover:bg-[#F1F0E8] cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalMonth((prev) =>
                    prev.month === 11
                      ? { year: prev.year + 1, month: 0 }
                      : { year: prev.year, month: prev.month + 1 }
                  )
                }
                className="p-1.5 rounded-lg border border-[#E5E4DA] hover:bg-[#F1F0E8] cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold text-[#77796F]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((cell, idx) => {
              if (!cell.dateStr) {
                return <div key={`empty-${idx}`} className="h-24 rounded-xl bg-[#F1F0E8]/30" />;
              }
              const dayTasks = visibleFollowUps.filter(
                (f) =>
                  f.date === cell.dateStr &&
                  (agentFilter === 'All' || f.assignedAgentId === agentFilter)
              );
              const isToday = cell.dateStr === today;
              const isSelected = selectedCalDate === cell.dateStr;
              return (
                <div
                  key={cell.dateStr}
                  onClick={() => setSelectedCalDate(cell.dateStr)}
                  className={`h-24 rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-[#064E3B] bg-[#E4EBE0]/40'
                      : isToday
                      ? 'border-[#176B50] bg-[#FFFFFF]'
                      : 'border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#F1F0E8]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono tabular-nums font-semibold ${
                        isToday ? 'text-[#064E3B]' : 'text-[#20251F]'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddModal(cell.dateStr!);
                      }}
                      className="text-[11px] text-[#064E3B] hover:underline cursor-pointer"
                      title="Add task on this date"
                    >
                      +
                    </button>
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    {dayTasks.slice(0, 2).map((t) => (
                      <div
                        key={t.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate ${
                          t.status === 'Completed'
                            ? 'bg-[#E4EBE0] text-[#064E3B] line-through'
                            : t.date < today
                            ? 'bg-[#C96C60]/15 text-[#8D382E]'
                            : 'bg-[#064E3B] text-[#FFFFFF]'
                        }`}
                      >
                        {t.time} {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <p className="text-[10px] text-[#77796F]">
                        +{dayTasks.length - 2} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedCalDate && (
            <div className="pt-4 border-t border-[#E5E4DA] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#20251F]">
                  Tasks on {formatDate(selectedCalDate)}
                </h3>
                <button
                  type="button"
                  onClick={() => openAddModal(selectedCalDate)}
                  className="text-xs font-medium text-[#064E3B] hover:underline cursor-pointer"
                >
                  + Add for this day
                </button>
              </div>
              {visibleFollowUps
                .filter((f) => f.date === selectedCalDate)
                .map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-xl border border-[#E5E4DA] flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#20251F]">{f.title}</p>
                      <p className="text-[11px] text-[#77796F]">
                        {f.time} · {f.activityType} · {getContactName(f)}
                      </p>
                    </div>
                    {f.status === 'Pending' ? (
                      <button
                        type="button"
                        onClick={() => openCompleteModal(f)}
                        className="px-2.5 py-1 rounded bg-[#064E3B] text-[#FFFFFF] text-[11px] cursor-pointer"
                      >
                        Complete
                      </button>
                    ) : (
                      <StatusTag status="Completed" />
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : filteredList.length === 0 ? (
        <EmptyState
          title={`No ${category.toLowerCase()} follow-ups`}
          description="Create a new follow-up activity for a buyer lead or property seller."
          actionLabel="Create Follow-up"
          onAction={() => openAddModal()}
        />
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                  <th className="py-3 px-4">Task Title</th>
                  <th className="py-3 px-3">Related Contact</th>
                  <th className="py-3 px-3">Property</th>
                  <th className="py-3 px-3">Activity</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Agent</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DA] text-xs">
                {filteredList.map((fup) => {
                  const prop = fup.propertyId
                    ? db.properties.find((p) => p.id === fup.propertyId)
                    : undefined;
                  const agent = db.users.find((u) => u.id === fup.assignedAgentId);
                  const isOverdue = fup.status === 'Pending' && fup.date < today;
                  return (
                    <tr key={fup.id} className="hover:bg-[#F1F0E8]/40">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#20251F]">{fup.title}</p>
                        {fup.notes && (
                          <p className="text-[11px] text-[#77796F] truncate max-w-[260px]">
                            {fup.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              page:
                                fup.relatedType === 'Lead'
                                  ? 'lead-detail'
                                  : 'seller-detail',
                              id: fup.relatedId,
                            })
                          }
                          className="font-medium text-[#064E3B] hover:underline cursor-pointer"
                        >
                          {getContactName(fup)}
                        </button>
                        <p className="text-[11px] text-[#77796F]">{fup.relatedType}</p>
                      </td>
                      <td className="py-3 px-3">
                        {prop ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ page: 'property-detail', id: prop.id })
                            }
                            className="text-[#20251F] hover:text-[#064E3B] hover:underline truncate max-w-[160px] block cursor-pointer"
                          >
                            {prop.title}
                          </button>
                        ) : (
                          <span className="text-[#77796F]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{fup.activityType}</td>
                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span className={isOverdue ? 'text-[#C96C60] font-semibold' : ''}>
                          {formatDate(fup.date)}
                        </span>{' '}
                        <span className="text-[#77796F]">{fup.time}</span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {agent?.name || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <StatusTag status={isOverdue ? 'Overdue' : fup.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {fup.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => openCompleteModal(fup)}
                              className="px-2.5 py-1 rounded-md bg-[#E4EBE0] hover:bg-[#064E3B] text-[#064E3B] hover:text-[#FFFFFF] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(fup)}
                            title="Edit Follow-up"
                            className="p-1.5 rounded-md hover:bg-[#F1F0E8] text-[#20251F] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDb(
                                (prev) => crmService.deleteFollowUp(prev, fup.id),
                                'Follow-up deleted'
                              )
                            }
                            title="Delete Follow-up"
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

      {/* Create / Edit Follow-up Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Follow-up' : 'Create Follow-up Reminder'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !relatedId) return;
            updateDb(
              (prev) =>
                crmService.upsertFollowUp(prev, {
                  id: editing?.id,
                  title,
                  relatedType,
                  relatedId,
                  propertyId: propertyId || undefined,
                  assignedAgentId,
                  date,
                  time,
                  activityType,
                  notes,
                }),
              editing ? 'Follow-up updated' : 'Follow-up scheduled'
            );
            setModalOpen(false);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Task Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow up on site visit feedback"
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Related Entity</label>
              <select
                value={relatedType}
                onChange={(e) => {
                  const nextType = e.target.value as 'Lead' | 'Seller';
                  setRelatedType(nextType);
                  setRelatedId(
                    nextType === 'Lead'
                      ? db.leads[0]?.id || ''
                      : db.sellers[0]?.id || ''
                  );
                }}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Lead">Buyer Lead</option>
                <option value="Seller">Property Seller</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Select {relatedType} *
              </label>
              <select
                required
                value={relatedId}
                onChange={(e) => setRelatedId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {(relatedType === 'Lead' ? db.leads : db.sellers).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Related Property (Optional)
              </label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="">None</option>
                {db.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Activity Type</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as FollowUpActivityType)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                <option value="Call">Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Meeting">Meeting</option>
                <option value="Site Visit">Site Visit</option>
                <option value="Email">Email</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-9 px-3 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Assigned Agent</label>
              <select
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              >
                {db.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DA]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Save Follow-up
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete + Schedule Next Follow-up Modal */}
      <Modal
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title="Complete Follow-up & Log Conversation"
        subtitle={completing?.title}
        maxWidthClass="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!completing) return;
            updateDb(
              (prev) =>
                crmService.completeFollowUp(
                  prev,
                  completing.id,
                  completionNotes,
                  scheduleNext
                    ? {
                        date: nextDate,
                        time: '10:30',
                        title: nextTitle,
                        activityType: nextType,
                      }
                    : undefined
                ),
              scheduleNext
                ? 'Follow-up completed & next reminder scheduled'
                : 'Follow-up marked completed'
            );
            setCompleting(null);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium mb-1">
              Conversation Notes / Outcome
            </label>
            <textarea
              rows={3}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Summarize client response, pricing feedback, or agreed action..."
              className="w-full p-2.5 text-xs border border-[#E5E4DA] rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-[#E5E4DA] space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#064E3B] cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNext}
                onChange={(e) => setScheduleNext(e.target.checked)}
                className="w-4 h-4 accent-[#064E3B]"
              />
              Schedule next follow-up automatically
            </label>

            {scheduleNext && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F1F0E8]/50 p-3.5 rounded-xl border border-[#E5E4DA]">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium mb-1">
                    Next Task Title
                  </label>
                  <input
                    type="text"
                    required
                    value={nextTitle}
                    onChange={(e) => setNextTitle(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Next Date</label>
                  <input
                    type="date"
                    required
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Activity</label>
                  <select
                    value={nextType}
                    onChange={(e) =>
                      setNextType(e.target.value as FollowUpActivityType)
                    }
                    className="w-full h-8 px-2 text-xs bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg"
                  >
                    <option value="Call">Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Site Visit">Site Visit</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCompleting(null)}
              className="px-4 py-2 text-xs rounded-lg border border-[#E5E4DA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#064E3B] text-[#FFFFFF] cursor-pointer"
            >
              Complete Follow-up
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
