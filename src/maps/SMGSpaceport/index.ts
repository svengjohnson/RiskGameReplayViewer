import type { MapDefinition } from '../../types';
import svgUrl from './SMGSpaceport.svg?url';

export function createSMGSpaceportMap(): MapDefinition {
  return {
    name: 'SMG Spaceport',
    svgUrl,
    viewBox: '0 0 3840 2160',
    renderConnectionDots: false,
    renderConnectionLines: false,
    cardLabels: { A: 'Infantry', B: 'Cavalry', C: 'Artillery' },
    territories: {
      // The Bridge
      "Captain's Chair": { connections: ["Captain's Quarters", 'Control Room'] },
      "Captain's Quarters": { connections: ["Captain's Chair", 'Control Room', 'Head', '9 or 7 Pod', 'Junction', 'Expected'] },
      'Control Room': { connections: ["Captain's Chair", "Captain's Quarters", 'Head', 'Admin', 'Wave Emitters'] },
      'Admin': { connections: ['Control Room', 'Head'] },
      'Head': { connections: ["Captain's Quarters", 'Control Room', 'Admin', '9 or 7 Pod'] },
      '9 or 7 Pod': { connections: ["Captain's Quarters", 'Head', 'Back Up Generators'] },

      // Weapon
      'Wave Emitters': { connections: ['Control Room', 'Armory'] },
      'Armory': { connections: ['Wave Emitters', 'Munitions', 'Scanners'] },
      'Munitions': { connections: ['Armory', 'Scanners'] },
      'Scanners': { connections: ['Armory', 'Munitions', 'BFG', 'Central Booking', 'Brig'] },
      'BFG': { connections: ['Scanners'] },

      // Security
      'Central Booking': { connections: ['Scanners', 'Electrical', 'Mess Deck', 'Brig', 'Sus Airlock'] },
      'Brig': { connections: ['Central Booking', 'Scanners', 'Sus Airlock'] },
      'Sus Airlock': { connections: ['Central Booking', 'Brig', 'Mess Deck', 'Unexpected'] },

      // Core
      'Back Up Generators': { connections: ['9 or 7 Pod', 'Electrical'] },
      'Electrical': { connections: ['Back Up Generators', 'Shocking', 'Central Booking'] },
      'Shocking': { connections: ['Electrical', 'LETs Phone Home'] },

      // Common Room
      'Mess Deck': { connections: ['Central Booking', 'Sus Airlock', 'Pickleball Courts'] },
      'Pickleball Courts': { connections: ['Mess Deck', 'Infirmary', 'LETs Phone Home', 'Transit Tube'] },

      // Communications
      'Receivers': { connections: ['Bicorder Bay', 'Transmission Deck'] },
      'Transmission Deck': { connections: ['Receivers', 'Bicorder Bay', 'LETs Phone Home', 'Junction'] },
      'Junction': { connections: ["Captain's Quarters", 'Transmission Deck', 'LETs Phone Home'] },
      'LETs Phone Home': { connections: ['Transmission Deck', 'Junction', 'Shocking', 'Infirmary', 'Pickleball Courts', 'Holo Halls'] },
      'Infirmary': { connections: ['LETs Phone Home', 'Bicorder Bay', 'Pickleball Courts', 'Shield Generator', 'Transit Tube'] },
      'Bicorder Bay': { connections: ['Receivers', 'Transmission Deck', 'Infirmary', 'Shield Generator'] },

      // Shields
      'Shield Generator': { connections: ['Bicorder Bay', 'Infirmary', 'Deflectors', 'Holo Halls', 'Hallway', 'Transit Tube'] },
      'Deflectors': { connections: ['Shield Generator', 'Shield Beams'] },
      'Shield Beams': { connections: ['Deflectors'] },
      'Holo Halls': { connections: ['Shield Generator', 'LETs Phone Home', 'The Crossway'] },

      // Connections
      'Transit Tube': { connections: ['Shield Generator', 'Infirmary', 'Hallway', 'Pickleball Courts', 'Anti-Matter', 'L Junction'] },
      'Hallway': { connections: ['Transit Tube', 'Shield Generator', 'Repair Drones'] },
      'Repair Drones': { connections: ['Hallway', 'The Crossway', 'Ion Thrusters'] },
      'The Crossway': { connections: ['Holo Halls', 'Repair Drones', 'Intruders'] },

      // Reactors
      'Anti-Matter': { connections: ['Transit Tube', 'L Junction', 'Gravity Anchor'] },
      'Gravity Anchor': { connections: ['Anti-Matter', 'Ion Thrusters'] },
      'Ion Thrusters': { connections: ['Gravity Anchor', 'Repair Drones', 'Escape Pods'] },

      // Emergency
      'L Junction': { connections: ['Transit Tube', 'Anti-Matter', 'Emergency Room'] },
      'Emergency Room': { connections: ['L Junction', 'Disposable Red Shirts', 'No Escape'] },

      // Storage
      'Crew Deck': { connections: ['Disposable Red Shirts'] },
      'Disposable Red Shirts': { connections: ['Crew Deck', 'Emergency Room', 'Escape Pods'] },
      'Escape Pods': { connections: ['Disposable Red Shirts', 'Ion Thrusters'] },

      // Cling Ons
      'Expected': { connections: ["Captain's Quarters", 'Intruders', 'Unexpected'] },
      'Intruders': { connections: ['The Crossway', 'Expected', 'No Escape'] },
      'No Escape': { connections: ['Emergency Room', 'Unexpected', 'Intruders'] },
      'Unexpected': { connections: ['Sus Airlock', 'Expected', 'No Escape'] },
    },
    continents: {
      'Cling Ons': {
        territories: ['Unexpected', 'Expected', 'Intruders', 'No Escape'],
      },
      'The Bridge': {
        territories: ["Captain's Chair", "Captain's Quarters", 'Control Room', 'Admin', 'Head', '9 or 7 Pod'],
      },
      'Weapon': {
        territories: ['Wave Emitters', 'Armory', 'Munitions', 'Scanners', 'BFG'],
      },
      'Security': {
        territories: ['Central Booking', 'Brig', 'Sus Airlock'],
      },
      'Core': {
        territories: ['Back Up Generators', 'Electrical', 'Shocking'],
      },
      'Common Room': {
        territories: ['Mess Deck', 'Pickleball Courts'],
      },
      'Communications': {
        territories: ['Receivers', 'Transmission Deck', 'Junction', 'LETs Phone Home', 'Infirmary', 'Bicorder Bay'],
      },
      'Shields': {
        territories: ['Shield Generator', 'Deflectors', 'Shield Beams', 'Holo Halls'],
      },
      'Connections': {
        territories: ['Transit Tube', 'Hallway', 'Repair Drones', 'The Crossway'],
      },
      'Reactors': {
        territories: ['Anti-Matter', 'Gravity Anchor', 'Ion Thrusters'],
      },
      'Emergency': {
        territories: ['L Junction', 'Emergency Room'],
      },
      'Storage': {
        territories: ['Crew Deck', 'Disposable Red Shirts', 'Escape Pods'],
      },
    },
  };
}
