import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Building, TriangleAlert as AlertTriangle, ShieldAlert, RefreshCw, MapPin, Clock, CircleCheck as CheckCircle2, Wrench, Server } from 'lucide-react';
import { RackData } from '../types';

interface DashboardPageProps {
  racks: RackData[];
  maintenanceRacks: Set<string>;
  userHasAccessToSite: (site: string) => boolean;
  refreshData: () => void;
  onOpenAlertas?: () => void;
  loading?: boolean;
}

function parseSite(raw: string): { parent: string; cpd: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { parent: 'Sin Sitio', cpd: 'Sin CPD' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { parent: parts[0], cpd: parts[0] };
  return { parent: parts[0], cpd: parts.slice(1).join(' ') };
}

function parseSala(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Sin Sala';
  const parts = trimmed.split(/\s+/);
  return parts[0];
}

interface DcSummary {
  country: string;
  site: string;
  parentSite: string;
  cpdName: string;
  dc: string;
  salaName: string;
  totalRacks: number;
  totalPdus: number;
  criticalPdus: number;
  warningPdus: number;
  normalPdus: number;
  maintenanceRacks: number;
  criticalRacks: number;
  warningRacks: number;
  breakdown: {
    critical: { amperage: number; temperature: number; humidity: number; voltage: number };
    warning: { amperage: number; temperature: number; humidity: number; voltage: number };
  };
}

const AUTO_REFRESH_MS = 60_000;

export default function DashboardPage({
  racks,
  maintenanceRacks,
  userHasAccessToSite,
  refreshData,
  onOpenAlertas,
  loading = false,
}: DashboardPageProps) {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(60);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      refreshData();
      setLastRefresh(new Date());
      setSecondsUntilRefresh(60);
    }, AUTO_REFRESH_MS);

    const countdownInterval = setInterval(() => {
      setSecondsUntilRefresh(prev => (prev <= 1 ? 60 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, [refreshData]);

  useEffect(() => {
    if (!loading) {
      setLastRefresh(new Date());
    }
  }, [loading]);

  const dcSummaries = useMemo<DcSummary[]>(() => {
    const map = new Map<string, DcSummary>();

    racks.forEach(pdu => {
      const site = pdu.site || 'Sin Sitio';
      if (!userHasAccessToSite(site)) return;

      const country = pdu.country || 'Sin Pais';
      const dc = pdu.dc || 'Sin Sala';
      const key = `${country}||${site}||${dc}`;

      if (!map.has(key)) {
        const { parent, cpd: cpdName } = parseSite(site);
        const salaName = parseSala(dc);
        map.set(key, {
          country,
          site,
          parentSite: parent,
          cpdName,
          dc,
          salaName,
          totalRacks: 0,
          totalPdus: 0,
          criticalPdus: 0,
          warningPdus: 0,
          normalPdus: 0,
          maintenanceRacks: 0,
          criticalRacks: 0,
          warningRacks: 0,
          breakdown: {
            critical: { amperage: 0, temperature: 0, humidity: 0, voltage: 0 },
            warning: { amperage: 0, temperature: 0, humidity: 0, voltage: 0 },
          },
        });
      }

      const summary = map.get(key)!;
      const rackName = String(pdu.name || '').trim();
      const rackId = String(pdu.rackId || pdu.id || '').trim();
      const isInMaintenance = (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));

      summary.totalPdus += 1;

      if (isInMaintenance) {
        return;
      }

      if (pdu.status === 'critical') summary.criticalPdus += 1;
      else if (pdu.status === 'warning') summary.warningPdus += 1;
      else summary.normalPdus += 1;

      if (pdu.reasons && pdu.reasons.length > 0) {
        pdu.reasons.forEach(reason => {
          if (reason.startsWith('critical_')) {
            if (reason.includes('amperage')) summary.breakdown.critical.amperage += 1;
            if (reason.includes('temperature')) summary.breakdown.critical.temperature += 1;
            if (reason.includes('humidity')) summary.breakdown.critical.humidity += 1;
            if (reason.includes('voltage')) summary.breakdown.critical.voltage += 1;
          } else if (reason.startsWith('warning_')) {
            if (reason.includes('amperage')) summary.breakdown.warning.amperage += 1;
            if (reason.includes('temperature')) summary.breakdown.warning.temperature += 1;
            if (reason.includes('humidity')) summary.breakdown.warning.humidity += 1;
            if (reason.includes('voltage')) summary.breakdown.warning.voltage += 1;
          }
        });
      }
    });

    const rackStatusMap = new Map<string, { dcKey: string; worst: 'normal' | 'warning' | 'critical'; inMaintenance: boolean }>();

    racks.forEach(pdu => {
      const site = pdu.site || 'Sin Sitio';
      if (!userHasAccessToSite(site)) return;

      const country = pdu.country || 'Sin Pais';
      const dc = pdu.dc || 'Sin Sala';
      const dcKey = `${country}||${site}||${dc}`;
      const rackIdKey = `${dcKey}||${pdu.rackId || pdu.id}`;

      const rackName = String(pdu.name || '').trim();
      const rackId = String(pdu.rackId || pdu.id || '').trim();
      const isInMaintenance = (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));

      const existing = rackStatusMap.get(rackIdKey);
      let worst: 'normal' | 'warning' | 'critical' = existing?.worst || 'normal';
      if (pdu.status === 'critical') worst = 'critical';
      else if (pdu.status === 'warning' && worst !== 'critical') worst = 'warning';

      rackStatusMap.set(rackIdKey, { dcKey, worst, inMaintenance: existing?.inMaintenance || isInMaintenance });
    });

    rackStatusMap.forEach(({ dcKey, worst, inMaintenance }) => {
      const summary = map.get(dcKey);
      if (!summary) return;
      summary.totalRacks += 1;
      if (inMaintenance) {
        summary.maintenanceRacks += 1;
        return;
      }
      if (worst === 'critical') summary.criticalRacks += 1;
      else if (worst === 'warning') summary.warningRacks += 1;
    });

    const items = Array.from(map.values());

    items.sort((a, b) => {
      if (b.criticalPdus !== a.criticalPdus) return b.criticalPdus - a.criticalPdus;
      if (b.warningPdus !== a.warningPdus) return b.warningPdus - a.warningPdus;
      const siteCmp = a.site.localeCompare(b.site);
      if (siteCmp !== 0) return siteCmp;
      return a.dc.localeCompare(b.dc);
    });

    return items;
  }, [racks, maintenanceRacks, userHasAccessToSite]);

  const totals = useMemo(() => {
    return dcSummaries.reduce(
      (acc, s) => ({
        dcs: acc.dcs + 1,
        critical: acc.critical + s.criticalPdus,
        warning: acc.warning + s.warningPdus,
        criticalRacks: acc.criticalRacks + s.criticalRacks,
        warningRacks: acc.warningRacks + s.warningRacks,
        maintenance: acc.maintenance + s.maintenanceRacks,
        racks: acc.racks + s.totalRacks,
        pdus: acc.pdus + s.totalPdus,
      }),
      { dcs: 0, critical: 0, warning: 0, criticalRacks: 0, warningRacks: 0, maintenance: 0, racks: 0, pdus: 0 }
    );
  }, [dcSummaries]);

  interface CpdGroup {
    country: string;
    site: string;
    cpdName: string;
    salas: DcSummary[];
    criticalCount: number;
    warningCount: number;
  }

  interface SiteGroup {
    country: string;
    parentSite: string;
    cpds: CpdGroup[];
    criticalCount: number;
    warningCount: number;
    totalSalas: number;
  }

  const siteGroups = useMemo<SiteGroup[]>(() => {
    const siteMap = new Map<string, SiteGroup>();

    dcSummaries.forEach(s => {
      const siteKey = `${s.country}||${s.parentSite}`;
      if (!siteMap.has(siteKey)) {
        siteMap.set(siteKey, {
          country: s.country,
          parentSite: s.parentSite,
          cpds: [],
          criticalCount: 0,
          warningCount: 0,
          totalSalas: 0,
        });
      }
      const sg = siteMap.get(siteKey)!;

      const cpdKey = `${s.country}||${s.site}`;
      let cpd = sg.cpds.find(c => `${c.country}||${c.site}` === cpdKey);
      if (!cpd) {
        cpd = {
          country: s.country,
          site: s.site,
          cpdName: s.cpdName,
          salas: [],
          criticalCount: 0,
          warningCount: 0,
        };
        sg.cpds.push(cpd);
      }
      cpd.salas.push(s);
      if (s.criticalPdus > 0) {
        cpd.criticalCount += 1;
        sg.criticalCount += 1;
      } else if (s.warningPdus > 0) {
        cpd.warningCount += 1;
        sg.warningCount += 1;
      }
      sg.totalSalas += 1;
    });

    const groups = Array.from(siteMap.values());
    groups.forEach(sg => {
      sg.cpds.forEach(cpd => {
        cpd.salas.sort((a, b) => {
          if (b.criticalPdus !== a.criticalPdus) return b.criticalPdus - a.criticalPdus;
          if (b.warningPdus !== a.warningPdus) return b.warningPdus - a.warningPdus;
          return a.salaName.localeCompare(b.salaName, undefined, { numeric: true });
        });
      });
      sg.cpds.sort((a, b) => {
        if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
        if (b.warningCount !== a.warningCount) return b.warningCount - a.warningCount;
        return a.cpdName.localeCompare(b.cpdName);
      });
    });

    groups.sort((a, b) => {
      if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
      if (b.warningCount !== a.warningCount) return b.warningCount - a.warningCount;
      const countryCmp = a.country.localeCompare(b.country);
      if (countryCmp !== 0) return countryCmp;
      return a.parentSite.localeCompare(b.parentSite);
    });

    return groups;
  }, [dcSummaries]);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const handleManualRefresh = () => {
    refreshData();
    setLastRefresh(new Date());
    setSecondsUntilRefresh(60);
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl shadow-md">
              <LayoutDashboard className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboard de Monitoreo</h1>
              <p className="text-slate-300 text-sm mt-0.5">
                Vision general de alertas criticas y advertencias por sala de CPD
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-700/60 px-3 py-2 rounded-lg border border-slate-600">
              <Clock className="h-4 w-4 text-slate-300" />
              <div className="text-xs">
                <div className="text-slate-300">Ultima actualizacion</div>
                <div className="font-semibold text-white">{formatTime(lastRefresh)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-blue-600/20 px-3 py-2 rounded-lg border border-blue-500/40">
              <RefreshCw className={`h-4 w-4 text-blue-300 ${loading ? 'animate-spin' : ''}`} />
              <div className="text-xs">
                <div className="text-blue-200">Proximo refresco</div>
                <div className="font-semibold text-white">{secondsUntilRefresh}s</div>
              </div>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                loading
                  ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                  : 'bg-white text-slate-900 hover:bg-slate-100 shadow'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refrescar
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Salas Monitoreadas"
          value={totals.dcs}
          icon={<Building className="h-5 w-5" />}
          accent="slate"
        />
        <KpiCard
          label="PDUs Criticos"
          value={totals.critical}
          sub={`${totals.criticalRacks} rack${totals.criticalRacks !== 1 ? 's' : ''}`}
          icon={<ShieldAlert className="h-5 w-5" />}
          accent="red"
          onClick={onOpenAlertas}
        />
        <KpiCard
          label="PDUs Advertencia"
          value={totals.warning}
          sub={`${totals.warningRacks} rack${totals.warningRacks !== 1 ? 's' : ''}`}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="amber"
          onClick={onOpenAlertas}
        />
        <KpiCard
          label="Mantenimiento"
          value={totals.maintenance}
          icon={<Wrench className="h-5 w-5" />}
          accent="blue"
        />
        <KpiCard
          label="Racks / PDUs"
          value={`${totals.racks} / ${totals.pdus}`}
          icon={<Server className="h-5 w-5" />}
          accent="emerald"
        />
      </div>

      {/* Rooms Grid */}
      {dcSummaries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-3 text-base font-semibold text-gray-900">Sin salas disponibles</h3>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? 'Cargando datos de monitoreo...' : 'No hay salas con datos para mostrar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {siteGroups.map(siteGroup => (
            <div
              key={`${siteGroup.country}-${siteGroup.parentSite}`}
              className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm p-6"
            >
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2.5 rounded-xl">
                    <Building className="h-6 w-6 text-slate-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      <span className="font-medium">{siteGroup.country}</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                      CPD {siteGroup.parentSite}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {siteGroup.cpds.length} CPD{siteGroup.cpds.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {siteGroup.totalSalas} sala{siteGroup.totalSalas !== 1 ? 's' : ''}
                  </span>
                  {siteGroup.criticalCount > 0 && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                      {siteGroup.criticalCount} critica{siteGroup.criticalCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {siteGroup.warningCount > 0 && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      {siteGroup.warningCount} advertencia{siteGroup.warningCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className={`grid gap-5 ${siteGroup.cpds.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
                {siteGroup.cpds.map(cpd => (
                  <div
                    key={`${cpd.country}-${cpd.site}`}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-slate-600" />
                        <h3 className="text-base font-semibold text-slate-800">
                          CPD {cpd.site}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                          {cpd.salas.length} sala{cpd.salas.length !== 1 ? 's' : ''}
                        </span>
                        {cpd.criticalCount > 0 && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                            {cpd.criticalCount} critica{cpd.criticalCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {cpd.warningCount > 0 && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {cpd.warningCount} advertencia{cpd.warningCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-4 gap-4">
                      {cpd.salas.map(s => {
                        const salaTone: 'critical' | 'warning' | 'normal' =
                          s.criticalPdus > 0 ? 'critical' : s.warningPdus > 0 ? 'warning' : 'normal';
                        return (
                          <DcCard
                            key={`${s.country}-${s.site}-${s.dc}`}
                            summary={s}
                            tone={salaTone}
                            onClick={salaTone !== 'normal' ? onOpenAlertas : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  accent: 'red' | 'amber' | 'emerald' | 'blue' | 'slate';
  onClick?: () => void;
}

function KpiCard({ label, value, sub, icon, accent, onClick }: KpiCardProps) {
  const accents: Record<KpiCardProps['accent'], { bg: string; border: string; iconBg: string; iconText: string; valueText: string }> = {
    red: { bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-100', iconText: 'text-red-600', valueText: 'text-red-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600', valueText: 'text-amber-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', valueText: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600', valueText: 'text-blue-700' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', iconBg: 'bg-slate-100', iconText: 'text-slate-600', valueText: 'text-slate-800' },
  };
  const a = accents[accent];

  const Component: React.ElementType = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`${a.bg} ${a.border} ${onClick ? 'hover:shadow-md cursor-pointer text-left' : ''} border rounded-xl p-4 transition-all w-full`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</div>
          <div className={`text-3xl font-bold mt-1 ${a.valueText}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        <div className={`${a.iconBg} ${a.iconText} p-2 rounded-lg`}>{icon}</div>
      </div>
    </Component>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  tone: 'red' | 'amber' | 'emerald';
  count: number;
  children: React.ReactNode;
}

function Section({ title, description, icon, tone, count, children }: SectionProps) {
  const tones = {
    red: 'border-red-200 bg-red-50/40',
    amber: 'border-amber-200 bg-amber-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
  } as const;
  const badge = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  } as const;

  return (
    <div className={`rounded-xl border-2 ${tones[tone]} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {description && <p className="text-xs text-gray-600">{description}</p>}
          </div>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge[tone]}`}>
          {count} sala{count !== 1 ? 's' : ''}
        </span>
      </div>
      {children}
    </div>
  );
}

interface DcCardProps {
  summary: DcSummary;
  tone: 'critical' | 'warning' | 'normal';
  onClick?: () => void;
}

function DcCard({ summary, tone, onClick }: DcCardProps) {
  const toneConfig = {
    critical: {
      border: 'border-red-300',
      leftBar: 'bg-red-500',
      badge: 'bg-red-600 text-white',
      header: 'text-red-700',
      iconBg: 'bg-red-100 text-red-600',
    },
    warning: {
      border: 'border-amber-300',
      leftBar: 'bg-amber-500',
      badge: 'bg-amber-500 text-white',
      header: 'text-amber-700',
      iconBg: 'bg-amber-100 text-amber-600',
    },
    normal: {
      border: 'border-emerald-200',
      leftBar: 'bg-emerald-500',
      badge: 'bg-emerald-600 text-white',
      header: 'text-emerald-700',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
  } as const;

  const t = toneConfig[tone];
  const totalRackAlerts = summary.criticalRacks + summary.warningRacks;
  const healthPct = summary.totalPdus > 0
    ? Math.round(((summary.totalPdus - summary.criticalPdus - summary.warningPdus) / summary.totalPdus) * 100)
    : 100;

  const cardTint =
    tone === 'critical' ? 'bg-red-50' : tone === 'warning' ? 'bg-amber-50' : 'bg-emerald-50';

  return (
    <div
      onClick={onClick}
      className={`relative ${cardTint} rounded-xl border-2 ${t.border} shadow-sm hover:shadow-md transition-all overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${t.leftBar}`}></div>

      <div className="p-5 pl-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1">
              Sala tecnica
            </div>
            <div className="flex items-center gap-2">
              <Building className={`h-5 w-5 ${tone === 'normal' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : 'text-red-600'}`} />
              <h3 className="text-lg font-bold text-gray-900">{summary.salaName}</h3>
            </div>
          </div>
          {tone !== 'normal' && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.badge}`}>
              {totalRackAlerts} rack{totalRackAlerts !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Metric label="Racks" value={summary.totalRacks} />
          <Metric label="PDUs" value={summary.totalPdus} />
          <Metric label="Salud" value={`${healthPct}%`} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <AlertBlock
            label="Criticos"
            value={summary.criticalPdus}
            breakdown={summary.breakdown.critical}
            accent="red"
            dim={summary.criticalPdus === 0}
          />
          <AlertBlock
            label="Advertencias"
            value={summary.warningPdus}
            breakdown={summary.breakdown.warning}
            accent="amber"
            dim={summary.warningPdus === 0}
          />
        </div>

        {summary.maintenanceRacks > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <Wrench className="h-3.5 w-3.5" />
            <span className="font-medium">{summary.maintenanceRacks} rack{summary.maintenanceRacks !== 1 ? 's' : ''} en mantenimiento</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/80 rounded-lg px-2.5 py-2 text-center border border-gray-200">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="text-base font-bold text-gray-900">{value}</div>
    </div>
  );
}

interface AlertBlockProps {
  label: string;
  value: number;
  breakdown: { amperage: number; temperature: number; humidity: number; voltage: number };
  accent: 'red' | 'amber';
  dim?: boolean;
}

function AlertBlock({ label, value, breakdown, accent, dim }: AlertBlockProps) {
  const accents = {
    red: {
      bg: dim ? 'bg-gray-50' : 'bg-red-50',
      border: dim ? 'border-gray-200' : 'border-red-200',
      text: dim ? 'text-gray-500' : 'text-red-700',
      label: dim ? 'text-gray-500' : 'text-red-600',
      chip: dim ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700',
    },
    amber: {
      bg: dim ? 'bg-gray-50' : 'bg-amber-50',
      border: dim ? 'border-gray-200' : 'border-amber-200',
      text: dim ? 'text-gray-500' : 'text-amber-700',
      label: dim ? 'text-gray-500' : 'text-amber-600',
      chip: dim ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700',
    },
  }[accent];

  const items = [
    { key: 'amp', short: 'A', value: breakdown.amperage, title: 'Amperaje' },
    { key: 'tmp', short: 'T', value: breakdown.temperature, title: 'Temperatura' },
    { key: 'hum', short: 'H', value: breakdown.humidity, title: 'Humedad' },
    { key: 'vol', short: 'V', value: breakdown.voltage, title: 'Voltaje' },
  ];

  return (
    <div className={`rounded-lg border ${accents.bg} ${accents.border} px-3 py-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] uppercase tracking-wide font-bold ${accents.label}`}>{label}</span>
        <span className={`text-lg font-bold ${accents.text}`}>{value}</span>
      </div>
      <div className="flex gap-1">
        {items.map(item => (
          <span
            key={item.key}
            title={`${item.title}: ${item.value}`}
            className={`flex-1 text-center text-[10px] font-semibold rounded px-1 py-0.5 ${accents.chip}`}
          >
            {item.short} {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}
