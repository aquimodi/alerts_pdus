import { useState, useEffect, useMemo, useCallback } from 'react';
import { Wrench, Calendar, User, Server, CircleAlert as AlertCircle, X, ChevronDown, ChevronUp, Upload, Circle as XCircle, Download, RefreshCw, ListFilter as Filter, FileSpreadsheet, Globe, Hop as Home, Building, Network, HardDrive } from 'lucide-react';
import ImportMaintenanceModal from '../components/ImportMaintenanceModal';
import { useAuth } from '../contexts/AuthContext';

interface RackDetail {
  rack_id: string;
  name: string;
  country: string;
  site: string;
  dc: string;
  phase: string;
  chain: string;
  node: string;
  gwName?: string;
  gwIp?: string;
}

interface MaintenanceEntry {
  id: string;
  entry_type: 'individual_rack' | 'chain';
  rack_id: string | null;
  chain: string | null;
  site: string | null;
  dc: string;
  reason: string;
  user: string;
  started_at: string;
  started_by: string;
  created_at: string;
  racks: RackDetail[];
}

interface PduWithEntry extends RackDetail {
  entryId: string;
  entryType: 'individual_rack' | 'chain';
  entryChain: string | null;
  entrySite: string | null;
  entryReason: string;
  entryUser: string;
  entryStartedAt: string;
}

interface GatewayData {
  gwName: string;
  gwIp: string;
  pdus: PduWithEntry[];
}

interface RackGroupData {
  rackName: string;
  rackId: string;
  chain: string;
  gateways: { [gwKey: string]: GatewayData };
  entryInfo: {
    entryId: string;
    entryType: 'individual_rack' | 'chain';
    entryChain: string | null;
    entrySite: string | null;
    entryReason: string;
    entryUser: string;
    entryStartedAt: string;
  };
  pduCount: number;
}

interface FullGroupedData {
  [country: string]: {
    [site: string]: {
      [dc: string]: {
        [rackName: string]: RackGroupData;
      };
    };
  };
}

