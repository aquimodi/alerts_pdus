import React from 'react';
import { Building, ChevronUp, ChevronDown } from 'lucide-react';
import RackGroup from './RackGroup';
import { RackData } from '../types';

interface DcGroupProps {
  dc: string;
  rackGroups: { [rackId: string]: { [gwKey: string]: RackData[] } };
  originalRackGroups: RackData[][];
  activeView: 'principal' | 'alertas' | 'mantenimiento';
  country: string;
  site: string;
  isExpanded: boolean;
  onToggleExpand: (dc: string) => void;
  expandedRackIds: Set<string>;
  toggleRackIdExpansion: (rackId: string) => void;
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

export default function DcGroup({
  dc,
  rackGroups,
  originalRackGroups,
  activeView,
  country,
  site,
  isExpanded,
  onToggleExpand,
  expandedRackIds,
  toggleRackIdExpansion,
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
}: DcGroupProps) {

  const totalRacksForDc = Object.keys(rackGroups).length;

  const totalGatewaysForDc = new Set(
    Object.values(rackGroups).flatMap(gwMap => Object.keys(gwMap))
  ).size;

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

  const displayedRackData = React.useMemo(() => {
    const allPdus: RackData[] = [];
    Object.values(rackGroups).forEach(gwMap => {
      Object.values(gwMap).forEach(pduList => {
        allPdus.push(...pduList);
      });
    });

    const rackMap = new Map<string, RackData[]>();
    allPdus.forEach(pdu => {
      const id = pdu.rackId || pdu.id;
      if (!rackMap.has(id)) {
        rackMap.set(id, []);
      }
      rackMap.get(id)!.push(pdu);
    });
    return Array.from(rackMap.values());
  }, [rackGroups]);

  return (
    <div className="bg-white rounded-lg shadow space-y-4 border-2 border-blue-600 mb-4">
      <div className="flex items-center justify-between cursor-pointer p-6" onClick={() => onToggleExpand(dc)}>
        <div className="flex items-center">
          <div className="bg-blue-600 rounded-full mr-3 p-2">
            <Building className="text-white h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <span className="font-semibold text-blue-600 uppercase tracking-wider text-xs">
                SALA
              </span>
            </div>
            <h2 className="font-bold text-gray-900 text-lg">
              {dc === 'N/A' ? 'Sin DC Definido' : `${dc}`}
            </h2>
            <div className="flex items-center mt-1">
              <span className="text-gray-600 mr-2 text-sm">
                {totalRacksForDc} rack{totalRacksForDc !== 1 ? 's' : ''} {' \u2022 '} {totalGatewaysForDc} Gateway{totalGatewaysForDc !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
          {['critical', 'warning', 'normal', 'maintenance'].map(status => {
            let count = 0;

            if (status === 'maintenance') {
              if (activeView === 'alertas') return null;
              count = displayedRackData.filter(rackGroup => {
                const rackName = String(rackGroup[0].name || '').trim();
                const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                return (rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId));
              }).length;
            } else {
              count = displayedRackData.filter(rackGroup => {
                const rackName = String(rackGroup[0].name || '').trim();
                const rackId = String(rackGroup[0].rackId || rackGroup[0].id || '').trim();
                if ((rackName && maintenanceRacks.has(rackName)) || (rackId && maintenanceRacks.has(rackId))) return false;
                return rackGroup.some(rack => rack.status === status);
              }).length;
            }

            if (count === 0 || (activeView === 'alertas' && status === 'normal')) return null;

            const isActive = activeStatusFilter === status;

            let bgActiveClass = 'bg-gray-100';
            let borderActiveClass = 'border-gray-500';
            let textActiveClass = 'text-gray-800';
            let textSecondaryActiveClass = 'text-gray-600';

            if (status === 'critical') {
              bgActiveClass = 'bg-red-100';
              borderActiveClass = 'border-red-500';
              textActiveClass = 'text-red-800';
              textSecondaryActiveClass = 'text-red-600';
            } else if (status === 'warning') {
              bgActiveClass = 'bg-yellow-100';
              borderActiveClass = 'border-yellow-500';
              textActiveClass = 'text-yellow-800';
              textSecondaryActiveClass = 'text-yellow-600';
            } else if (status === 'normal') {
              bgActiveClass = 'bg-green-100';
              borderActiveClass = 'border-green-500';
              textActiveClass = 'text-green-800';
              textSecondaryActiveClass = 'text-green-600';
            } else if (status === 'maintenance') {
              bgActiveClass = 'bg-blue-100';
              borderActiveClass = 'border-blue-500';
              textActiveClass = 'text-blue-800';
              textSecondaryActiveClass = 'text-blue-600';
            }

            return (
              <button
                key={status}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusFilterChange(status as 'critical' | 'warning' | 'normal' | 'maintenance');
                }}
                className={`flex items-center space-x-1 rounded-full border px-2 py-1 transition-all duration-200 hover:shadow-md ${
                  isActive
                    ? `${bgActiveClass} ${borderActiveClass} shadow-md`
                    : 'bg-gray-50 hover:bg-white'
                }`}
                title={`Filtrar por ${getStatusText(status).toLowerCase()}`}
              >
                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)} ${
                  status === 'critical' || status === 'warning' ? 'animate-pulse' : ''
                }`}></div>
                <span className={`font-medium text-xs ${
                  isActive ? textActiveClass : 'text-gray-600'
                }`}>
                  {count}
                </span>
                <span className={`text-xs ${
                  isActive ? textSecondaryActiveClass : 'text-gray-500'
                }`}>
                  {getStatusText(status).toLowerCase()}
                </span>
              </button>
            );
          })}
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
          {Object.entries(rackGroups).sort(([a], [b]) => a.localeCompare(b)).map(([rackId, gwGroups]) => (
            <RackGroup
              key={rackId}
              rackId={rackId}
              gwGroups={gwGroups}
              originalRackGroups={originalRackGroups}
              activeView={activeView}
              country={country}
              site={site}
              dc={dc}
              isExpanded={expandedRackIds.has(rackId)}
              onToggleExpand={toggleRackIdExpansion}
              expandedGwIds={expandedGwIds}
              toggleGwExpansion={toggleGwExpansion}
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
          ))}
        </div>
      )}
    </div>
  );
}
