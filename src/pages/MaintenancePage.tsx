import { useState, useEffect, useMemo, useCallback } from 'react';
import { Wrench, Calendar, User, MapPin, Server, CircleAlert as AlertCircle, X, Trash2, ChevronDown, ChevronUp, Upload, Circle as XCircle, Download, RefreshCw, ListFilter as Filter, FileSpreadsheet, Globe, Hop as Home, Building } from 'lucide-react';
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

interface GroupedMaintenance {
  [country: string]: {
    [site: string]: {
      [dc: string]: MaintenanceEntry[];
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
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [expandedDcs, setExpandedDcs] = useState<Set<string>>(new Set());
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
      const response = await fetch('/api/maintenance/template', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Error al descargar la plantilla');
      }

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
      return user.sitios_asignados.some(assignedSite =>
        assignedSite.toLowerCase().includes('cantabria')
      );
    }
    return false;
  };

  const toggleExpanded = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) newSet.delete(entryId);
      else newSet.add(entryId);
      return newSet;
    });
  };

  const toggleCountry = (country: string) => {
    setExpandedCountries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(country)) newSet.delete(country);
      else newSet.add(country);
      return newSet;
    });
  };

  const toggleSite = (siteKey: string) => {
    setExpandedSites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteKey)) newSet.delete(siteKey);
      else newSet.add(siteKey);
      return newSet;
    });
  };

  const toggleDc = (dcKey: string) => {
    setExpandedDcs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dcKey)) newSet.delete(dcKey);
      else newSet.add(dcKey);
      return newSet;
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
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch maintenance entries');
      }

      const entries = data.data || [];
      setMaintenanceEntries(entries);

      if (entries.length > 0) {
        const countries = new Set<string>();
        const sites = new Set<string>();
        const dcs = new Set<string>();
        entries.forEach((entry: MaintenanceEntry) => {
          entry.racks.forEach((rack: RackDetail) => {
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

  useEffect(() => {
    fetchMaintenanceEntries();
  }, []);

  const handleRemoveEntry = async (entryId: string, entryType: string, identifier: string, entrySite?: string) => {
    if (user?.rol === 'Observador') {
      alert('No tienes permisos para finalizar mantenimientos.');
      return;
    }

    const confirmMessage = entryType === 'chain'
      ? `¿Seguro que quieres sacar toda la chain "${identifier}" de mantenimiento?`
      : `¿Seguro que quieres sacar el rack "${identifier}" de mantenimiento?`;

    if (!confirm(confirmMessage)) return;

    try {
      setRemovingEntryId(entryId);
      const response = await fetch(`/api/maintenance/entry/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove from maintenance');
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing entry from maintenance:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemovingEntryId(null);
    }
  };

  const handleRemoveIndividualRack = async (rackId: string, entryType: string, rackSite?: string) => {
    if (user?.rol === 'Observador') {
      alert('No tienes permisos para finalizar mantenimientos.');
      return;
    }

    const confirmMessage = entryType === 'chain'
      ? `¿Seguro que quieres sacar solo este rack "${rackId}" de mantenimiento? (La chain seguirá en mantenimiento)`
      : `¿Seguro que quieres sacar el rack "${rackId}" de mantenimiento?`;

    if (!confirm(confirmMessage)) return;

    try {
      setRemovingRackId(rackId);
      const response = await fetch(`/api/maintenance/rack/${encodeURIComponent(rackId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove rack from maintenance');
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing rack from maintenance:', err);
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

    const confirmMessage = `¿Estas COMPLETAMENTE SEGURO de que quieres sacar TODOS los ${totalRacks} racks de mantenimiento?\n\nEsta accion eliminara ${maintenanceEntries.length} ${maintenanceEntries.length === 1 ? 'entrada' : 'entradas'} de mantenimiento y no se puede deshacer.`;

    if (!confirm(confirmMessage)) return;
    if (!confirm('Ultima confirmacion: ¿Realmente deseas eliminar TODAS las entradas de mantenimiento?')) return;

    try {
      setRemovingAll(true);
      const response = await fetch('/api/maintenance/all', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Failed to remove all maintenance entries');
      alert(`${data.data.entriesRemoved} entradas de mantenimiento eliminadas (${data.data.racksRemoved} racks)`);
      await fetchMaintenanceEntries();
    } catch (err) {
      console.error('Error removing all maintenance entries:', err);
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
      const response = await fetch('/api/export/maintenance', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryFilter, siteFilter, dcFilter })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting maintenance:', err);
      alert(`Error al exportar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const getLocationFromRacks = useCallback((racks: RackDetail[]) => {
    if (racks.length === 0) return { country: 'N/A', site: 'N/A', dc: 'N/A' };
    const rack = racks[0];
    return {
      country: rack.country || 'N/A',
      site: rack.site || 'N/A',
      dc: rack.dc || 'N/A'
    };
  }, []);

  const availableCountries = useMemo(() => {
    const countries = new Set<string>();
    maintenanceEntries.forEach(entry => {
      entry.racks.forEach(rack => {
        const c = rack.country || 'N/A';
        if (c) countries.add(c);
      });
    });
    return Array.from(countries).sort();
  }, [maintenanceEntries]);

  const availableSites = useMemo(() => {
    const sites = new Set<string>();
    maintenanceEntries.forEach(entry => {
      entry.racks.forEach(rack => {
        const c = rack.country || 'N/A';
        if (countryFilter !== 'all' && c !== countryFilter) return;
        const s = rack.site || 'N/A';
        if (s) sites.add(s);
      });
    });
    return Array.from(sites).sort();
  }, [maintenanceEntries, countryFilter]);

  const availableDcs = useMemo(() => {
    const dcs = new Set<string>();
    maintenanceEntries.forEach(entry => {
      entry.racks.forEach(rack => {
        const c = rack.country || 'N/A';
        const s = rack.site || 'N/A';
        if (countryFilter !== 'all' && c !== countryFilter) return;
        if (siteFilter !== 'all' && s !== siteFilter) return;
        const d = rack.dc || 'N/A';
        if (d) dcs.add(d);
      });
    });
    return Array.from(dcs).sort();
  }, [maintenanceEntries, countryFilter, siteFilter]);

  const filteredMaintenanceEntries = useMemo(() => {
    if (countryFilter === 'all' && siteFilter === 'all' && dcFilter === 'all') {
      return maintenanceEntries;
    }
    return maintenanceEntries.filter(entry => {
      return entry.racks.some(rack => {
        const c = rack.country || 'N/A';
        const s = rack.site || 'N/A';
        const d = rack.dc || 'N/A';
        if (countryFilter !== 'all' && c !== countryFilter) return false;
        if (siteFilter !== 'all' && s !== siteFilter) return false;
        if (dcFilter !== 'all' && d !== dcFilter) return false;
        return true;
      });
    });
  }, [maintenanceEntries, countryFilter, siteFilter, dcFilter]);

  const { totalRacks } = useMemo(() => {
    const uniqueIds = new Set<string>();
    filteredMaintenanceEntries.forEach(entry => {
      entry.racks.forEach(rack => {
        if (rack.rack_id) {
          const rackIdStr = String(rack.rack_id).trim();
          if (rackIdStr) uniqueIds.add(rackIdStr);
        }
      });
    });
    return { totalRacks: uniqueIds.size };
  }, [filteredMaintenanceEntries]);

  const groupedData = useMemo((): GroupedMaintenance => {
    const grouped: GroupedMaintenance = {};

    filteredMaintenanceEntries.forEach(entry => {
      const loc = getLocationFromRacks(entry.racks);
      const country = loc.country;
      const site = loc.site;
      const dc = loc.dc;

      if (!grouped[country]) grouped[country] = {};
      if (!grouped[country][site]) grouped[country][site] = {};
      if (!grouped[country][site][dc]) grouped[country][site][dc] = [];
      grouped[country][site][dc].push(entry);
    });

    return grouped;
  }, [filteredMaintenanceEntries, getLocationFromRacks]);

  const getCountryFlag = (country: string): string => {
    const lower = country.toLowerCase();
    if (lower.includes('espa') || lower.includes('spain')) return '\uD83C\uDDEA\uD83C\uDDF8';
    return '\uD83C\uDF0D';
  };

  const getCountryDisplayName = (country: string): string => {
    const lower = country.toLowerCase();
    if (lower.includes('espa') || lower === 'espana' || lower === 'españa') return 'Espana';
    return country;
  };

  const countRacksInGroup = (entries: MaintenanceEntry[]): number => {
    const ids = new Set<string>();
    entries.forEach(e => e.racks.forEach(r => {
      if (r.rack_id) ids.add(String(r.rack_id).trim());
    }));
    return ids.size;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
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

  const renderEntryCard = (entry: MaintenanceEntry) => {
    const isChainEntry = entry.entry_type === 'chain';
    const rackName = !isChainEntry && entry.racks.length > 0
      ? (entry.racks[0].name || entry.rack_id)
      : entry.rack_id;
    const displayTitle = isChainEntry
      ? `Chain ${entry.chain}`
      : rackName;

    const bgColor = isChainEntry ? 'from-amber-50 to-amber-100 border-amber-200' : 'from-blue-50 to-blue-100 border-blue-200';
    const iconColor = isChainEntry ? 'text-amber-700' : 'text-blue-700';
    const textColor = isChainEntry ? 'text-amber-900' : 'text-blue-900';
    const isExpanded = expandedEntries.has(entry.id);
    const canFinishMaintenance = canUserFinishMaintenance(entry.site);

    return (
      <div
        key={entry.id}
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
      >
        <div
          className={`bg-gradient-to-r ${bgColor} border-b p-4 cursor-pointer transition-colors ${
            isChainEntry
              ? 'hover:from-amber-100 hover:to-amber-150'
              : 'hover:from-blue-100 hover:to-blue-150'
          }`}
          onClick={() => toggleExpanded(entry.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Server className={`w-5 h-5 ${iconColor}`} />
                <h4 className={`text-lg font-bold ${textColor}`}>
                  {displayTitle}
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isChainEntry
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-blue-200 text-blue-800'
                }`}>
                  {isChainEntry ? 'Chain Completa' : 'Rack Individual'}
                </span>
                <span className="text-slate-500 text-xs">
                  {entry.racks.length} rack{entry.racks.length !== 1 ? 's' : ''}
                </span>
                <div className={`ml-auto p-1 rounded ${iconColor}`}>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                {isChainEntry && entry.chain && (
                  <div className="flex items-center gap-1.5">
                    <Server className={`w-3.5 h-3.5 ${iconColor}`} />
                    <span className="font-medium">Chain:</span>
                    <span>{entry.chain}</span>
                  </div>
                )}
                {!isChainEntry && entry.racks.length > 0 && entry.racks[0].gwName && entry.racks[0].gwName !== 'N/A' && (
                  <div className="flex items-center gap-1.5">
                    <Server className={`w-3.5 h-3.5 ${iconColor}`} />
                    <span className="font-medium">Gateway:</span>
                    <span>{entry.racks[0].gwName} {entry.racks[0].gwIp && entry.racks[0].gwIp !== 'N/A' ? `(${entry.racks[0].gwIp})` : ''}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-medium">Inicio:</span>
                  <span>{new Date(entry.started_at).toLocaleString('es-ES')}</span>
                </div>
                {entry.user && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>{entry.user}</span>
                  </div>
                )}
              </div>

              {entry.reason && (
                <div className="mt-2 flex items-start gap-1.5 text-sm text-slate-700">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium">Razon:</span> {entry.reason}</span>
                </div>
              )}
            </div>

            {user?.rol !== 'Observador' && canFinishMaintenance && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveEntry(
                    entry.id,
                    entry.entry_type,
                    isChainEntry ? `${entry.chain}` : entry.rack_id || '',
                    entry.site || undefined
                  );
                }}
                disabled={removingEntryId === entry.id}
                className="ml-3 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
              >
                {removingEntryId === entry.id ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                    Procesando...
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5" />
                    Finalizar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="p-4">
            <h5 className="font-semibold text-slate-900 mb-3 text-sm">
              {isChainEntry ? `Racks en esta chain (${entry.racks.length})` : 'Detalle del Rack'}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {entry.racks.map(rack => {
                const canFinishRackMaintenance = canUserFinishMaintenance(rack.site);
                return (
                  <div
                    key={rack.rack_id}
                    className="border border-slate-200 rounded-lg p-3 bg-slate-50 relative group"
                  >
                    {isChainEntry && user?.rol !== 'Observador' && canFinishRackMaintenance && (
                      <button
                        onClick={() => handleRemoveIndividualRack(rack.rack_id, entry.entry_type, rack.site)}
                        disabled={removingRackId === rack.rack_id}
                        className="absolute top-2 right-2 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 bg-red-100 hover:bg-red-200 text-red-700"
                        title="Sacar solo este rack de mantenimiento"
                      >
                        {removingRackId === rack.rack_id ? (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-red-700 border-t-transparent"></div>
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <div className="font-medium text-slate-900 mb-1.5 text-sm">
                      {rack.name || rack.rack_id}
                    </div>
                    <div className="space-y-0.5 text-xs text-slate-600">
                      <div><span className="font-medium">Rack ID:</span> {rack.rack_id}</div>
                      {rack.chain && <div><span className="font-medium">Chain:</span> {rack.chain}</div>}
                      {rack.phase && <div><span className="font-medium">Fase:</span> {rack.phase}</div>}
                      {rack.node && <div><span className="font-medium">Node:</span> {rack.node}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Wrench className="w-8 h-8 text-amber-600" />
              <h1 className="text-3xl font-bold text-slate-900">Modo Mantenimiento</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="bg-slate-600 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refrescar datos"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refrescar
              </button>
              <button
                onClick={handleExportMaintenance}
                disabled={isExporting || filteredMaintenanceEntries.length === 0}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar mantenimiento a Excel"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    Exportar
                  </>
                )}
              </button>
              {maintenanceEntries.length > 0 && user?.rol !== 'Observador' && (
                <button
                  onClick={handleRemoveAll}
                  disabled={removingAll}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sacar todos los racks de mantenimiento"
                >
                  {removingAll ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Finalizar Todo
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Descargar plantilla Excel para importar racks"
              >
                {downloadingTemplate ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Descargando...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Plantilla
                  </>
                )}
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Importar desde Excel
              </button>
            </div>
          </div>
          <p className="text-slate-600">
            Equipos actualmente en mantenimiento (no generan alertas)
          </p>

          {user?.rol !== 'Administrador' && user?.sitios_asignados && user.sitios_asignados.length > 0 && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900">
                  <p className="font-semibold mb-1">Permisos de Mantenimiento</p>
                  <p>
                    Puedes ver <strong>todos los equipos en mantenimiento</strong> del sistema. El filtro se inicia en tus sitios asignados:{' '}
                    <span className="font-semibold">{user.sitios_asignados.join(', ')}</span>, pero puedes cambiar los filtros para ver otros sitios.
                  </p>
                  <p className="mt-2 text-blue-700">
                    Solo puedes <strong>finalizar mantenimientos</strong> de equipos pertenecientes a tus sitios asignados.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
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
                    <select
                      value={countryFilter}
                      onChange={(e) => {
                        setCountryFilter(e.target.value);
                        setSiteFilter('all');
                        setDcFilter('all');
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos</option>
                      {availableCountries.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sitio</label>
                    <select
                      value={siteFilter}
                      onChange={(e) => {
                        setSiteFilter(e.target.value);
                        setDcFilter('all');
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos</option>
                      {availableSites.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sala</label>
                    <select
                      value={dcFilter}
                      onChange={(e) => setDcFilter(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todas</option>
                      {availableDcs.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {(countryFilter !== 'all' || siteFilter !== 'all' || dcFilter !== 'all') && (
                  <button
                    onClick={() => { setCountryFilter('all'); setSiteFilter('all'); setDcFilter('all'); }}
                    className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {maintenanceEntries.length > 0 && (
            <div className="mt-4 flex gap-6 text-sm">
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-900">{filteredMaintenanceEntries.length}</span>
                <span className="text-slate-600 ml-2">
                  {filteredMaintenanceEntries.length === 1 ? 'entrada' : 'entradas'} de mantenimiento
                </span>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-900">{totalRacks}</span>
                <span className="text-slate-600 ml-2">
                  {totalRacks === 1 ? 'rack' : 'racks'} en total
                </span>
              </div>
            </div>
          )}
        </div>

        {filteredMaintenanceEntries.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No hay equipos en mantenimiento
            </h3>
            <p className="text-slate-500">
              Todos los equipos estan activos y generando alertas normalmente
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).map(([country, siteGroups]) => {
              const countryKey = country;
              const isCountryExpanded = expandedCountries.has(countryKey);
              const totalSites = Object.keys(siteGroups).length;
              const totalCountryEntries = Object.values(siteGroups).flatMap(dcMap => Object.values(dcMap).flat());
              const totalCountryRacks = countRacksInGroup(totalCountryEntries);

              return (
                <div key={country} className="bg-white rounded-lg shadow border border-gray-200">
                  <div
                    className="p-6 cursor-pointer flex items-center justify-between"
                    onClick={() => toggleCountry(countryKey)}
                  >
                    <div className="flex items-center">
                      <div className="bg-blue-600 rounded-full mr-4 p-2">
                        <Globe className="text-white h-6 w-6" />
                      </div>
                      <div>
                        <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">PAIS</span>
                        <h2 className="font-bold text-gray-900 text-2xl flex items-center">
                          <span className="mr-2 text-3xl">{getCountryFlag(country)}</span>
                          {getCountryDisplayName(country)}
                        </h2>
                        <p className="text-gray-600 mt-1 text-sm">
                          {totalCountryRacks} rack{totalCountryRacks !== 1 ? 's' : ''} {' \u2022 '} {totalSites} sitio{totalSites !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">
                        {totalCountryEntries.length} {totalCountryEntries.length === 1 ? 'entrada' : 'entradas'}
                      </span>
                      <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        {isCountryExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </div>

                  {isCountryExpanded && (
                    <div className="space-y-4 px-3 pb-6">
                      {Object.entries(siteGroups).sort(([a], [b]) => a.localeCompare(b)).map(([site, dcGroups]) => {
                        const siteKey = `${country}::${site}`;
                        const isSiteExpanded = expandedSites.has(siteKey);
                        const totalDcs = Object.keys(dcGroups).length;
                        const totalSiteEntries = Object.values(dcGroups).flat();
                        const totalSiteRacks = countRacksInGroup(totalSiteEntries);

                        return (
                          <div key={site} className="bg-white rounded-lg shadow">
                            <div
                              className="flex items-center justify-between cursor-pointer p-6"
                              onClick={() => toggleSite(siteKey)}
                            >
                              <div className="flex items-center">
                                <div className="bg-blue-600 rounded-full mr-4 p-2">
                                  <Home className="text-white h-6 w-6" />
                                </div>
                                <div>
                                  <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">SITIO</span>
                                  <h3 className="font-bold text-gray-900 text-2xl">
                                    {site === 'N/A' ? 'Sin Sitio Definido' : site}
                                  </h3>
                                  <p className="text-gray-600 mt-1 text-sm">
                                    {totalSiteRacks} rack{totalSiteRacks !== 1 ? 's' : ''} {' \u2022 '} {totalDcs} Sala{totalDcs !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">
                                  {totalSiteEntries.length} {totalSiteEntries.length === 1 ? 'entrada' : 'entradas'}
                                </span>
                                <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                  {isSiteExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                </div>
                              </div>
                            </div>

                            {isSiteExpanded && (
                              <div className="space-y-4 px-3 pb-6">
                                {Object.entries(dcGroups).sort(([a], [b]) => a.localeCompare(b)).map(([dc, entries]) => {
                                  const dcKey = `${country}::${site}::${dc}`;
                                  const isDcExpanded = expandedDcs.has(dcKey);
                                  const dcRackCount = countRacksInGroup(entries);

                                  return (
                                    <div key={dc} className="bg-white rounded-lg shadow border-2 border-blue-600">
                                      <div
                                        className="flex items-center justify-between cursor-pointer p-6"
                                        onClick={() => toggleDc(dcKey)}
                                      >
                                        <div className="flex items-center">
                                          <div className="bg-blue-600 rounded-full mr-3 p-2">
                                            <Building className="text-white h-5 w-5" />
                                          </div>
                                          <div>
                                            <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">SALA</span>
                                            <h4 className="font-bold text-gray-900 text-lg">
                                              {dc === 'N/A' ? 'Sin Sala Definida' : dc}
                                            </h4>
                                            <p className="text-gray-600 mt-1 text-sm">
                                              {dcRackCount} rack{dcRackCount !== 1 ? 's' : ''} {' \u2022 '} {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                          {isDcExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                        </div>
                                      </div>

                                      {isDcExpanded && (
                                        <div className="space-y-3 px-4 pb-4">
                                          {entries.map(entry => renderEntryCard(entry))}
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
          onImportComplete={() => {
            fetchMaintenanceEntries();
          }}
        />
      </div>
    </div>
  );
}
