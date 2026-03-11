import type { MapDefinition } from '../../types';
import svgUrl from './Alcatraz.svg?url';

export function createAlcatrazMap(): MapDefinition {
  return {
    name: 'Alcatraz',
    svgUrl,
    viewBox: '0 0 3840 2160',
    territories: {
      'Upper Lavatory': { connections: ['Sick Ward'] },
      'Sick Ward': { connections: ['Upper Lavatory', 'Passage'] },
      'Passage': { connections: ['Sick Ward', 'Hospital', 'Attendants Room', 'Lecher Room', 'Dispel Room', 'Screen Room', 'Cell Room Exit Right'] },
      'Hospital': { connections: ['Passage'] },
      'Attendants Room': { connections: ['Passage'] },
      'Lecher Room': { connections: ['Passage'] },
      'Dispel Room': { connections: ['Passage'] },
      'Screen Room': { connections: ['Passage'] },
      'Kitchen Storage': { connections: ['Kitchen'] },
      'Pantry': { connections: ['Kitchen'] },
      'Overseers Mess': { connections: ['Kitchen'] },
      'Mess Room': { connections: ['Kitchen', 'Cell Room Exit Left'] },
      'Kitchen': { connections: ['Kitchen Storage', 'Pantry', 'Overseers Mess', 'Stockade Stairway', 'Mess Room'] },
      'Stockade Stairway': { connections: ['Kitchen', 'Basement Stairway'] },
      'Basement Stairway': { connections: ['Stockade Stairway', 'Workshop'] },
      'Workshop': { connections: ['Basement Stairway', 'Storage', 'Bakery'] },
      'Storage': { connections: ['Workshop'] },
      'Bakery': { connections: ['Workshop', 'Clothing Room'] },
      'Clothing Room': { connections: ['Bakery', 'Lavatory'] },
      'Lavatory': { connections: ['Clothing Room'] },
      'Cell Room Exit Right': { connections: ['Passage', 'Cell Room Exit Left', 'Cell Room Northwest'] },
      'Cell Room Exit Left': { connections: ['Cell Room Exit Right', 'Mess Room', 'Cell Room Center Passage', 'Cell Room South Passage'] },
      'Cell Room South Passage': { connections: ['Cell Room Exit Left', 'Cell Room South'] },
      'Cell Room Northwest': { connections: ['Cell Room Exit Right', 'Cell Room North', 'Cell Room Center'] },
      'Cell Room Center Passage': { connections: ['Cell Room Exit Left', 'Cell Room Center'] },
      'Cell Room North': { connections: ['Cell Room Northwest', 'Cell Room Center', 'Cell Room Entrance'] },
      'Cell Room South': { connections: ['Cell Room Center', 'Cell Room South Passage', 'Cell Room Entrance'] },
      'Cell Room Entrance': { connections: ['Cell Room Center', 'Cell Room North', 'Cell Room South', 'Hallway'] },
      'Cell Room Center': { connections: ['Cell Room Northwest', 'Cell Room North', 'Cell Room Entrance', 'Cell Room South', 'Cell Room Center Passage'] },
      'Hallway': { connections: ['Cell Room Entrance', 'Commandants Office', 'Adjutants Office', 'Guards Lavatory', 'Guards Room'] },
      'Commandants Office': { connections: ['Hallway'] },
      'Adjutants Office': { connections: ['Hallway'] },
      'Guards Lavatory': { connections: ['Hallway'] },
      'Guards Room': { connections: ['Hallway', 'Main Stairway'] },
      'Main Stairway': { connections: ['Guards Room', 'Second Floor Hall'] },
      'Second Floor Hall': { connections: ['Main Stairway', 'Clerks', 'Telegraph Office', 'Record Room'] },
      'Clerks': { connections: ['Second Floor Hall'] },
      'Telegraph Office': { connections: ['Second Floor Hall'] },
      'Record Room': { connections: ['Second Floor Hall'] },
    },
    continents: {
      'Second Floor West End': {
        territories: ['Upper Lavatory', 'Sick Ward', 'Hospital', 'Attendants Room', 'Passage', 'Lecher Room', 'Dispel Room', 'Screen Room']
      },
      'Stockade': {
        territories: ['Kitchen Storage', 'Kitchen', 'Pantry', 'Overseers Mess', 'Mess Room', 'Stockade Stairway']
      },
      'Basement': {
        territories: ['Basement Stairway', 'Workshop', 'Storage', 'Bakery', 'Clothing Room', 'Lavatory']
      },
      'First Floor': {
        territories: ['Cell Room Exit Right', 'Cell Room Northwest', 'Cell Room North', 'Cell Room Exit Left', 'Cell Room Center Passage', 'Cell Room South Passage', 'Cell Room South', 'Cell Room Entrance', 'Cell Room Center', 'Hallway', 'Commandants Office', 'Adjutants Office', 'Guards Lavatory', 'Guards Room', 'Main Stairway']
      },
      'Second Floor East End': {
        territories: ['Second Floor Hall', 'Clerks', 'Telegraph Office', 'Record Room']
      },
    },
  };
}
