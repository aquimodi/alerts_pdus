import React, { useState, useRef, useEffect } from 'react';
import { Server, Network, ChevronUp, ChevronDown, Settings, Wrench, MoveVertical as MoreVertical, Zap, Send } from 'lucide-react';
import { RackData } from '../types';

interface RackGroupProps {
  rackId: string;
  gwGroups: { [gwKey: string]: RackData[] };
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  country: string;
  site: string;
  dc: string;
  isExpanded: boolean;
  onToggleExpand: (rackId: string) => void;
  expandedGwIds: Set<string>;
  toggleGwExpansion: (gwKey: string) => void;
  getThresholdValue: (key: string) => number | undefined;
  getMetricStatusColor: (
    value: number,
    criticalLow: number,
    criticalHigh: number,
    warningLow: number,
    warningHigh: number
  ) => string;
  getAmperageStatusColor: (rack: RackData) => string;
  activeStatusFilter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance';
  onStatusFilterChange: (filter: 'all' | 'critical' | 'warning' | 'normal' | 'maintenance') => void;
  onConfigureThresholds?: (rackId: string, rackName: string) => void;
  onSendRackToMaintenance?: (rackId: string, chain: string, rackName: string, rackData?: any) => void;
  onSendChainToMaintenance?: (chain: string, site: string, dc: string, rackData?: any) => void;
  onSendAlertToSonar?: (rackId: string, rackName: string) => void;
  maintenanceRacks: Set<string>;
  expandedRackNames: Set<string>;
  onToggleRackExpansion: (rackName: string) => void;
}

function getMetricBgColor(rack: RackData, metricType: 'amperage' | 'temperature' | 'humidity' | 'voltage'): string {
  const hasCritical = rack.reasons && rack.reasons.some(reason =>
    reason.startsWith('critical_') && reason.includes(metricType)
  );
  if (hasCritical) return 'bg-red-50 border border-red-200';

  const hasWarning = rack.reasons && rack.reasons.some(reason =>
    reason.startsWith('warning_') && reason.includes(metricType)
  );
  if (hasWarning) return 'bg-yellow-50 border border-yellow-200';

  if (rack.status === 'critical') return 'bg-red-50/50 border border-red-100';
  if (rack.status === 'warning') return 'bg-yellow-50/50 border border-yellow-100';

  return 'bg-white border border-gray-100';
}

function getStatusColor(status: string) {
  switch (status) {
    case 'normal': return 'bg-green-500';
    case 'warning': return 'bg-yellow-500';
    case 'critical': return 'bg-red-500';
    case 'maintenance': return 'bg-blue-500';
    default: return 'bg-gray-500';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'normal': return 'Normal';
    case 'warning': return 'Advertencia';
    case 'critical': return 'Critico';
    case 'maintenance': return 'Mantenimiento';
    default: return 'Desconocido';
  }
}

