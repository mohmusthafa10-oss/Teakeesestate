import { Lead, Property } from '../types/crm';
import { formatCurrency } from './formatters';

export interface MatchEvaluation {
  property: Property;
  lead: Lead;
  score: number;
  reasons: string[];
}

const KEYWORD_LIST = [
  'road access',
  'tar road',
  'water',
  'well',
  'electricity',
  'residential',
  'commercial',
  'highway',
  'beach',
  'coastal',
  'corner',
  'boundary',
  'compound wall',
  'quiet',
  'garden',
  'furnished',
  'parking',
  'plantation',
  'rental',
  'investment',
  'school',
  'hospital',
  'town',
];

function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

export function evaluateMatch(lead: Lead, property: Property, currency = '₹'): MatchEvaluation {
  const reasons: string[] = [];
  let score = 0;

  // 1. Property Type & Category alignment
  if (lead.propertyType === 'Any' || lead.propertyType === property.type) {
    score += 22;
    reasons.push(
      lead.propertyType === 'Any'
        ? `Flexible property type (${property.type})`
        : `Exact property type: ${property.type}`
    );
  }
  if (lead.propertyCategory && lead.propertyCategory !== 'Any' && lead.propertyCategory === property.category) {
    score += 6;
    reasons.push(`Category matches ${property.category}`);
  }

  // 2. Location matching (structured locality, panchayath, district + location string)
  const prefLoc = lead.preferredLocation.toLowerCase().trim();
  const propLoc = `${property.location} ${property.locality || ''} ${property.panchayath || ''} ${property.district || ''}`
    .toLowerCase()
    .trim();
  const propDesc = `${property.description} ${property.roadConnectivity || ''} ${property.nearbyLandmarks || ''}`.toLowerCase();
  if (prefLoc) {
    const locParts = prefLoc.split(/[\s,/]+/).filter((p) => p.length > 2);
    const matchedLoc = locParts.find(
      (part) => propLoc.includes(part) || propDesc.includes(part)
    );
    if (matchedLoc) {
      score += 28;
      reasons.push(`Location matches "${property.locality || property.location}"`);
    }
  }

  // 3. Budget fit against expectedPrice / askingPrice
  const effectivePrice = property.expectedPrice || property.askingPrice;
  if (lead.maxBudget > 0) {
    if (effectivePrice >= lead.minBudget && effectivePrice <= lead.maxBudget) {
      score += 28;
      reasons.push(
        `Expected price ${formatCurrency(effectivePrice, currency)} fits within ${formatCurrency(lead.minBudget, currency)}–${formatCurrency(lead.maxBudget, currency)} budget`
      );
    } else if (effectivePrice <= lead.maxBudget * 1.15) {
      score += 14;
      reasons.push(
        `Expected price ${formatCurrency(effectivePrice, currency)} is within 15% negotiation range of max budget`
      );
    }
  }

  // 4. Area / size clue matching from requirement description
  const reqLower = lead.requirementDescription.toLowerCase();
  const areaNums = reqLower.match(/\b\d+\s*(cent|cents|acre|acres|sq\.?ft|sqft)\b/gi);
  if (areaNums && areaNums.length > 0) {
    const unitMatched = areaNums.some((phrase) =>
      phrase.toLowerCase().includes(property.areaUnit.toLowerCase().replace('.', ''))
    );
    if (unitMatched) {
      score += 8;
      reasons.push(`Area size (${property.areaDisplay}) aligns with unit preference`);
    }
  }

  // 5. Requirement keyword matches
  const matchedKeywords = KEYWORD_LIST.filter(
    (kw) => reqLower.includes(kw) && (propDesc.includes(kw) || property.title.toLowerCase().includes(kw))
  );

  if (matchedKeywords.length > 0) {
    score += Math.min(17, matchedKeywords.length * 6);
    reasons.push(`Features matched: ${matchedKeywords.slice(0, 4).join(', ')}`);
  } else {
    // Fallback token overlap
    const reqTokens = new Set(extractTokens(lead.requirementDescription));
    const propTokens = extractTokens(`${property.title} ${property.description}`);
    const common = propTokens.filter(
      (t) =>
        reqTokens.has(t) &&
        !['for', 'and', 'with', 'the', 'looking', 'plot', 'land', 'near', 'around', 'budget'].includes(t)
    );
    const uniqueCommon = Array.from(new Set(common));
    if (uniqueCommon.length > 0) {
      score += Math.min(12, uniqueCommon.length * 4);
      reasons.push(`Requirement keywords matched: ${uniqueCommon.slice(0, 3).join(', ')}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push('General portfolio suggestion based on active inventory');
    score = 15;
  }

  return {
    property,
    lead,
    score: Math.min(100, score),
    reasons,
  };
}

export function findMatchingPropertiesForLead(
  lead: Lead,
  properties: Property[],
  currency = '₹'
): MatchEvaluation[] {
  return properties
    .filter((p) => p.status !== 'Sold' && p.status !== 'Inactive')
    .map((p) => evaluateMatch(lead, p, currency))
    .sort((a, b) => b.score - a.score);
}

export function findMatchingLeadsForProperty(
  property: Property,
  leads: Lead[],
  currency = '₹'
): MatchEvaluation[] {
  return leads
    .filter((l) => l.status !== 'Converted' && l.status !== 'Lost')
    .map((l) => evaluateMatch(l, property, currency))
    .sort((a, b) => b.score - a.score);
}
