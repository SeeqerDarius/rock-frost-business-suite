/**
 * Vehicle make/model reference data for the Fleet vehicle form's cascading
 * dropdowns. Deliberately broad (major global manufacturers plus a full set
 * of Chinese makes, since Chinese-built vehicles are common in the Ghanaian
 * market this product targets) with an "Other" escape hatch in the UI for
 * anything not listed here.
 *
 * Real manufacturer logo marks are trademarked and not bundled in this
 * codebase - `makeBadgeColor`/`makeInitials` below drive a plain colored
 * initials badge instead, used everywhere a "make logo" would appear.
 */
export interface VehicleMakeEntry {
  name: string;
  models: string[];
}

export const VEHICLE_MAKES: VehicleMakeEntry[] = [
  { name: "Acura", models: ["ILX", "MDX", "RDX", "TLX", "Integra", "NSX"] },
  { name: "Alfa Romeo", models: ["Giulia", "Stelvio", "Tonale", "4C"] },
  { name: "Audi", models: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "e-tron", "TT", "R8"] },
  { name: "BAIC", models: ["X25", "X35", "X55", "X7", "BJ40"] },
  { name: "Bentley", models: ["Continental GT", "Flying Spur", "Bentayga"] },
  { name: "BMW", models: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7", "i4", "iX"] },
  { name: "BYD", models: ["Atto 3", "Dolphin", "Seal", "Song Plus", "Tang", "Han", "F3"] },
  { name: "Cadillac", models: ["CT4", "CT5", "Escalade", "XT4", "XT5", "XT6"] },
  { name: "Changan", models: ["CS35 Plus", "CS55", "CS75", "Eado", "Alsvin", "UNI-T"] },
  { name: "Chery", models: ["Tiggo 4", "Tiggo 7", "Tiggo 8", "Arrizo 5", "QQ"] },
  { name: "Chevrolet", models: ["Cruze", "Malibu", "Camaro", "Equinox", "Tahoe", "Silverado", "Spark", "Trailblazer"] },
  { name: "Chrysler", models: ["300", "Pacifica", "Voyager"] },
  { name: "Citroen", models: ["C3", "C4", "C5 Aircross", "Berlingo"] },
  { name: "Dacia", models: ["Duster", "Sandero", "Logan", "Spring"] },
  { name: "Daewoo", models: ["Matiz", "Lanos", "Nexia"] },
  { name: "Daihatsu", models: ["Terios", "Xenia", "Sirion"] },
  { name: "Dodge", models: ["Charger", "Challenger", "Durango", "Journey"] },
  { name: "Dongfeng", models: ["AX7", "Fengon 580", "Rich 6"] },
  { name: "FAW", models: ["Besturn X40", "Besturn T77", "Jiabin"] },
  { name: "Ferrari", models: ["Roma", "Portofino", "SF90", "296 GTB"] },
  { name: "Fiat", models: ["500", "Panda", "Tipo", "Doblo"] },
  { name: "Ford", models: ["Fiesta", "Focus", "Fusion", "Ranger", "Everest", "Escape", "Explorer", "F-150", "Transit", "EcoSport"] },
  { name: "GAC", models: ["GS3", "GS4", "GS8", "Empow", "Trumpchi M8"] },
  { name: "Geely", models: ["Coolray", "Emgrand", "Azkarra", "Okavango", "Tugella"] },
  { name: "Genesis", models: ["G70", "G80", "G90", "GV70", "GV80"] },
  { name: "GMC", models: ["Terrain", "Acadia", "Yukon", "Sierra"] },
  { name: "Great Wall (Haval)", models: ["Haval H6", "Haval Jolion", "Haval H9", "Wingle 7", "Poer"] },
  { name: "Honda", models: ["Civic", "Accord", "CR-V", "HR-V", "Pilot", "City", "Jazz", "Fit"] },
  { name: "Hongqi", models: ["H5", "H9", "HS5", "E-HS9"] },
  { name: "Hyundai", models: ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Kona", "i10", "i20", "Creta", "Palisade"] },
  { name: "Infiniti", models: ["Q50", "QX50", "QX60", "QX80"] },
  { name: "Isuzu", models: ["D-Max", "MU-X", "NPR"] },
  { name: "JAC", models: ["S3", "S7", "T6", "J7"] },
  { name: "Jaguar", models: ["XE", "XF", "F-Pace", "E-Pace", "I-Pace"] },
  { name: "Jeep", models: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Renegade"] },
  { name: "Kia", models: ["Rio", "Cerato", "Optima", "Sportage", "Sorento", "Picanto", "Seltos", "Soul", "Carnival"] },
  { name: "Lamborghini", models: ["Huracan", "Urus", "Revuelto"] },
  { name: "Land Rover", models: ["Defender", "Discovery", "Range Rover", "Range Rover Sport", "Range Rover Evoque"] },
  { name: "Lexus", models: ["IS", "ES", "LS", "NX", "RX", "GX", "LX"] },
  { name: "Li Auto", models: ["L7", "L8", "L9", "MEGA"] },
  { name: "Lincoln", models: ["Navigator", "Aviator", "Corsair", "Nautilus"] },
  { name: "Lynk & Co", models: ["01", "03", "05", "09"] },
  { name: "Maserati", models: ["Ghibli", "Levante", "Quattroporte", "Grecale"] },
  { name: "Mazda", models: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-5", "CX-9", "BT-50"] },
  { name: "Mercedes-Benz", models: ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "Sprinter", "Vito"] },
  { name: "MG (SAIC)", models: ["MG3", "MG5", "ZS", "HS", "RX5", "One"] },
  { name: "Mini", models: ["Cooper", "Countryman", "Clubman"] },
  { name: "Mitsubishi", models: ["Lancer", "Outlander", "Pajero", "Triton", "ASX", "Eclipse Cross"] },
  { name: "Nissan", models: ["Almera", "Sentra", "Altima", "X-Trail", "Qashqai", "Navara", "Patrol", "Micra", "Juke"] },
  { name: "NIO", models: ["ES6", "ES8", "ET5", "ET7", "EC6"] },
  { name: "Opel", models: ["Astra", "Corsa", "Insignia", "Mokka"] },
  { name: "Peugeot", models: ["208", "308", "3008", "5008", "Partner"] },
  { name: "Porsche", models: ["911", "Cayenne", "Macan", "Panamera", "Taycan"] },
  { name: "Ram", models: ["1500", "2500", "ProMaster"] },
  { name: "Renault", models: ["Clio", "Duster", "Kwid", "Koleos", "Logan"] },
  { name: "Rolls-Royce", models: ["Ghost", "Phantom", "Cullinan"] },
  { name: "Seat", models: ["Ibiza", "Leon", "Ateca", "Tarraco"] },
  { name: "Skoda", models: ["Fabia", "Octavia", "Superb", "Kodiaq", "Karoq"] },
  { name: "Subaru", models: ["Impreza", "Legacy", "Forester", "Outback", "XV"] },
  { name: "Suzuki", models: ["Swift", "Vitara", "Baleno", "Jimny", "Ertiga", "Alto"] },
  { name: "Tesla", models: ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"] },
  { name: "Toyota", models: ["Corolla", "Camry", "RAV4", "Highlander", "Land Cruiser", "Hilux", "Hiace", "Fortuner", "Yaris", "Prado"] },
  { name: "Volkswagen", models: ["Polo", "Golf", "Passat", "Tiguan", "Touareg", "Jetta", "Amarok"] },
  { name: "Volvo", models: ["S60", "S90", "XC40", "XC60", "XC90"] },
  { name: "Wuling", models: ["Hongguang Mini EV", "Confero", "Almaz", "Cortez"] },
  { name: "XPeng", models: ["P5", "P7", "G6", "G9"] },
  { name: "Zeekr", models: ["001", "009", "X"] },
];

const BADGE_PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic per-make color so the same make always renders the same badge, without bundling trademarked logo art. */
export function makeBadgeColor(make: string): string {
  return BADGE_PALETTE[hashString(make) % BADGE_PALETTE.length];
}

export function makeInitials(make: string): string {
  const words = make.replace(/[()]/g, "").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
