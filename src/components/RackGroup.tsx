import React from 'react';
import { Server, ChevronUp, ChevronDown } from 'lucide-react';
import GatewayGroup from './GatewayGroup';
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

export default function RackGroup({
  rackId,
  gwGroups,
  originalRackGroups,
  activeView,
  country,
  site,
  dc,
  isExpanded,
  onToggleExpand,
  expandedGwIds,
  toggleGwExpansion,
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
  expandedRackNames,
  onToggleRackExpansion
}: RackGroupProps) {

  const allPdus = React.useMemo(() => {
    const pdus: RackData[] = [];
    Object.values(gwGroups).forEach(pduList => {
      pdus.push(...pduList);
    });
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'maintenance': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'normal': return 'Normal';
      case 'warning': return 'Advertencia';
      case 'critical': return 'Critico';
      case 'maintenance': return 'Mantenimiento';
      default: return 'Desconocido';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow space-y-4 border-2 mb-4 ${
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
            <div className="flex items-center mb-1">
              <span className="font-semibold text-teal-600 uppercase tracking-wider text-xs">
                RACK
              </span>
            </div>
            <h2 className="font-bold text-gray-900 text-lg">
              {rackName === 'N/A' ? 'Sin Rack Definido' : rackName}
            </h2>
            <div className="flex items-center mt-1">
              <span className="text-gray-600 mr-2 text-sm">
                {totalGateways} Gateway{totalGateways !== 1 ? 's' : ''} {' \u2022 '} {totalPdus} PDU{totalPdus !== 1 ? 's' : ''}
              </span>
              {isInMaintenance && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                  En mantenimiento
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
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
                }`}>
                  {getStatusText(overallStatus)}
                </span>
              </div>
            )}
          </div>

          <div className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 px-3 pb-6">
          {Object.entries(gwGroups).sort(([a], [b]) => a.localeCompare(b)).map(([gwKey, pdus]) => {
            const [gwName, gwIp] = gwKey.split('-');
            return (
              <GatewayGroup
                key={gwKey}
                gwName={gwName}
                gwIp={gwIp}
                pdus={pdus}
                originalRackGroups={originalRackGroups}
                activeView={activeView}
                country={country}
                site={site}
                dc={dc}
                rackId={rackId}
                isExpanded={expandedGwIds.has(gwKey)}
                onToggleExpand={toggleGwExpansion}
                getThresholdValue={getThresholdValue}
                getMetricStatusColor={getMetricStatusColor}
                getAmperageStatusColor={getAmperageStatusColor}
                activeStatusFilter={activeStatusFilter}
                onStatusFilterChange={onStatusFilterChange}
                onConfigureThresholds={onConfigureThresholds}
                onSendRackToMaintenance={onSendRackToMaintenance}
                onSendChainToMaintenance={onSendChainToMaintenance}
                onSendAlertToSonar={onSendAlertToSonar}
                maintenanceRacks={maintenanceRacks}
                expandedRackNames={expandedRackNames}
                onToggleRackExpansion={onToggleRackExpansion}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
