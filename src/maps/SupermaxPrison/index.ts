import type { MapDefinition } from '../../types';
import svgUrl from './SupermaxPrison.svg?url';

export function createSupermaxPrisonMap(): MapDefinition {
  return {
    name: 'Supermax Prison',
    svgUrl,
    viewBox: '0 0 3840 2160',
    renderConnectionDots: false,
    renderConnectionLines: false,
    territories: {
      'Admin Area': { connections: ['Death Row Gate', 'General Population Gate', 'High Security Gate', 'Low Security Gate', 'Max Security Gate', 'Solitary Confinment Gate'] },
      'Cell D1': { connections: ['Death Row Floor'] },
      'Cell D2': { connections: ['Death Row Floor'] },
      'Cell D3': { connections: ['Death Row Floor'] },
      'Cell D4': { connections: ['Death Row Floor'] },
      'Cell G1': { connections: ['General Population Corridor', 'General Population Entrance'] },
      'Cell G2': { connections: ['General Population Corridor', 'General Population Entrance'] },
      'Cell G3': { connections: ['General Population Corridor'] },
      'Cell G4': { connections: ['General Population Corridor'] },
      'Cell H1': { connections: ['High Security Corridor'] },
      'Cell H2': { connections: ['High Security Corridor'] },
      'Cell H3': { connections: ['High Security Corridor'] },
      'Cell L1': { connections: ['Low Security Corridor', 'Low Security Entrance'] },
      'Cell L2': { connections: ['Low Security Corridor', 'Low Security Entrance'] },
      'Cell L3': { connections: ['Low Security Corridor'] },
      'Cell M1': { connections: ['Max Security Corridor'] },
      'Cell M2': { connections: ['Max Security Corridor'] },
      'Cell M3': { connections: ['Max Security Corridor'] },
      'Cell M4': { connections: ['Max Security Corridor'] },
      'Cell S1': { connections: ['Solitary Confinment Corridor'] },
      'Cell S2': { connections: ['Solitary Confinment Corridor'] },
      'Cell S3': { connections: ['Solitary Confinment Corridor'] },
      'Cell S4': { connections: ['Solitary Confinment Corridor'] },
      'Cell S5': { connections: ['Solitary Confinment Corridor'] },
      'Cell S6': { connections: ['Solitary Confinment Corridor'] },
      'Death Row Entrance': { connections: ['Death Row Floor', 'Death Row Gate'] },
      'Death Row Floor': { connections: ['Cell D1', 'Cell D2', 'Cell D3', 'Cell D4', 'Death Row Entrance'] },
      'Death Row Gate': { connections: ['Admin Area', 'Death Row Entrance', 'Low Security Gate', 'Max Security Gate'] },
      'General Population Corridor': { connections: ['Cell G1', 'Cell G2', 'Cell G3', 'Cell G4', 'General Population Entrance'] },
      'General Population Entrance': { connections: ['Cell G1', 'Cell G2', 'General Population Corridor', 'General Population Gate'] },
      'General Population Gate': { connections: ['Admin Area', 'General Population Entrance', 'Max Security Gate', 'Solitary Confinment Gate'] },
      'High Security Corridor': { connections: ['Cell H1', 'Cell H2', 'Cell H3', 'High Security Entrance'] },
      'High Security Entrance': { connections: ['High Security Corridor', 'High Security Gate'] },
      'High Security Gate': { connections: ['Admin Area', 'High Security Entrance', 'Low Security Gate', 'Solitary Confinment Gate'] },
      'Low Security Corridor': { connections: ['Cell L1', 'Cell L2', 'Cell L3', 'Low Security Entrance'] },
      'Low Security Entrance': { connections: ['Cell L1', 'Cell L2', 'Low Security Corridor', 'Low Security Gate'] },
      'Low Security Gate': { connections: ['Admin Area', 'Death Row Gate', 'High Security Gate', 'Low Security Entrance'] },
      'Max Security Corridor': { connections: ['Cell M1', 'Cell M2', 'Cell M3', 'Cell M4', 'Max Security Entrance'] },
      'Max Security Entrance': { connections: ['Max Security Corridor', 'Max Security Gate'] },
      'Max Security Gate': { connections: ['Admin Area', 'Death Row Gate', 'General Population Gate', 'Max Security Entrance'] },
      'Solitary Confinment Corridor': { connections: ['Cell S1', 'Cell S2', 'Cell S3', 'Cell S4', 'Cell S5', 'Cell S6', 'Solitary Confinment Gate'] },
      'Solitary Confinment Gate': { connections: ['Admin Area', 'General Population Gate', 'High Security Gate', 'Solitary Confinment Corridor'] },
    },
    continents: {
      'Solitary Confinment': {
        territories: ['Cell S1', 'Cell S2', 'Cell S3', 'Cell S4', 'Cell S5', 'Cell S6', 'Solitary Confinment Corridor'],
      },
      'High Security': {
        territories: ['Cell H1', 'Cell H2', 'Cell H3', 'High Security Corridor', 'High Security Entrance'],
      },
      'Low Security': {
        territories: ['Low Security Entrance', 'Low Security Corridor', 'Cell L1', 'Cell L2', 'Cell L3'],
      },
      'Admin': {
        territories: ['Admin Area', 'Solitary Confinment Gate', 'High Security Gate', 'Low Security Gate', 'Death Row Gate', 'Max Security Gate', 'General Population Gate'],
      },
      'General Population': {
        territories: ['General Population Entrance', 'General Population Corridor', 'Cell G1', 'Cell G2', 'Cell G3', 'Cell G4'],
      },
      'Max Security': {
        territories: ['Max Security Entrance', 'Max Security Corridor', 'Cell M1', 'Cell M2', 'Cell M3', 'Cell M4'],
      },
      'Death Row': {
        territories: ['Death Row Entrance', 'Death Row Floor', 'Cell D1', 'Cell D2', 'Cell D3', 'Cell D4'],
      },
    },
  };
}
