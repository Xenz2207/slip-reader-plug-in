import { useState } from 'react';
import { formatBaht, formatShortDay } from '../lib/format';

interface DayPoint {
  date: string;
  revenue: number;
  verifiedCount: number;
  alertCount: number;
}

interface RevenueChartProps {
  series: DayPoint[];
  days: number;
  onChangeDays: (days: number) => void;
}

export function RevenueChart({ series, days, onChangeDays }: RevenueChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxRev = Math.max(100, ...series.map((s) => s.revenue));
  const totalPeriod = series.reduce((sum, s) => sum + s.revenue, 0);
  const totalSlips = series.reduce((sum, s) => sum + s.verifiedCount, 0);

  const activePoint = hoveredIdx !== null ? series[hoveredIdx] : null;

  return (
    <section className="ledger-surface rounded-[16px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[16px] font-semibold text-[#10201A]">แนวโน้มรายรับรายวัน</h2>
          <p className="text-[13px] text-[#52645D] mt-0.5 tabular-nums">
            รวมช่วง {days} วัน:{' '}
            <span className="font-semibold text-[#0D6B4E]">{formatBaht(totalPeriod)} บาท</span>{' '}
            ({totalSlips.toLocaleString('th-TH')} สลิปผ่าน)
          </p>
        </div>

        <div className="inline-flex rounded-[10px] bg-[#F4F6F5] p-1 border border-[#E3E8E5]">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDays(d)}
              className={`btn-press px-2.5 py-1 rounded-[6px] text-[12.5px] font-medium cursor-pointer ${
                days === d
                  ? 'bg-white text-[#10201A] shadow-xs'
                  : 'text-[#52645D] hover:text-[#10201A]'
              }`}
            >
              {d} วัน
            </button>
          ))}
        </div>
      </div>

      {/* Hover readout strip (fixed height so layout never jumps) */}
      <div className="h-7 mb-2 flex items-center justify-between text-[12.5px] text-[#52645D]">
        {activePoint ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[#10201A]">{formatShortDay(activePoint.date)}</span>
            <span className="tabular-nums font-semibold text-[#0D6B4E]">
              {formatBaht(activePoint.revenue)} บาท
            </span>
            <span className="tabular-nums">ผ่าน {activePoint.verifiedCount} ใบ</span>
            {activePoint.alertCount > 0 && (
              <span className="tabular-nums text-[#C82829]">แจ้งเตือน {activePoint.alertCount} ใบ</span>
            )}
          </div>
        ) : (
          <span>วางเมาส์บนแท่งกราฟเพื่อดูยอดโอนของแต่ละวัน</span>
        )}
      </div>

      <div className="relative h-[190px] w-full flex items-end gap-1.5 sm:gap-2 pt-4 pb-6 border-b border-[#E3E8E5]">
        {/* Horizontal reference lines */}
        <div className="pointer-events-none absolute inset-x-0 top-4 bottom-6 flex flex-col justify-between">
          {[1, 0.5, 0].map((ratio) => (
            <div key={ratio} className="border-t border-dashed border-[#E3E8E5] relative">
              {ratio > 0 && (
                <span className="absolute -top-2.5 right-0 text-[10.5px] text-[#64756E] bg-white/90 px-1 tabular-nums">
                  {formatBaht(maxRev * ratio)}
                </span>
              )}
            </div>
          ))}
        </div>

        {series.map((pt, idx) => {
          const pct = pt.revenue > 0 ? Math.max(6, Math.round((pt.revenue / maxRev) * 100)) : 2;
          const isHovered = hoveredIdx === idx;
          const showLabel =
            series.length <= 10 || idx === 0 || idx === series.length - 1 || idx % Math.ceil(series.length / 7) === 0;

          return (
            <div
              key={pt.date}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="relative z-10 flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
            >
              <div className="w-full h-full flex items-end justify-center px-0.5">
                <div
                  style={{ height: `${pct}%` }}
                  className={`w-full max-w-[34px] rounded-t-[6px] transition-[background-color,height] duration-150 ${
                    pt.revenue === 0
                      ? 'bg-[#E3E8E5]'
                      : isHovered
                        ? 'bg-[#09523B]'
                        : 'bg-[#0D6B4E]'
                  }`}
                />
              </div>
              {showLabel && (
                <span className="absolute -bottom-5 text-[11px] text-[#64756E] whitespace-nowrap tabular-nums">
                  {formatShortDay(pt.date)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
