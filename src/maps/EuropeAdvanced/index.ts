import type { MapDefinition } from '../../types';
import svgUrl from './EuropeAdvanced.svg?url';

export function createEuropeAdvancedMap(): MapDefinition {
  return {
    name: 'Europe Advanced',
    svgUrl,
    viewBox: '0 0 3840 2160',
    renderConnectionDots: false,
    renderConnectionLines: false,
    territories: {
      // South Western Europe
      'Andalusia': { connections: ['Rabat', 'Portugal', 'Madrid'] },
      'Madrid': { connections: ['Andalusia', 'Portugal', 'Castile and Leon', 'Barcelona'] },
      'Portugal': { connections: ['Andalusia', 'Madrid', 'Galicia', 'Castile and Leon'] },
      'Galicia': { connections: ['Portugal', 'Castile and Leon'] },
      'Castile and Leon': { connections: ['Gascony', 'Portugal', 'Galicia', 'Madrid', 'Barcelona'] },
      'Barcelona': { connections: ['Gascony', 'Castile and Leon', 'Madrid'] },

      // South Eastern Europe
      'Romania': { connections: ['Hungary', 'Lviv', 'Kyiv', 'Dinarides', 'Bulgaria'] },
      'Bulgaria': { connections: ['Istanbul', 'Greece', 'Dinarides', 'Romania'] },
      'Dinarides': { connections: ['Trieste', 'Hungary', 'Romania', 'Bulgaria', 'Greece'] },
      'Greece': { connections: ['Benghazi', 'Istanbul', 'Dinarides', 'Bulgaria'] },

      // Western Europe
      'Brittany': { connections: ['London', 'Gascony', 'Paris', 'Burgundy'] },
      'Gascony': { connections: ['Castile and Leon', 'Barcelona', 'Marseille', 'Brittany', 'Paris'] },
      'Paris': { connections: ['Brittany', 'Burgundy', 'Marseille', 'Gascony'] },
      'Burgundy': { connections: ['London', 'Netherlands', 'Bavaria', 'Alps', 'Paris', 'Marseille'] },
      'Marseille': { connections: ['Alps', 'Gascony', 'Paris', 'Burgundy'] },

      // Southern Europe
      'Alps': { connections: ['Marseille', 'Burgundy', 'Bavaria', 'Vienna', 'Venice'] },
      'Venice': { connections: ['Vienna', 'Trieste', 'Alps', 'Rome'] },
      'Rome': { connections: ['Venice', 'Naples'] },
      'Naples': { connections: ['Rome', 'Sardinia'] },
      'Sardinia': { connections: ['Jijel', 'Naples'] },

      // Dinaric Alps
      'Vienna': { connections: ['Venice', 'Alps', 'Bavaria', 'Prussia', 'Hungary', 'Trieste'] },
      'Hungary': { connections: ['Poland', 'Lviv', 'Romania', 'Dinarides', 'Trieste', 'Prussia'] },
      'Trieste': { connections: ['Dinarides', 'Vienna', 'Hungary', 'Venice'] },

      // Central Europe
      'Denmark': { connections: ['Oslo', 'Stockholm', 'Rhine'] },
      'Rhine': { connections: ['Denmark', 'Netherlands', 'Bavaria', 'Berlin'] },
      'Netherlands': { connections: ['Burgundy', 'Bavaria', 'Rhine'] },
      'Bavaria': { connections: ['Burgundy', 'Alps', 'Netherlands', 'Rhine', 'Berlin', 'Prussia', 'Vienna'] },
      'Berlin': { connections: ['Rhine', 'Bavaria', 'Prussia'] },
      'Prussia': { connections: ['Vienna', 'Estonia and Latvia', 'Lithuania', 'Poland', 'Berlin', 'Bavaria', 'Hungary'] },

      // British Empire
      'Scotland': { connections: ['Iceland NE', 'Oslo', 'Ireland', 'Mercia'] },
      'Ireland': { connections: ['Iceland South', 'Scotland', 'Mercia'] },
      'Mercia': { connections: ['Ireland', 'Scotland', 'London'] },
      'London': { connections: ['Mercia', 'Brittany', 'Burgundy'] },

      // Iceland
      'Iceland NW': { connections: ['Iceland NE', 'Iceland South'] },
      'Iceland NE': { connections: ['Scotland', 'Iceland NW', 'Iceland South'] },
      'Iceland South': { connections: ['Ireland', 'Iceland NW', 'Iceland NE'] },

      // Scandinavia
      'Finland': { connections: ['Ruskeala', 'Stockholm'] },
      'Stockholm': { connections: ['Denmark', 'Oslo', 'Sundsvall', 'Finland'] },
      'Oslo': { connections: ['Scotland', 'Denmark', 'Trondheim', 'Sundsvall', 'Stockholm'] },
      'Trondheim': { connections: ['Oslo', 'Sundsvall'] },
      'Sundsvall': { connections: ['Oslo', 'Trondheim', 'Stockholm'] },

      // Eastern Europe
      'Estonia and Latvia': { connections: ['St Petersburg', 'Kharkiv', 'Prussia', 'Lithuania'] },
      'Lithuania': { connections: ['Prussia', 'Kharkiv', 'Estonia and Latvia', 'Poland', 'Belarus'] },
      'Belarus': { connections: ['Kharkiv', 'Poland', 'Lithuania', 'Kyiv', 'Lviv'] },
      'Poland': { connections: ['Prussia', 'Hungary', 'Lithuania', 'Belarus', 'Lviv'] },
      'Lviv': { connections: ['Hungary', 'Romania', 'Poland', 'Belarus', 'Kyiv'] },
      'Kyiv': { connections: ['Kharkiv', 'Romania', 'Lviv', 'Belarus', 'Donetsk'] },
      'Donetsk': { connections: ['Kharkiv', 'Rostov', 'Savastopol', 'Kyiv'] },
      'Savastopol': { connections: ['Donetsk'] },

      // Russian Empire
      'South Russia': { connections: ['Georgia', 'Krasnodar', 'Russia'] },
      'Krasnodar': { connections: ['Rostov', 'Russia', 'South Russia'] },
      'Russia': { connections: ['South Russia', 'Krasnodar', 'Rostov', 'Moscow', 'St Petersburg', 'Petrozavosdk'] },
      'Rostov': { connections: ['Donetsk', 'Kharkiv', 'Moscow', 'Russia', 'Krasnodar'] },
      'Moscow': { connections: ['Kharkiv', 'St Petersburg', 'Russia', 'Rostov'] },
      'Kharkiv': { connections: ['Donetsk', 'Kyiv', 'Belarus', 'Lithuania', 'Estonia and Latvia', 'St Petersburg', 'Moscow', 'Rostov'] },
      'St Petersburg': { connections: ['Estonia and Latvia', 'Petrozavosdk', 'Russia', 'Moscow', 'Kharkiv'] },
      'Petrozavosdk': { connections: ['Ruskeala', 'Russia', 'St Petersburg'] },
      'Ruskeala': { connections: ['Finland', 'Petrozavosdk', 'St Petersburg'] },

      // Orient
      'Israel': { connections: ['Egypt', 'Lebanon', 'Jordan', 'Mecca and Medina'] },
      'Mecca and Medina': { connections: ['Egypt', 'Israel', 'Jordan', 'Arabia'] },
      'Arabia': { connections: ['Mecca and Medina', 'Jordan', 'Iraq'] },
      'Jordan': { connections: ['Israel', 'Lebanon', 'Iraq', 'Arabia', 'Mecca and Medina'] },
      'Lebanon': { connections: ['Gaziantep', 'Erzurum', 'Iraq', 'Jordan', 'Israel'] },
      'Iraq': { connections: ['Erzurum', 'Arabia', 'Jordan', 'Lebanon'] },
      'Erzurum': { connections: ['Georgia', 'Iraq', 'Lebanon', 'Gaziantep'] },
      'Gaziantep': { connections: ['Ankara', 'Erzurum', 'Lebanon'] },
      'Ankara': { connections: ['Istanbul', 'Gaziantep'] },
      'Istanbul': { connections: ['Greece', 'Bulgaria', 'Ankara'] },
      'Georgia': { connections: ['South Russia', 'Erzurum'] },

      // North Africa
      'Nalut': { connections: ['Sahara Desert', 'Tunisia', 'Sirte'] },
      'Sirte': { connections: ['Nalut', 'Benghazi'] },
      'Benghazi': { connections: ['Greece', 'Sirte', 'Tobruk'] },
      'Tobruk': { connections: ['Benghazi', 'Egypt'] },
      'Egypt': { connections: ['Israel', 'Mecca and Medina', 'Tobruk'] },

      // West Africa
      'Morocco': { connections: ['Rabat', 'Sahara Desert'] },
      'Rabat': { connections: ['Andalusia', 'Morocco', 'Melilla', 'Sahara Desert'] },
      'Melilla': { connections: ['Rabat', 'Sahara Desert', 'El Bayadh', 'Mascara'] },
      'El Bayadh': { connections: ['Melilla', 'Sahara Desert', 'Djelfa', 'Mascara'] },
      'Mascara': { connections: ['Melilla', 'El Bayadh', 'Djelfa', 'Jijel'] },
      'Jijel': { connections: ['Sardinia', 'Mascara', 'Djelfa', 'El Oued', 'Tunisia'] },
      'Djelfa': { connections: ['Sahara Desert', 'El Bayadh', 'Mascara', 'Jijel', 'El Oued'] },
      'Tunisia': { connections: ['Nalut', 'Jijel', 'El Oued', 'Sahara Desert'] },
      'El Oued': { connections: ['Sahara Desert', 'Djelfa', 'Jijel', 'Tunisia'] },
      'Sahara Desert': { connections: ['Nalut', 'Morocco', 'Rabat', 'Melilla', 'El Bayadh', 'Djelfa', 'El Oued', 'Tunisia'] },
    },
    continents: {
      'West Africa': {
        territories: ['Morocco', 'Rabat', 'Melilla', 'El Bayadh', 'Mascara', 'Jijel', 'Djelfa', 'Tunisia', 'El Oued', 'Sahara Desert'],
      },
      'North Africa': {
        territories: ['Nalut', 'Sirte', 'Benghazi', 'Tobruk', 'Egypt'],
      },
      'Orient': {
        territories: ['Israel', 'Mecca and Medina', 'Arabia', 'Jordan', 'Lebanon', 'Iraq', 'Erzurum', 'Gaziantep', 'Ankara', 'Istanbul', 'Georgia'],
      },
      'Russian Empire': {
        territories: ['South Russia', 'Krasnodar', 'Russia', 'Rostov', 'Moscow', 'Kharkiv', 'St Petersburg', 'Petrozavosdk', 'Ruskeala'],
      },
      'Eastern Europe': {
        territories: ['Estonia and Latvia', 'Lithuania', 'Belarus', 'Poland', 'Lviv', 'Kyiv', 'Donetsk', 'Savastopol'],
      },
      'Scandinavia': {
        territories: ['Finland', 'Stockholm', 'Oslo', 'Trondheim', 'Sundsvall'],
      },
      'Iceland': {
        territories: ['Iceland NW', 'Iceland NE', 'Iceland South'],
      },
      'British Empire': {
        territories: ['Scotland', 'Ireland', 'Mercia', 'London'],
      },
      'Central Europe': {
        territories: ['Denmark', 'Rhine', 'Netherlands', 'Bavaria', 'Berlin', 'Prussia'],
      },
      'Dinaric Alps': {
        territories: ['Vienna', 'Hungary', 'Trieste'],
      },
      'Southern Europe': {
        territories: ['Alps', 'Venice', 'Rome', 'Naples', 'Sardinia'],
      },
      'Western Europe': {
        territories: ['Brittany', 'Gascony', 'Paris', 'Burgundy', 'Marseille'],
      },
      'South Eastern Europe': {
        territories: ['Romania', 'Bulgaria', 'Dinarides', 'Greece'],
      },
      'South Western Europe': {
        territories: ['Andalusia', 'Madrid', 'Portugal', 'Galicia', 'Castile and Leon', 'Barcelona'],
      },
    },
  };
}