export default function MaintenancePage() {
  const { user } = useAuth();
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const [removingRackId, setRemovingRackId] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [expandedDcs, setExpandedDcs] = useState<Set<string>>(new Set());
  const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [dcFilter, setDcFilter] = useState<string>('all');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const response = await fetch('/api/maintenance/template', { credentials: 'include' });
      if (!response.ok) throw new Error('Error al descargar la plantilla');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_mantenimiento_racks.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading template:', err);
      alert('Error al descargar la plantilla');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const canUserFinishMaintenance = (siteName: string | null | undefined): boolean => {
    if (!siteName) return false;
    if (user?.rol === 'Administrador') return true;
    if (!user?.sitios_asignados || user.sitios_asignados.length === 0) return true;
    if (user.sitios_asignados.includes(siteName)) return true;
    const normalizedSite = siteName.toLowerCase().includes('cantabria') ? 'Cantabria' : siteName;
    if (normalizedSite === 'Cantabria') {
      return user.sitios_asignados.some(s => s.toLowerCase().includes('cantabria'));
    }
    return false;
  };

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fetchMaintenanceEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/maintenance?t=${timestamp}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to fetch maintenance entries');

      const entries: MaintenanceEntry[] = data.data || [];
      setMaintenanceEntries(entries);

      if (entries.length > 0) {
        const countries = new Set<string>();
        const sites = new Set<string>();
        const dcs = new Set<string>();
        entries.forEach(entry => {
          entry.racks.forEach(rack => {
            const c = rack.country || 'N/A';
            const s = rack.site || 'N/A';
            const d = rack.dc || 'N/A';
            countries.add(c);
            sites.add(`${c}::${s}`);
            dcs.add(`${c}::${s}::${d}`);
          });
        });
        setExpandedCountries(countries);
        setExpandedSites(sites);
        setExpandedDcs(dcs);
      }
    } catch (err) {
      console.error('Error fetching maintenance entries:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMaintenanceEntries(); }, []);

  const handleRemoveEntry = async (entryId: string, entryType: string, identifier: string) => {
    if (user?.rol === 'Observador') {
      alert('No tienes permisos para finalizar mantenimientos.');
      return;
    }
    const msg = entryType === 'chain'
      ? `Seguro que quieres sacar toda la chain "${identifier}" de mantenimiento?`
      : `Seguro que quieres sacar el rack "${identifier}" de mantenimiento?`;
    if (!confirm(msg)) return;
    try {
      setRemovingEntryId(entryId);
      const response = await fetch(`/api/maintenance/entry/${encodeURIComponent(entryId)}`, {
        method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove from maintenance');
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing entry:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemovingEntryId(null);
    }
  };

  const handleRemoveIndividualRack = async (rackId: string, entryType: string) => {
    if (user?.rol === 'Observador') {
      alert('No tienes permisos para finalizar mantenimientos.');
      return;
    }
    const msg = entryType === 'chain'
      ? `Seguro que quieres sacar solo este rack "${rackId}" de mantenimiento? (La chain seguira en mantenimiento)`
      : `Seguro que quieres sacar el rack "${rackId}" de mantenimiento?`;
    if (!confirm(msg)) return;
    try {
      setRemovingRackId(rackId);
      const response = await fetch(`/api/maintenance/rack/${encodeURIComponent(rackId)}`, {
        method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove rack');
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing rack:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemovingRackId(null);
    }
  };

  const handleRemoveAll = async () => {
    if (user?.rol === 'Observador') {
      alert('No tienes permisos para finalizar mantenimientos.');
      return;
    }
    if (maintenanceEntries.length === 0) return;
    if (!confirm(`Estas COMPLETAMENTE SEGURO de que quieres sacar TODOS los ${totalRacks} racks de mantenimiento?\n\nEsta accion no se puede deshacer.`)) return;
    if (!confirm('Ultima confirmacion: Realmente deseas eliminar TODAS las entradas de mantenimiento?')) return;
    try {
      setRemovingAll(true);
      const response = await fetch('/api/maintenance/all', {
        method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove all');
      alert(`${data.data.entriesRemoved} entradas eliminadas (${data.data.racksRemoved} racks)`);
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing all:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemovingAll(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchMaintenanceEntries();
    setIsRefreshing(false);
  };

  const handleExportMaintenance = async () => {
    try {
      setIsExporting(true);

      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Mantenimiento');

      sheet.columns = [
        { header: 'Tipo', key: 'tipo', width: 18 },
        { header: 'Nombre del Rack', key: 'nombre', width: 25 },
        { header: 'ID Rack', key: 'rackId', width: 20 },
        { header: 'Pais', key: 'pais', width: 15 },
        { header: 'Sitio', key: 'sitio', width: 20 },
        { header: 'Sala', key: 'sala', width: 15 },
        { header: 'Chain', key: 'chain', width: 15 },
        { header: 'Node', key: 'node', width: 15 },
        { header: 'Fase', key: 'fase', width: 10 },
        { header: 'Gateway', key: 'gateway', width: 20 },
        { header: 'IP Gateway', key: 'gwIp', width: 18 },
        { header: 'Usuario', key: 'usuario', width: 20 },
        { header: 'Razon', key: 'razon', width: 35 },
        { header: 'Fecha Inicio', key: 'fechaInicio', width: 22 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      headerRow.alignment = { horizontal: 'center' };

      filteredEntries.forEach(entry => {
        const isChain = entry.entry_type === 'chain';
        entry.racks.forEach(rack => {
          const dataRow = sheet.addRow({
            tipo: isChain ? 'Chain Completa' : 'Rack Individual',
            nombre: rack.name || '',
            rackId: rack.rack_id || '',
            pais: rack.country || '',
            sitio: rack.site || entry.site || '',
            sala: rack.dc || entry.dc || '',
            chain: rack.chain || entry.chain || '',
            node: rack.node || '',
            fase: rack.phase || '',
            gateway: rack.gwName || '',
            gwIp: rack.gwIp || '',
            usuario: entry.user || '',
            razon: entry.reason || '',
            fechaInicio: entry.started_at ? new Date(entry.started_at).toLocaleString('es-ES') : '',
          });

          const fillColor = isChain ? 'FFFFF3CD' : 'FFDBEAFE';
          dataRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
              bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
              left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
              right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            };
          });
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting:', err);
      alert(`Error al exportar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    maintenanceEntries.forEach(e => e.racks.forEach(r => set.add(r.country || 'N/A')));
    return Array.from(set).sort();
  }, [maintenanceEntries]);

  const availableSites = useMemo(() => {
    const set = new Set<string>();
    maintenanceEntries.forEach(e => e.racks.forEach(r => {
      if (countryFilter !== 'all' && (r.country || 'N/A') !== countryFilter) return;
      set.add(r.site || 'N/A');
    }));
    return Array.from(set).sort();
  }, [maintenanceEntries, countryFilter]);

  const availableDcs = useMemo(() => {
    const set = new Set<string>();
    maintenanceEntries.forEach(e => e.racks.forEach(r => {
      if (countryFilter !== 'all' && (r.country || 'N/A') !== countryFilter) return;
      if (siteFilter !== 'all' && (r.site || 'N/A') !== siteFilter) return;
      set.add(r.dc || 'N/A');
    }));
    return Array.from(set).sort();
  }, [maintenanceEntries, countryFilter, siteFilter]);

  const filteredEntries = useMemo(() => {
    if (countryFilter === 'all' && siteFilter === 'all' && dcFilter === 'all') return maintenanceEntries;
    return maintenanceEntries.filter(entry => entry.racks.some(r => {
      if (countryFilter !== 'all' && (r.country || 'N/A') !== countryFilter) return false;
      if (siteFilter !== 'all' && (r.site || 'N/A') !== siteFilter) return false;
      if (dcFilter !== 'all' && (r.dc || 'N/A') !== dcFilter) return false;
      return true;
    }));
  }, [maintenanceEntries, countryFilter, siteFilter, dcFilter]);

  const totalRacks = useMemo(() => {
    const ids = new Set<string>();
    filteredEntries.forEach(e => e.racks.forEach(r => {
      const id = String(r.rack_id).trim();
      if (id) ids.add(id);
    }));
    return ids.size;
  }, [filteredEntries]);

  const groupedData = useMemo((): FullGroupedData => {
    const result: FullGroupedData = {};

    filteredEntries.forEach(entry => {
      entry.racks.forEach(rack => {
        const country = rack.country || 'N/A';
        const site = rack.site || 'N/A';
        const dc = rack.dc || 'N/A';
        const rackName = rack.name || rack.rack_id || 'N/A';
        const gwName = rack.gwName || 'N/A';
        const gwIp = rack.gwIp || 'N/A';
        const gwKey = `${gwName}-${gwIp}`;

        if (!result[country]) result[country] = {};
        if (!result[country][site]) result[country][site] = {};
        if (!result[country][site][dc]) result[country][site][dc] = {};

        if (!result[country][site][dc][rackName]) {
          result[country][site][dc][rackName] = {
            rackName,
            rackId: rack.rack_id,
            chain: rack.chain,
            gateways: {},
            entryInfo: {
              entryId: entry.id,
              entryType: entry.entry_type,
              entryChain: entry.chain,
              entrySite: entry.site,
              entryReason: entry.reason,
              entryUser: entry.user,
              entryStartedAt: entry.started_at,
            },
            pduCount: 0,
          };
        }

        if (!result[country][site][dc][rackName].gateways[gwKey]) {
          result[country][site][dc][rackName].gateways[gwKey] = {
            gwName,
            gwIp,
            pdus: [],
          };
        }

        result[country][site][dc][rackName].gateways[gwKey].pdus.push({
          ...rack,
          entryId: entry.id,
          entryType: entry.entry_type,
          entryChain: entry.chain,
          entrySite: entry.site,
          entryReason: entry.reason,
          entryUser: entry.user,
          entryStartedAt: entry.started_at,
        });

        result[country][site][dc][rackName].pduCount++;
      });
    });

    return result;
  }, [filteredEntries]);

  const getCountryFlag = (country: string): string => {
    const l = country.toLowerCase();
    if (l.includes('espa') || l.includes('spain')) return '\uD83C\uDDEA\uD83C\uDDF8';
    return '\uD83C\uDF0D';
  };

  const getCountryDisplayName = (country: string): string => {
    const l = country.toLowerCase();
    if (l.includes('espa') || l === 'espana' || l === 'españa') return 'Espana';
    return country;
  };

  const countRacksInDcGroup = (rackGroups: { [rackName: string]: RackGroupData }): number => {
    return Object.keys(rackGroups).length;
  };

  const countPdusInDcGroup = (rackGroups: { [rackName: string]: RackGroupData }): number => {
    return Object.values(rackGroups).reduce((sum, r) => sum + r.pduCount, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Error al cargar datos</h3>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Wrench className="w-8 h-8 text-amber-600" />
              <h1 className="text-3xl font-bold text-slate-900">Modo Mantenimiento</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleManualRefresh} disabled={isRefreshing}
                className="bg-slate-600 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refrescar
              </button>
              <button onClick={handleExportMaintenance} disabled={isExporting || filteredEntries.length === 0}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isExporting ? (
                  <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>Exportando...</>
                ) : (
                  <><FileSpreadsheet className="w-5 h-5" />Exportar</>
                )}
              </button>
              {maintenanceEntries.length > 0 && user?.rol !== 'Observador' && (
                <button onClick={handleRemoveAll} disabled={removingAll}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {removingAll ? (
                    <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>Procesando...</>
                  ) : (
                    <><XCircle className="w-5 h-5" />Finalizar Todo</>
                  )}
                </button>
              )}
              <button onClick={handleDownloadTemplate} disabled={downloadingTemplate}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {downloadingTemplate ? (
                  <><div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>Descargando...</>
                ) : (
                  <><Download className="w-5 h-5" />Plantilla</>
                )}
              </button>
              <button onClick={() => setIsImportModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Importar desde Excel
              </button>
            </div>
          </div>
          <p className="text-slate-600">Equipos actualmente en mantenimiento (no generan alertas)</p>

          {user?.rol !== 'Administrador' && user?.sitios_asignados && user.sitios_asignados.length > 0 && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900">
                  <p className="font-semibold mb-1">Permisos de Mantenimiento</p>
                  <p>
                    Puedes ver <strong>todos los equipos en mantenimiento</strong>. Tus sitios asignados:{' '}
                    <span className="font-semibold">{user.sitios_asignados.join(', ')}</span>.
                  </p>
                  <p className="mt-2 text-blue-700">
                    Solo puedes <strong>finalizar mantenimientos</strong> de equipos pertenecientes a tus sitios asignados.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mt-4">
            <button onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">
              <Filter className="w-4 h-4" />
              Filtros de ubicacion
              {(countryFilter !== 'all' || siteFilter !== 'all' || dcFilter !== 'all') && (
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Activos</span>
              )}
              {isFiltersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isFiltersExpanded && (
              <div className="mt-3 bg-white rounded-lg border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Pais</label>
                    <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setSiteFilter('all'); setDcFilter('all'); }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">Todos</option>
                      {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sitio</label>
                    <select value={siteFilter} onChange={(e) => { setSiteFilter(e.target.value); setDcFilter('all'); }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">Todos</option>
                      {availableSites.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sala</label>
                    <select value={dcFilter} onChange={(e) => setDcFilter(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">Todas</option>
                      {availableDcs.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                {(countryFilter !== 'all' || siteFilter !== 'all' || dcFilter !== 'all') && (
                  <button onClick={() => { setCountryFilter('all'); setSiteFilter('all'); setDcFilter('all'); }}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary */}
          {maintenanceEntries.length > 0 && (
            <div className="mt-4 flex gap-6 text-sm">
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-900">{filteredEntries.length}</span>
                <span className="text-slate-600 ml-2">{filteredEntries.length === 1 ? 'entrada' : 'entradas'} de mantenimiento</span>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-900">{totalRacks}</span>
                <span className="text-slate-600 ml-2">{totalRacks === 1 ? 'rack' : 'racks'} en total</span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {filteredEntries.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay equipos en mantenimiento</h3>
            <p className="text-slate-500">Todos los equipos estan activos y generando alertas normalmente</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).map(([country, siteGroups]) => {
              const isCountryExpanded = expandedCountries.has(country);
              const totalSitesCount = Object.keys(siteGroups).length;
              let countryRackCount = 0;
              Object.values(siteGroups).forEach(dcMap => Object.values(dcMap).forEach(rackMap => {
                countryRackCount += Object.keys(rackMap).length;
              }));

              return (
                <div key={country} className="bg-white rounded-lg shadow border border-gray-200">
                  {/* COUNTRY */}
                  <div className="p-6 cursor-pointer flex items-center justify-between" onClick={() => toggleSet(setExpandedCountries, country)}>
                    <div className="flex items-center">
                      <div className="bg-blue-600 rounded-full mr-4 p-2"><Globe className="text-white h-6 w-6" /></div>
                      <div>
                        <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">PAIS</span>
                        <h2 className="font-bold text-gray-900 text-2xl flex items-center">
                          <span className="mr-2 text-3xl">{getCountryFlag(country)}</span>
                          {getCountryDisplayName(country)}
                        </h2>
                        <p className="text-gray-600 mt-1 text-sm">
                          {countryRackCount} rack{countryRackCount !== 1 ? 's' : ''} {' \u2022 '} {totalSitesCount} sitio{totalSitesCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                      {isCountryExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>

                  {isCountryExpanded && (
                    <div className="space-y-4 px-3 pb-6">
                      {Object.entries(siteGroups).sort(([a], [b]) => a.localeCompare(b)).map(([site, dcGroups]) => {
                        const siteKey = `${country}::${site}`;
                        const isSiteExpanded = expandedSites.has(siteKey);
                        const totalDcsCount = Object.keys(dcGroups).length;
                        let siteRackCount = 0;
                        Object.values(dcGroups).forEach(rackMap => { siteRackCount += Object.keys(rackMap).length; });

                        return (
                          <div key={site} className="bg-white rounded-lg shadow">
                            {/* SITE */}
                            <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => toggleSet(setExpandedSites, siteKey)}>
                              <div className="flex items-center">
                                <div className="bg-blue-600 rounded-full mr-4 p-2"><Home className="text-white h-6 w-6" /></div>
                                <div>
                                  <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">SITIO</span>
                                  <h3 className="font-bold text-gray-900 text-2xl">{site === 'N/A' ? 'Sin Sitio Definido' : site}</h3>
                                  <p className="text-gray-600 mt-1 text-sm">
                                    {siteRackCount} rack{siteRackCount !== 1 ? 's' : ''} {' \u2022 '} {totalDcsCount} Sala{totalDcsCount !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                {isSiteExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                              </div>
                            </div>

                            {isSiteExpanded && (
                              <div className="space-y-4 px-3 pb-6">
                                {Object.entries(dcGroups).sort(([a], [b]) => a.localeCompare(b)).map(([dc, rackGroups]) => {
                                  const dcKey = `${country}::${site}::${dc}`;
                                  const isDcExpanded = expandedDcs.has(dcKey);
                                  const dcRackCount = countRacksInDcGroup(rackGroups);
                                  const dcPduCount = countPdusInDcGroup(rackGroups);

                                  return (
                                    <div key={dc} className="bg-white rounded-lg shadow border-2 border-blue-600">
                                      {/* SALA */}
                                      <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => toggleSet(setExpandedDcs, dcKey)}>
                                        <div className="flex items-center">
                                          <div className="bg-blue-600 rounded-full mr-3 p-2"><Building className="text-white h-5 w-5" /></div>
                                          <div>
                                            <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">SALA</span>
                                            <h4 className="font-bold text-gray-900 text-lg">{dc === 'N/A' ? 'Sin Sala Definida' : dc}</h4>
                                            <p className="text-gray-600 mt-1 text-sm">
                                              {dcRackCount} rack{dcRackCount !== 1 ? 's' : ''} {' \u2022 '} {dcPduCount} PDU{dcPduCount !== 1 ? 's' : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                          {isDcExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                        </div>
                                      </div>

                                      {isDcExpanded && (
                                        <div className="space-y-4 px-3 pb-6">
                                          {Object.entries(rackGroups).sort(([a], [b]) => a.localeCompare(b)).map(([rackName, rackData]) => {
                                            const rackKey = `${dcKey}::${rackName}`;
                                            const isRackExpanded = expandedRacks.has(rackKey);
                                            const gwCount = Object.keys(rackData.gateways).length;
                                            const canFinish = canUserFinishMaintenance(rackData.entryInfo.entrySite);
                                            const isChain = rackData.entryInfo.entryType === 'chain';

                                            return (
                                              <div key={rackName} className="bg-white rounded-lg shadow border-2 border-teal-600 mb-2">
                                                {/* RACK */}
                                                <div className="flex items-center justify-between cursor-pointer p-5" onClick={() => toggleSet(setExpandedRacks, rackKey)}>
                                                  <div className="flex items-center">
                                                    <div className="bg-teal-600 rounded-full mr-3 p-2"><Server className="text-white h-5 w-5" /></div>
                                                    <div>
                                                      <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-semibold text-teal-600 uppercase tracking-wider text-xs">RACK</span>
                                                        {isChain && (
                                                          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                            Chain {rackData.entryInfo.entryChain}
                                                          </span>
                                                        )}
                                                        <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                                          Mantenimiento
                                                        </span>
                                                      </div>
                                                      <h5 className="font-bold text-gray-900 text-lg">{rackName}</h5>
                                                      <p className="text-gray-600 mt-0.5 text-sm">
                                                        {gwCount} Gateway{gwCount !== 1 ? 's' : ''} {' \u2022 '} {rackData.pduCount} PDU{rackData.pduCount !== 1 ? 's' : ''}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-3">
                                                    {user?.rol !== 'Observador' && canFinish && (
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          if (isChain) {
                                                            handleRemoveIndividualRack(rackData.rackId, rackData.entryInfo.entryType);
                                                          } else {
                                                            handleRemoveEntry(rackData.entryInfo.entryId, rackData.entryInfo.entryType, rackName);
                                                          }
                                                        }}
                                                        disabled={removingEntryId === rackData.entryInfo.entryId || removingRackId === rackData.rackId}
                                                        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                                      >
                                                        {(removingEntryId === rackData.entryInfo.entryId || removingRackId === rackData.rackId) ? (
                                                          <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>Procesando...</>
                                                        ) : (
                                                          <><Wrench className="w-3.5 h-3.5" />Finalizar</>
                                                        )}
                                                      </button>
                                                    )}
                                                    <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                                      {isRackExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                                    </div>
                                                  </div>
                                                </div>

                                                {isRackExpanded && (
                                                  <div className="px-5 pb-5 space-y-4">
                                                    {/* Entry info */}
                                                    <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                                                      <div className="flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        <span className="font-medium">Inicio:</span>
                                                        <span>{new Date(rackData.entryInfo.entryStartedAt).toLocaleString('es-ES')}</span>
                                                      </div>
                                                      {rackData.entryInfo.entryUser && (
                                                        <div className="flex items-center gap-1.5">
                                                          <User className="w-3.5 h-3.5" />
                                                          <span>{rackData.entryInfo.entryUser}</span>
                                                        </div>
                                                      )}
                                                      {rackData.chain && (
                                                        <div className="flex items-center gap-1.5">
                                                          <Server className="w-3.5 h-3.5" />
                                                          <span className="font-medium">Chain:</span>
                                                          <span>{rackData.chain}</span>
                                                        </div>
                                                      )}
                                                      {rackData.entryInfo.entryReason && (
                                                        <div className="flex items-center gap-1.5">
                                                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                                          <span className="font-medium">Razon:</span>
                                                          <span>{rackData.entryInfo.entryReason}</span>
                                                        </div>
                                                      )}
                                                    </div>

                                                    {/* Gateways */}
                                                    {Object.entries(rackData.gateways).sort(([a], [b]) => a.localeCompare(b)).map(([gwKey, gwData]) => (
                                                      <div key={gwKey} className="border-2 border-cyan-500 rounded-lg overflow-hidden">
                                                        <div className="bg-cyan-50 px-4 py-3 flex items-center gap-3">
                                                          <div className="bg-cyan-600 rounded-full p-1.5">
                                                            <Network className="text-white h-4 w-4" />
                                                          </div>
                                                          <div>
                                                            <span className="font-semibold text-cyan-700 uppercase tracking-wider text-xs">GATEWAY</span>
                                                            <div className="font-bold text-gray-900 text-sm">
                                                              {gwData.gwName === 'N/A' ? 'Sin Gateway' : gwData.gwName}
                                                            </div>
                                                          </div>
                                                          {gwData.gwIp !== 'N/A' && (
                                                            <span className="text-xs text-gray-500 ml-auto">IP: {gwData.gwIp}</span>
                                                          )}
                                                          <span className="text-xs text-cyan-700 font-medium bg-cyan-100 px-2 py-0.5 rounded-full">
                                                            {gwData.pdus.length} PDU{gwData.pdus.length !== 1 ? 's' : ''}
                                                          </span>
                                                        </div>

                                                        {/* PDUs */}
                                                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                          {gwData.pdus.map((pdu, idx) => (
                                                            <div key={`${pdu.rack_id}-${idx}`} className="border border-slate-200 rounded-lg p-3 bg-white hover:bg-slate-50 transition-colors">
                                                              <div className="flex items-center gap-2 mb-2">
                                                                <HardDrive className="w-4 h-4 text-slate-500" />
                                                                <span className="font-medium text-slate-900 text-sm">{pdu.name || pdu.rack_id}</span>
                                                              </div>
                                                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
                                                                <div><span className="font-medium text-slate-500">Rack ID:</span> {pdu.rack_id}</div>
                                                                {pdu.phase && <div><span className="font-medium text-slate-500">Fase:</span> {pdu.phase}</div>}
                                                                {pdu.chain && <div><span className="font-medium text-slate-500">Chain:</span> {pdu.chain}</div>}
                                                                {pdu.node && <div><span className="font-medium text-slate-500">Node:</span> {pdu.node}</div>}
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
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <ImportMaintenanceModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => { fetchMaintenanceEntries(); }}
        />
      </div>
    </div>
  );
}