function PduCard({ pdu }: { pdu: RackData }) {
  const statusDot = pdu.status === 'critical' ? 'bg-red-500 animate-pulse'
    : pdu.status === 'warning' ? 'bg-yellow-500 animate-pulse'
    : 'bg-green-500';

  return (
    <div className={`rounded-lg p-4 bg-white shadow-sm border ${
      pdu.status === 'critical' ? 'border-red-300' :
      pdu.status === 'warning' ? 'border-yellow-300' :
      'border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusDot}`}></div>
          <span className="font-semibold text-gray-800 text-sm">ID {pdu.id}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          pdu.status === 'critical' ? 'bg-red-100 text-red-700' :
          pdu.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
          'bg-green-100 text-green-700'
        }`}>{getStatusText(pdu.status)}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
        {pdu.chain && pdu.chain !== 'N/A' && <span>Chain {pdu.chain}</span>}
        {pdu.node && pdu.node !== 'N/A' && <span>Node {pdu.node}</span>}
        {pdu.serial && pdu.serial !== 'N/A' && <span>Serie {pdu.serial}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={`${getMetricBgColor(pdu, 'amperage')} rounded-lg p-2.5`}>
          <span className="font-medium text-gray-500 text-xs block">Corriente</span>
          <p className="font-bold mt-0.5 text-sm">
            {pdu.reasons && pdu.reasons.includes('warning_amperage_invalid_reading') ? (
              <span className="text-orange-600">Error</span>
            ) : (
              <span className="text-gray-900">{pdu.current}A</span>
            )}
          </p>
        </div>

        <div className={`${getMetricBgColor(pdu, 'voltage')} rounded-lg p-2.5`}>
          <span className="font-medium text-gray-500 text-xs block">Voltaje</span>
          <p className="font-bold text-gray-900 mt-0.5 text-sm">
            {pdu.voltage != null && !isNaN(pdu.voltage) && pdu.voltage > 0 ? `${pdu.voltage}V` : 'N/A'}
          </p>
        </div>

        <div className={`${getMetricBgColor(pdu, 'temperature')} rounded-lg p-2.5`}>
          <span className="font-medium text-gray-500 text-xs block">Temperatura</span>
          <p className="font-bold text-gray-900 mt-0.5 text-sm">
            {pdu.sensorTemperature != null && !isNaN(pdu.sensorTemperature) ? `${pdu.sensorTemperature}\u00B0C` : 'N/A'}
          </p>
        </div>

        <div className={`${getMetricBgColor(pdu, 'humidity')} rounded-lg p-2.5`}>
          <span className="font-medium text-gray-500 text-xs block">Humedad</span>
          <p className="font-bold text-gray-900 mt-0.5 text-sm">
            {pdu.sensorHumidity != null && !isNaN(pdu.sensorHumidity) ? `${pdu.sensorHumidity}%` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RackGroup({
  rackId,
  gwGroups,
  activeView,
  country,
  site,
  dc,
  isExpanded,
  onToggleExpand,
  getThresholdValue,
  getMetricStatusColor,
  getAmperageStatusColor,
  activeStatusFilter,
  onStatusFilterChange,
  onConfigureThresholds,
  onSendRackToMaintenance,
  onSendChainToMaintenance,
  onSendAlertToSonar,
  maintenanceRacks,
}: RackGroupProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [showMenu]);

  const allPdus = React.useMemo(() => {
    const pdus: RackData[] = [];
    Object.values(gwGroups).forEach(pduList => { pdus.push(...pduList); });
    return pdus;
  }, [gwGroups]);

  const rackName = allPdus[0]?.name || rackId;
  const totalGateways = Object.keys(gwGroups).length;
  const totalPdus = allPdus.length;

  const rackNameStr = String(rackName || '').trim();
  const rackIdStr = String(rackId || '').trim();
  const isInMaintenance = (rackNameStr && maintenanceRacks.has(rackNameStr)) || (rackIdStr && maintenanceRacks.has(rackIdStr));

  const overallStatus = allPdus.some(r => r.status === 'critical')
    ? 'critical'
    : allPdus.some(r => r.status === 'warning')
    ? 'warning'
    : 'normal';

  const commonInfo = allPdus[0];
  const hasCriticalAlerts = overallStatus === 'critical';
  const sonarSent = hasCriticalAlerts && allPdus.some(r => r.sonarSent);

  return (
    <div className={`bg-white rounded-lg shadow border-2 mb-4 ${
      isInMaintenance ? 'border-blue-400' :
      overallStatus === 'critical' ? 'border-red-400' :
      overallStatus === 'warning' ? 'border-yellow-400' :
      'border-teal-600'
    }`}>
      <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => onToggleExpand(rackId)}>
        <div className="flex items-center">
          <div className={`rounded-full mr-3 p-2 ${
            isInMaintenance ? 'bg-blue-500' :
            overallStatus === 'critical' ? 'bg-red-600' :
            overallStatus === 'warning' ? 'bg-yellow-500' :
            'bg-teal-600'
          }`}>
            <Server className="text-white h-5 w-5" />
          </div>
          <div>
            <span className="font-semibold text-teal-600 uppercase tracking-wider text-xs">RACK</span>
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-1.5">
              {rackName === 'N/A' ? 'Sin Rack Definido' : rackName}
              {sonarSent && <Zap className="w-3.5 h-3.5 text-amber-500" title="Alerta enviada a SONAR" />}
            </h2>
            <div className="flex items-center mt-1 gap-2">
              <span className="text-gray-600 text-sm">
                {totalGateways} Gateway{totalGateways !== 1 ? 's' : ''} {' \u2022 '} {totalPdus} PDU{totalPdus !== 1 ? 's' : ''}
              </span>
              {isInMaintenance && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Wrench className="w-3 h-3" />En mantenimiento
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {(onConfigureThresholds || onSendRackToMaintenance || onSendChainToMaintenance || (onSendAlertToSonar && overallStatus === 'critical')) && (
            <div className="relative menu-button" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title="Opciones"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  {onConfigureThresholds && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowMenu(false); onConfigureThresholds(commonInfo.rackId || commonInfo.id, commonInfo.name); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 transition-colors first:rounded-t-lg"
                    >
                      <Settings className="h-4 w-4 text-blue-600" />
                      <span>Configurar Umbrales</span>
                    </button>
                  )}
                  {onSendRackToMaintenance && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); setShowMenu(false);
                        onSendRackToMaintenance(commonInfo.rackId || commonInfo.id, commonInfo.chain || 'Unknown', commonInfo.name, {
                          id: commonInfo.id, rackId: commonInfo.rackId, name: commonInfo.name,
                          country: commonInfo.country, site: commonInfo.site, dc: commonInfo.dc,
                          phase: commonInfo.phase, chain: commonInfo.chain, node: commonInfo.node,
                          serial: commonInfo.serial, gwName: commonInfo.gwName, gwIp: commonInfo.gwIp
                        });
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-amber-50 transition-colors border-t border-gray-100"
                    >
                      <Wrench className="h-4 w-4 text-amber-600" />
                      <span>Enviar Rack a Mantenimiento</span>
                    </button>
                  )}
                  {onSendChainToMaintenance && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); setShowMenu(false);
                        onSendChainToMaintenance(commonInfo.chain || 'Unknown', commonInfo.site || 'Unknown', commonInfo.dc || 'Unknown', {
                          id: commonInfo.id, rackId: commonInfo.rackId, name: commonInfo.name,
                          country: commonInfo.country, site: commonInfo.site, dc: commonInfo.dc,
                          phase: commonInfo.phase, chain: commonInfo.chain, node: commonInfo.node,
                          serial: commonInfo.serial, gwName: commonInfo.gwName, gwIp: commonInfo.gwIp
                        });
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-amber-50 transition-colors border-t border-gray-100"
                    >
                      <Wrench className="h-4 w-4 text-amber-600" />
                      <span>Enviar Chain a Mantenimiento</span>
                    </button>
                  )}
                  {onSendAlertToSonar && overallStatus === 'critical' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowMenu(false); onSendAlertToSonar(commonInfo.rackId || commonInfo.id, commonInfo.name); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-red-50 transition-colors last:rounded-b-lg border-t border-gray-100"
                    >
                      <Send className="h-4 w-4 text-red-600" />
                      <span>Enviar alerta</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2">
            {isInMaintenance ? (
              <div className="flex items-center space-x-1 rounded-full border px-2 py-1 bg-blue-100 border-blue-500">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="font-medium text-xs text-blue-800">Mantenimiento</span>
              </div>
            ) : (
              <div className={`flex items-center space-x-1 rounded-full border px-2 py-1 ${
                overallStatus === 'critical' ? 'bg-red-100 border-red-500' :
                overallStatus === 'warning' ? 'bg-yellow-100 border-yellow-500' :
                'bg-green-100 border-green-500'
              }`}>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(overallStatus)} ${
                  overallStatus !== 'normal' ? 'animate-pulse' : ''
                }`}></div>
                <span className={`font-medium text-xs ${
                  overallStatus === 'critical' ? 'text-red-800' :
                  overallStatus === 'warning' ? 'text-yellow-800' :
                  'text-green-800'
                }`}>{getStatusText(overallStatus)}</span>
              </div>
            )}
          </div>

          <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-5 space-y-4">
          {Object.entries(gwGroups).sort(([a], [b]) => a.localeCompare(b)).map(([gwKey, pdus]) => {
            const [gwName, gwIp] = gwKey.split('-');
            const gwOverallStatus = pdus.some(r => r.status === 'critical')
              ? 'critical'
              : pdus.some(r => r.status === 'warning')
              ? 'warning'
              : 'normal';

            return (
              <div key={gwKey} className="border-2 border-cyan-500 rounded-lg overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between ${
                  gwOverallStatus === 'critical' ? 'bg-red-50' :
                  gwOverallStatus === 'warning' ? 'bg-yellow-50' :
                  'bg-cyan-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="bg-cyan-600 rounded-full p-1.5">
                      <Network className="text-white h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-cyan-700 uppercase tracking-wider text-xs">GATEWAY</span>
                      <div className="font-bold text-gray-900 text-sm">
                        {gwName === 'N/A' ? 'Sin Gateway' : gwName}
                      </div>
                    </div>
                    {gwIp && gwIp !== 'N/A' && (
                      <span className="text-xs text-gray-500">IP: {gwIp}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cyan-700 font-medium bg-cyan-100 px-2 py-0.5 rounded-full">
                      {pdus.length} PDU{pdus.length !== 1 ? 's' : ''}
                    </span>
                    <div className={`flex items-center space-x-1 rounded-full border px-2 py-0.5 ${
                      gwOverallStatus === 'critical' ? 'bg-red-100 border-red-400' :
                      gwOverallStatus === 'warning' ? 'bg-yellow-100 border-yellow-400' :
                      'bg-green-100 border-green-400'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(gwOverallStatus)} ${
                        gwOverallStatus !== 'normal' ? 'animate-pulse' : ''
                      }`}></div>
                      <span className={`font-medium text-xs ${
                        gwOverallStatus === 'critical' ? 'text-red-700' :
                        gwOverallStatus === 'warning' ? 'text-yellow-700' :
                        'text-green-700'
                      }`}>{getStatusText(gwOverallStatus)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2 bg-gray-50/50">
                  {pdus.map((pdu) => (
                    <PduCard key={pdu.id} pdu={pdu} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
