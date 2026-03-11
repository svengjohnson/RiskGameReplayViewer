import type { MapDefinition } from '../../types';
import svgUrl from './Classic.svg?url';

export function createClassicMap(): MapDefinition {
  return {
    name: 'Classic',
    svgUrl,
    viewBox: '0 0 3840 2160',
    renderConnections: false,
    duplicates: {
      'Alaska': ['Alaska1'],
    },
    territories: {
      // North America
      'Alaska': { connections: ['Kamchatka', 'Northwest Territory', 'Alberta'] },
      'Northwest Territory': { connections: ['Alaska', 'Alberta', 'Ontario', 'Greenland'] },
      'Alberta': { connections: ['Alaska', 'Northwest Territory', 'Ontario', 'Western United States'] },
      'Ontario': { connections: ['Alberta', 'Northwest Territory', 'Greenland', 'Quebec', 'Eastern United States', 'Western United States'] },
      'Quebec': { connections: ['Greenland', 'Ontario', 'Eastern United States'] },
      'Western United States': { connections: ['Eastern United States', 'Alberta', 'Ontario', 'Central America'] },
      'Eastern United States': { connections: ['Western United States', 'Central America', 'Quebec', 'Ontario'] },
      'Central America': { connections: ['Western United States', 'Eastern United States', 'Venezuela'] },
      'Greenland': { connections: ['Northwest Territory', 'Ontario', 'Quebec', 'Iceland'] },

      // South America
      'Venezuela': { connections: ['Central America', 'Brazil', 'Peru'] },
      'Peru': { connections: ['Venezuela', 'Brazil', 'Argentina'] },
      'Argentina': { connections: ['Peru', 'Brazil'] },
      'Brazil': { connections: ['Venezuela', 'Peru', 'Argentina', 'North Africa'] },

      // Europe
      'Iceland': { connections: ['Greenland', 'Great Britain', 'Scandinavia'] },
      'Great Britain': { connections: ['Iceland', 'Scandinavia', 'Northern Europe', 'Western Europe'] },
      'Western Europe': { connections: ['Great Britain', 'Northern Europe', 'Southern Europe', 'North Africa'] },
      'Southern Europe': { connections: ['Western Europe', 'Northern Europe', 'Middle East', 'Ukraine', 'North Africa', 'Egypt'] },
      'Northern Europe': { connections: ['Great Britain', 'Scandinavia', 'Ukraine', 'Southern Europe', 'Western Europe'] },
      'Scandinavia': { connections: ['Iceland', 'Great Britain', 'Ukraine', 'Northern Europe'] },
      'Ukraine': { connections: ['Scandinavia', 'Northern Europe', 'Southern Europe', 'Middle East', 'Afghanistan', 'Ural'] },

      // Africa
      'North Africa': { connections: ['Brazil', 'Western Europe', 'Southern Europe', 'Egypt', 'Congo', 'East Africa'] },
      'Egypt': { connections: ['North Africa', 'Southern Europe', 'Middle East', 'East Africa'] },
      'Congo': { connections: ['North Africa', 'East Africa', 'South Africa'] },
      'South Africa': { connections: ['Congo', 'East Africa', 'Madagascar'] },
      'Madagascar': { connections: ['South Africa', 'East Africa'] },
      'East Africa': { connections: ['Madagascar', 'South Africa', 'Congo', 'Egypt', 'Middle East', 'North Africa'] },

      // Australia
      'Eastern Australia': { connections: ['New Guinea', 'Western Australia'] },
      'Western Australia': { connections: ['Eastern Australia', 'New Guinea', 'Indonesia'] },
      'New Guinea': { connections: ['Indonesia', 'Western Australia', 'Eastern Australia'] },
      'Indonesia': { connections: ['Siam', 'Western Australia', 'New Guinea'] },

      // Asia
      'Middle East': { connections: ['Ukraine', 'Southern Europe', 'Egypt', 'East Africa', 'India', 'Afghanistan'] },
      'India': { connections: ['Middle East', 'Afghanistan', 'China', 'Siam'] },
      'Siam': { connections: ['Indonesia', 'India', 'China'] },
      'Afghanistan': { connections: ['Middle East', 'Ukraine', 'Ural', 'China', 'India'] },
      'China': { connections: ['Siam', 'India', 'Afghanistan', 'Ural', 'Mongolia', 'Siberia'] },
      'Ural': { connections: ['Ukraine', 'Afghanistan', 'Siberia', 'China'] },
      'Siberia': { connections: ['Ural', 'China', 'Mongolia', 'Irkutsk', 'Yakutsk'] },
      'Mongolia': { connections: ['Siberia', 'Irkutsk', 'China', 'Japan', 'Kamchatka'] },
      'Japan': { connections: ['Mongolia', 'Kamchatka'] },
      'Irkutsk': { connections: ['Siberia', 'Yakutsk', 'Kamchatka', 'Mongolia'] },
      'Yakutsk': { connections: ['Siberia', 'Irkutsk', 'Kamchatka'] },
      'Kamchatka': { connections: ['Yakutsk', 'Irkutsk', 'Mongolia', 'Japan', 'Alaska'] },
    },
    continents: {
      'North America': {
        territories: ['Alaska', 'Northwest Territory', 'Greenland', 'Alberta', 'Ontario', 'Quebec', 'Western United States', 'Eastern United States', 'Central America'],
      },
      'South America': {
        territories: ['Venezuela', 'Brazil', 'Peru', 'Argentina'],
      },
      'Europe': {
        territories: ['Iceland', 'Scandinavia', 'Ukraine', 'Great Britain', 'Northern Europe', 'Southern Europe', 'Western Europe'],
      },
      'Africa': {
        territories: ['Egypt', 'North Africa', 'Congo', 'East Africa', 'South Africa', 'Madagascar'],
      },
      'Asia': {
        territories: ['Middle East', 'India', 'Siam', 'China', 'Afghanistan', 'Ural', 'Siberia', 'Mongolia', 'Japan', 'Irkutsk', 'Yakutsk', 'Kamchatka'],
      },
      'Australia': {
        territories: ['Indonesia', 'New Guinea', 'Western Australia', 'Eastern Australia'],
      },
    },
  };
}
