import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { calculateROI, formatCurrency, formatDate } from '../utils/formatters';

type ReportKey =
  | 'property-inventory'
  | 'properties-by-type'
  | 'properties-by-location'
  | 'available-vs-sold'
  | 'seller-report'
  | 'lead-report'
  | 'lead-conversion'
  | 'follow-up-performance'
  | 'site-visit-report'
  | 'sales-report'
  | 'commission-report'
  | 'investment-roi'
  | 'rental-income'
  | 'agent-performance';

const REPORT_MENU: { key: ReportKey; label: string }[] = [
  { key: 'property-inventory', label: 'Property Inventory' },
  { key: 'properties-by-type', label: 'Properties by Type' },
  { key: 'properties-by-location', label: 'Properties by Location' },
  { key: 'available-vs-sold', label: 'Available vs Sold' },
  { key: 'seller-report', label: 'Seller Report' },
  { key: 'lead-report', label: 'Lead Report' },
  { key: 'lead-conversion', label: 'Lead Conversion' },
  { key: 'follow-up-performance', label: 'Follow-up Performance' },
  { key: 'site-visit-report', label: 'Site Visit Report' },
  { key: 'sales-report', label: 'Sales Report' },
  { key: 'commission-report', label: 'Commission Report' },
  { key: 'investment-roi', label: 'Investment ROI' },
  { key: 'rental-income', label: 'Rental Income' },
  { key: 'agent-performance', label: 'Agent Performance' },
];

