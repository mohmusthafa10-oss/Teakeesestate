export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function offsetDaysISO(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  if (!Number.isFinite(amount)) return `${symbol}0`;
  if (symbol === '₹') {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2).replace(/\.00$/, '')} L`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${symbol}${amount.toLocaleString('en-US')}`;
}

export function formatFullCurrency(amount: number, symbol = '₹'): string {
  if (!Number.isFinite(amount)) return `${symbol}0`;
  if (symbol === '₹') {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${symbol}${amount.toLocaleString('en-US')}`;
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(isoStr?: string): string {
  if (!isoStr) return '—';
  const parsed = new Date(isoStr);
  if (Number.isNaN(parsed.getTime())) return isoStr;
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateDaysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const clean = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr.slice(0, 10);
  const start = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatDaysListed(listedDate?: string): string {
  if (!listedDate) return 'Listed today';
  const days = calculateDaysSince(listedDate);
  if (days === 0) return 'Listed today';
  if (days === 1) return 'Listed 1 day ago';
  return `Listed ${days} days ago`;
}

export function formatDaysAgo(dateStr?: string): string {
  if (!dateStr) return 'Never contacted';
  const days = calculateDaysSince(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function calculateROI(
  investmentAmount: number,
  additionalExpenses: number,
  returnAmount: number
): { totalInvestment: number; netProfit: number; roiPct: number } {
  const totalInvestment = (investmentAmount || 0) + (additionalExpenses || 0);
  const netProfit = (returnAmount || 0) - totalInvestment;
  const roiPct = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  return { totalInvestment, netProfit, roiPct };
}

export function getStatusTone(status: string): string {
  switch (status) {
    case 'Available':
    case 'Qualified':
    case 'Converted':
    case 'Completed':
    case 'Closed':
    case 'Active':
    case 'Active Listing':
    case 'High':
    case 'Collected':
    case 'Adjusted':
      return 'bg-[#E4EBE0] text-[#064E3B] border-[#A8B9A2]/60';
    case 'Under Negotiation':
    case 'Reserved':
    case 'Negotiation':
    case 'Booking':
    case 'Site Visit':
    case 'Property Shared':
    case 'Booked':
    case 'Pending':
    case 'Scheduled':
    case 'Medium':
    case 'Rescheduled':
    case 'Partially Refunded':
      return 'bg-[#D9AC57]/15 text-[#7A5612] border-[#D9AC57]/40';
    case 'Sold':
    case 'Rented':
    case 'Occupied':
    case 'Rented / Occupied':
    case 'Managed / Operating':
    case 'Contacted':
    case 'Interested':
      return 'bg-[#176B50]/12 text-[#064E3B] border-[#176B50]/30';
    case 'Lost':
    case 'Cancelled':
    case 'Overdue':
    case 'Maintenance':
    case 'Rejected':
    case 'Declined':
    case 'Refunded':
      return 'bg-[#C96C60]/15 text-[#8D382E] border-[#C96C60]/40';
    case 'New':
    case 'On Hold':
    case 'Inactive':
    case 'Vacant':
    default:
      return 'bg-[#F1F0E8] text-[#56594F] border-[#E5E4DA]';
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}-${Date.now().toString(36).slice(-4)}`;
}