export const ReportsPage: React.FC = () => {
  const { db, notify, withLoader } = useCRM();
  const currency = db.settings.currencySymbol;

  const [activeReport, setActiveReport] = useState<ReportKey>('property-inventory');
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-12-31');

  const inRange = (dateStr: string) => {
    if (!dateStr) return true;
    const clean = dateStr.slice(0, 10);
    return (!dateFrom || clean >= dateFrom) && (!dateTo || clean <= dateTo);
  };

  const reportData = useMemo((): {
    title: string;
    subtitle: string;
    headers: string[];
    rows: (string | number)[][];
    chartBars?: { label: string; value: number; display: string }[];
  } => {
    const propsInRange = db.properties.filter((p) => inRange(p.addedDate));
    const leadsInRange = db.leads.filter((l) => inRange(l.created_at));
    const dealsInRange = db.deals.filter((d) => inRange(d.dealDate));

    switch (activeReport) {
      case 'property-inventory':
        return {
          title: 'Property Inventory Report',
          subtitle: `${propsInRange.length} properties registered within date range`,
          headers: ['Code', 'Title', 'Type', 'Location', 'Area', 'Asking Price', 'Status', 'Added'],
          rows: propsInRange.map((p) => [
            p.code,
            p.title,
            p.type,
            p.location,
            p.areaDisplay,
            formatCurrency(p.askingPrice, currency),
            p.status,
            formatDate(p.addedDate),
          ]),
        };

      case 'properties-by-type': {
        const groups = db.settings.propertyCategories.map((cat) => {
          const items = propsInRange.filter((p) => p.type === cat);
          const totalVal = items.reduce((s, p) => s + p.askingPrice, 0);
          return { cat, count: items.length, totalVal };
        });
        return {
          title: 'Properties by Type',
          subtitle: 'Portfolio count and total valuation grouped by property category',
          headers: ['Property Type', 'Count', 'Available', 'Total Portfolio Value'],
          rows: groups.map((g) => [
            g.cat,
            g.count,
            propsInRange.filter((p) => p.type === g.cat && p.status === 'Available').length,
            formatCurrency(g.totalVal, currency),
          ]),
          chartBars: groups.map((g) => ({
            label: g.cat,
            value: g.count,
            display: `${g.count} listings`,
          })),
        };
      }

      case 'properties-by-location': {
        const map = new Map<string, { count: number; value: number }>();
        propsInRange.forEach((p) => {
          const loc = p.location.split(',')[0].trim();
          const cur = map.get(loc) || { count: 0, value: 0 };
          map.set(loc, { count: cur.count + 1, value: cur.value + p.askingPrice });
        });
        const entries = Array.from(map.entries());
        return {
          title: 'Properties by Location',
          subtitle: 'Geographic distribution across active towns & micro-markets',
          headers: ['Location', 'Properties', 'Total Value'],
          rows: entries.map(([loc, d]) => [
            loc,
            d.count,
            formatCurrency(d.value, currency),
          ]),
          chartBars: entries.map(([loc, d]) => ({
            label: loc,
            value: d.count,
            display: `${d.count} (${formatCurrency(d.value, currency)})`,
          })),
        };
      }

      case 'available-vs-sold': {
        const statuses = ['Available', 'Under Negotiation', 'Reserved', 'Sold', 'Rented', 'Inactive'];
        const counts = statuses.map((s) => ({
          status: s,
          count: propsInRange.filter((p) => p.status === s).length,
          val: propsInRange
            .filter((p) => p.status === s)
            .reduce((acc, p) => acc + p.askingPrice, 0),
        }));
        return {
          title: 'Available vs Sold Breakdown',
          subtitle: 'Inventory absorption and current availability status',
          headers: ['Status', 'Properties', 'Share %', 'Total Value'],
          rows: counts.map((c) => [
            c.status,
            c.count,
            `${propsInRange.length > 0 ? Math.round((c.count / propsInRange.length) * 100) : 0}%`,
            formatCurrency(c.val, currency),
          ]),
          chartBars: counts.map((c) => ({
            label: c.status,
            value: c.count,
            display: `${c.count} properties`,
          })),
        };
      }

      case 'seller-report':
        return {
          title: 'Seller Portfolio Report',
          subtitle: `${db.sellers.length} registered sellers and linked inventory counts`,
          headers: ['Code', 'Seller Name', 'Phone', 'Total Properties', 'Active', 'Sold', 'Agent'],
          rows: db.sellers.map((s) => {
            const props = db.properties.filter((p) => p.sellerId === s.id);
            return [
              s.code,
              s.name,
              s.phone,
              props.length,
              props.filter((p) => p.status === 'Available').length,
              props.filter((p) => p.status === 'Sold').length,
              db.users.find((u) => u.id === s.assignedAgentId)?.name || '—',
            ];
          }),
        };

      case 'lead-report':
        return {
          title: 'Buyer Lead Report',
          subtitle: `${leadsInRange.length} buyer leads registered within range`,
          headers: ['Lead ID', 'Customer', 'Location', 'Type', 'Max Budget', 'Status', 'Agent'],
          rows: leadsInRange.map((l) => [
            l.code,
            l.name,
            l.preferredLocation || 'Any',
            l.propertyType,
            formatCurrency(l.maxBudget, currency),
            l.status,
            db.users.find((u) => u.id === l.assignedAgentId)?.name || '—',
          ]),
        };

      case 'lead-conversion': {
        const stages = db.settings.leadStatuses.map((st) => ({
          stage: st,
          count: leadsInRange.filter((l) => l.status === st).length,
        }));
        return {
          title: 'Lead Conversion Funnel',
          subtitle: 'Stage-by-stage buyer conversion performance',
          headers: ['Pipeline Stage', 'Lead Count', 'Share of Total'],
          rows: stages.map((s) => [
            s.stage,
            s.count,
            `${leadsInRange.length > 0 ? Math.round((s.count / leadsInRange.length) * 100) : 0}%`,
          ]),
          chartBars: stages.map((s) => ({
            label: s.stage,
            value: s.count,
            display: `${s.count} leads`,
          })),
        };
      }

      case 'follow-up-performance': {
        const fups = db.followUps.filter((f) => inRange(f.date));
        const rows = db.users.map((u) => {
          const mine = fups.filter((f) => f.assignedAgentId === u.id);
          const done = mine.filter((f) => f.status === 'Completed').length;
          return {
            name: u.name,
            total: mine.length,
            done,
            pending: mine.length - done,
            rate: mine.length > 0 ? Math.round((done / mine.length) * 100) : 0,
          };
        });
        return {
          title: 'Follow-up Performance Report',
          subtitle: 'Completion rate across advisors',
          headers: ['Advisor', 'Assigned Tasks', 'Completed', 'Pending', 'Completion Rate'],
          rows: rows.map((r) => [r.name, r.total, r.done, r.pending, `${r.rate}%`]),
          chartBars: rows.map((r) => ({
            label: r.name,
            value: r.rate,
            display: `${r.rate}% (${r.done}/${r.total})`,
          })),
        };
      }

      case 'site-visit-report': {
        const visits = db.siteVisits.filter((v) => inRange(v.scheduledDate));
        return {
          title: 'Site Visit Report',
          subtitle: `${visits.length} property inspections logged`,
          headers: ['Date', 'Time', 'Property', 'Buyer Lead', 'Agent', 'Status'],
          rows: visits.map((v) => [
            formatDate(v.scheduledDate),
            v.scheduledTime,
            db.properties.find((p) => p.id === v.propertyId)?.title || '—',
            db.leads.find((l) => l.id === v.leadId)?.name || '—',
            db.users.find((u) => u.id === v.agentId)?.name || '—',
            v.status,
          ]),
        };
      }

      case 'sales-report':
        return {
          title: 'Sales & Deal Transactions Report',
          subtitle: `${dealsInRange.length} deals tracked within selected period`,
          headers: ['Deal Code', 'Type', 'Property', 'Buyer', 'Agreed Price', 'Status', 'Date'],
          rows: dealsInRange.map((d) => [
            d.code,
            d.dealType,
            db.properties.find((p) => p.id === d.propertyId)?.title || '—',
            db.leads.find((l) => l.id === d.leadId)?.name || '—',
            formatCurrency(d.agreedPrice, currency),
            d.status,
            formatDate(d.dealDate),
          ]),
        };

      case 'commission-report': {
        const closed = dealsInRange.filter((d) => d.status === 'Closed');
        return {
          title: 'Commission Revenue Report',
          subtitle: `Earned vs projected brokerage commission across ${dealsInRange.length} deals`,
          headers: ['Deal Code', 'Property', 'Agreed Price', 'Rate %', 'Commission', 'Status', 'Agent'],
          rows: dealsInRange.map((d) => [
            d.code,
            db.properties.find((p) => p.id === d.propertyId)?.title || '—',
            formatCurrency(d.agreedPrice, currency),
            `${d.commissionRate}%`,
            formatCurrency(d.commissionAmount, currency),
            d.status,
            db.users.find((u) => u.id === d.assignedAgentId)?.name || '—',
          ]),
          chartBars: [
            {
              label: 'Earned (Closed)',
              value: closed.reduce((s, d) => s + d.commissionAmount, 0),
              display: formatCurrency(
                closed.reduce((s, d) => s + d.commissionAmount, 0),
                currency
              ),
            },
            {
              label: 'Pipeline Projected',
              value: dealsInRange
                .filter((d) => !['Closed', 'Cancelled', 'Lost'].includes(d.status))
                .reduce((s, d) => s + d.commissionAmount, 0),
              display: formatCurrency(
                dealsInRange
                  .filter((d) => !['Closed', 'Cancelled', 'Lost'].includes(d.status))
                  .reduce((s, d) => s + d.commissionAmount, 0),
                currency
              ),
            },
          ],
        };
      }

      case 'investment-roi':
        return {
          title: 'Investment ROI Report',
          subtitle: 'Capital outlay, expenses, and calculated net ROI percentage',
          headers: ['Code', 'Property', 'Investor', 'Total Investment', 'Return Basis', 'Net Profit', 'ROI %', 'Status'],
          rows: db.investments.map((inv) => {
            const basis = inv.actualReturn > 0 ? inv.actualReturn : inv.expectedReturn;
            const roi = calculateROI(inv.investmentAmount, inv.additionalExpenses, basis);
            return [
              inv.code,
              db.properties.find((p) => p.id === inv.propertyId)?.title || '—',
              db.investors.find((i) => i.id === inv.investorId)?.name || '—',
              formatCurrency(roi.totalInvestment, currency),
              formatCurrency(basis, currency),
              formatCurrency(roi.netProfit, currency),
              `${roi.roiPct.toFixed(1)}%`,
              inv.status,
            ];
          }),
        };

      case 'rental-income':
        return {
          title: 'Stay & Rental Income Report',
          subtitle: 'Gross rental collections vs logged maintenance expenses',
          headers: ['Booking', 'Property', 'Type', 'Tenant / Guest', 'Income', 'Expenses', 'Net Income', 'Status'],
          rows: db.rentalBookings.map((b) => {
            const exp = db.expenses
              .filter((e) => e.entityType === 'Rental' && e.entityId === b.id)
              .reduce((s, e) => s + e.amount, 0);
            return [
              b.code,
              db.properties.find((p) => p.id === b.propertyId)?.title || '—',
              b.rentalType,
              db.tenants.find((t) => t.id === b.tenantId)?.name || 'Vacant',
              formatCurrency(b.incomeReceived, currency),
              formatCurrency(exp, currency),
              formatCurrency(b.incomeReceived - exp, currency),
              b.status,
            ];
          }),
        };

      case 'agent-performance': {
        const rows = db.users.map((u) => {
          const props = db.properties.filter((p) => p.assignedAgentId === u.id).length;
          const leads = db.leads.filter((l) => l.assignedAgentId === u.id).length;
          const closed = db.deals.filter(
            (d) => d.assignedAgentId === u.id && d.status === 'Closed'
          );
          const comm = closed.reduce((s, d) => s + d.commissionAmount, 0);
          return { name: u.name, role: u.role, props, leads, closedCount: closed.length, comm };
        });
        return {
          title: 'Agent Performance Scorecard',
          subtitle: 'Listings, leads, closed transactions, and commission generated per advisor',
          headers: ['Advisor', 'Role', 'Assigned Properties', 'Assigned Leads', 'Closed Deals', 'Commission Generated'],
          rows: rows.map((r) => [
            r.name,
            r.role,
            r.props,
            r.leads,
            r.closedCount,
            formatCurrency(r.comm, currency),
          ]),
          chartBars: rows.map((r) => ({
            label: r.name,
            value: r.comm,
            display: formatCurrency(r.comm, currency),
          })),
        };
      }
    }
  }, [activeReport, db, currency, dateFrom, dateTo]);

  const exportToExcel = async () => {
    await withLoader(() => {
      const esc = (v: string | number) =>
        String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const headerXml = `<Row>${reportData.headers
        .map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`)
        .join('')}</Row>`;
      const rowsXml = reportData.rows
        .map(
          (row) =>
            `<Row>${row
              .map((cell) => {
                const isNum = typeof cell === 'number';
                return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(
                  cell
                )}</Data></Cell>`;
              })
              .join('')}</Row>`
        )
        .join('');

      const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Report">
  <Table>
   <Row><Cell><Data ss:Type="String">${esc(reportData.title)}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">${esc(reportData.subtitle)}</Data></Cell></Row>
   ${headerXml}
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

      const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeReport}_${dateFrom}_to_${dateTo}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    notify(`Exported ${reportData.title} to Excel`);
  };

  const exportToPDF = () => {
    window.print();
    notify('Print / Save as PDF dialog opened', 'info');
  };

  const maxBar = reportData.chartBars
    ? Math.max(1, ...reportData.chartBars.map((b) => b.value))
    : 1;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#20251F]">
            Agency Reports & Exports
          </h1>
          <p className="text-xs text-[#77796F] mt-1">
            Live analytical reports derived directly from CRM records. Filter by date range and export to Excel or PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#FFFFFF] border border-[#E5E4DA] rounded-lg px-2.5 h-9 text-xs">
            <span className="text-[#77796F]">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent focus:outline-none font-mono text-[11px]"
            />
            <span className="text-[#77796F]">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent focus:outline-none font-mono text-[11px]"
            />
          </div>
          <button
            type="button"
            onClick={exportToExcel}
            className="h-9 px-3.5 rounded-lg border border-[#E5E4DA] bg-[#FFFFFF] hover:bg-[#E4EBE0]/60 text-xs font-medium text-[#20251F] flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#064E3B]" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={exportToPDF}
            className="h-9 px-3.5 rounded-lg bg-[#064E3B] hover:bg-[#176B50] text-xs font-medium text-[#FFFFFF] flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Report Picker */}
        <div className="no-print lg:col-span-3 bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-3 space-y-1">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold text-[#77796F]">
            Available Reports (14)
          </p>
          {REPORT_MENU.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveReport(item.key)}
              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-colors cursor-pointer ${
                activeReport === item.key
                  ? 'bg-[#064E3B] text-[#FFFFFF]'
                  : 'text-[#20251F] hover:bg-[#F1F0E8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Right Report Output */}
        <div className="lg:col-span-9 space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E5E4DA] rounded-2xl p-6 space-y-4">
            <div className="border-b border-[#E5E4DA] pb-4 flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-[#77796F]">
                  {db.settings.agencyName} · Period {formatDate(dateFrom)} – {formatDate(dateTo)}
                </p>
                <h2 className="text-lg font-semibold text-[#20251F] mt-0.5">
                  {reportData.title}
                </h2>
                <p className="text-xs text-[#77796F]">{reportData.subtitle}</p>
              </div>
            </div>

            {/* Optional Visual Chart */}
            {reportData.chartBars && reportData.chartBars.length > 0 && (
              <div className="space-y-2.5 pb-4 border-b border-[#E5E4DA]">
                {reportData.chartBars.map((b) => (
                  <div key={b.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#20251F]">{b.label}</span>
                      <span className="font-mono tabular-nums text-[#064E3B] font-semibold">
                        {b.display}
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#F1F0E8] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.max(4, Math.round((b.value / maxBar) * 100))}%` }}
                        className="h-full bg-[#064E3B] rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E4DA] bg-[#F1F0E8]/50 text-[11px] font-semibold text-[#77796F]">
                    {reportData.headers.map((h) => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DA] text-xs">
                  {reportData.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={reportData.headers.length}
                        className="py-8 text-center text-[#77796F]"
                      >
                        No records found for this date range.
                      </td>
                    </tr>
                  ) : (
                    reportData.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#F1F0E8]/30">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-2.5 px-3 tabular-nums whitespace-nowrap"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
