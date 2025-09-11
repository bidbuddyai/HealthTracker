import { ObjectStorageService } from "./objectStorage";

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  category: "project_details" | "schedule" | "specifications" | "constraints" | "dates" | "scope" | "other";
  tokens: number;
  keywords: string[];
  isSelected: boolean;
}

export interface DocumentAnalysis {
  fileName: string;
  filePath: string;
  totalSize: number;
  totalTokens: number;
  sections: DocumentSection[];
  keyInformation: {
    contractDuration?: string;
    projectType?: string;
    startDate?: string;
    endDate?: string;
    milestones: string[];
    constraints: string[];
  };
  processingOptions: {
    quick: { tokens: number; cost: number; description: string };
    standard: { tokens: number; cost: number; description: string };
    deep: { tokens: number; cost: number; description: string };
  };
}

export interface ProcessingOptions {
  mode: "quick" | "standard" | "deep" | "custom";
  selectedSections?: string[]; // section IDs for custom mode
  maxTokens?: number;
}

// Keywords for different content categories
const CATEGORY_KEYWORDS = {
  project_details: [
    "project name", "project description", "scope", "overview", "summary",
    "client", "contractor", "owner", "architect", "engineer"
  ],
  schedule: [
    "schedule", "timeline", "duration", "completion", "milestone", "phase",
    "critical path", "gantt", "calendar", "working days", "substantial completion"
  ],
  specifications: [
    "specification", "technical", "materials", "equipment", "installation",
    "quality", "performance", "standard", "code", "requirement"
  ],
  constraints: [
    "constraint", "restriction", "limitation", "weather", "permit", "access",
    "safety", "environmental", "noise", "hours", "season"
  ],
  dates: [
    "date", "deadline", "completion", "start", "finish", "notice to proceed",
    "ntp", "substantial completion", "final completion", "milestone"
  ],
  scope: [
    "work", "activity", "task", "demolition", "construction", "installation",
    "excavation", "foundation", "structure", "mechanical", "electrical"
  ]
};

// Estimate tokens (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Estimate cost based on model (simplified pricing)
function estimateCost(tokens: number, model: string = "Claude-Sonnet-4"): number {
  const pricePerMillionTokens = {
    "Claude-Sonnet-4": 3.0,
    "Claude-3-Haiku": 0.25,
    "Claude-3-Opus": 15.0,
    "GPT-4o": 5.0,
    "GPT-4-Turbo": 10.0,
    "GPT-3.5-Turbo": 1.0,
    "Gemini-2.5-Pro": 1.25
  };
  
  const price = pricePerMillionTokens[model as keyof typeof pricePerMillionTokens] || 3.0;
  return (tokens / 1000000) * price;
}

// Extract key information using pattern matching
function extractKeyInformation(content: string): DocumentAnalysis['keyInformation'] {
  const info: DocumentAnalysis['keyInformation'] = {
    milestones: [],
    constraints: []
  };

  // Contract duration patterns
  const durationPatterns = [
    /(\d+)\s*(?:calendar\s*)?days?/gi,
    /(\d+)\s*working\s*days?/gi,
    /(\d+)\s*months?/gi,
    /substantial\s*completion.*?(\d+.*?days?)/gi,
    /contract\s*time.*?(\d+.*?days?)/gi
  ];

  for (const pattern of durationPatterns) {
    const match = content.match(pattern);
    if (match) {
      info.contractDuration = match[0];
      break;
    }
  }

  // Project type patterns
  const typePatterns = [
    /residential/gi,
    /commercial/gi,
    /industrial/gi,
    /infrastructure/gi,
    /renovation/gi,
    /new\s*construction/gi
  ];

  for (const pattern of typePatterns) {
    if (pattern.test(content)) {
      info.projectType = content.match(pattern)?.[0].toLowerCase();
      break;
    }
  }

  // Date patterns - using exec() to properly capture groups
  const startDatePattern = /(?:start|begin|commence).*?(\d{1,2}\/\d{1,2}\/\d{4})/gi;
  const endDatePattern = /(?:complete|finish|end).*?(\d{1,2}\/\d{1,2}\/\d{4})/gi;
  const ntpPattern = /notice\s*to\s*proceed.*?(\d{1,2}\/\d{1,2}\/\d{4})/gi;

  // Extract start date
  const startMatch = startDatePattern.exec(content);
  if (startMatch && startMatch[1]) {
    info.startDate = startMatch[1];
  }

  // Extract end date
  const endMatch = endDatePattern.exec(content);
  if (endMatch && endMatch[1]) {
    info.endDate = endMatch[1];
  }

  // If no start date found, try NTP pattern
  if (!info.startDate) {
    const ntpMatch = ntpPattern.exec(content);
    if (ntpMatch && ntpMatch[1]) {
      info.startDate = ntpMatch[1];
    }
  }

  // Milestones - handling both capture groups and simple matches
  const milestonePatterns = [
    { pattern: /milestone.*?:.*?(.+)/gi, hasCapture: true },
    { pattern: /substantial\s*completion/gi, hasCapture: false },
    { pattern: /final\s*completion/gi, hasCapture: false },
    { pattern: /phase\s*\d+.*?completion/gi, hasCapture: false }
  ];

  for (const { pattern, hasCapture } of milestonePatterns) {
    if (hasCapture) {
      // Use exec for patterns with capture groups
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
          info.milestones.push(match[1].trim());
        }
      }
    } else {
      // Use match for simple patterns
      const matches = content.match(pattern);
      if (matches) {
        info.milestones.push(...matches.map(m => m.trim()));
      }
    }
  }

  // Constraints - handling both capture groups and simple matches
  const constraintPatterns = [
    { pattern: /weather.*?restriction/gi, hasCapture: false },
    { pattern: /permit.*?required/gi, hasCapture: false },
    { pattern: /noise.*?restriction/gi, hasCapture: false },
    { pattern: /working\s*hours.*?(\d+.*?\d+)/gi, hasCapture: true },
    { pattern: /seasonal.*?restriction/gi, hasCapture: false }
  ];

  for (const { pattern, hasCapture } of constraintPatterns) {
    if (hasCapture) {
      // Use exec for patterns with capture groups
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
          info.constraints.push(`Working hours: ${match[1].trim()}`);
        }
      }
    } else {
      // Use match for simple patterns
      const matches = content.match(pattern);
      if (matches) {
        info.constraints.push(...matches.map(m => m.trim()));
      }
    }
  }

  return info;
}

// Calculate relevance score for a text section
function calculateRelevanceScore(text: string): number {
  let score = 0;
  const lowerText = text.toLowerCase();

  // High relevance keywords (schedule/project specific)
  const highValueKeywords = [
    "schedule", "duration", "milestone", "critical path", "completion",
    "activity", "task", "precedence", "logic", "relationship", "constraint"
  ];

  const mediumValueKeywords = [
    "project", "work", "scope", "phase", "contract", "deadline", "start", "finish"
  ];

  // Count keyword matches
  highValueKeywords.forEach(keyword => {
    const matches = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
    score += matches * 3;
  });

  mediumValueKeywords.forEach(keyword => {
    const matches = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
    score += matches * 1;
  });

  // Bonus for date patterns
  const datePattern = /\d{1,2}\/\d{1,2}\/\d{4}/g;
  const dateMatches = (text.match(datePattern) || []).length;
  score += dateMatches * 2;

  // Bonus for numeric patterns (durations, quantities)
  const numericPattern = /\d+\s*(?:days?|weeks?|months?|hours?)/gi;
  const numericMatches = (text.match(numericPattern) || []).length;
  score += numericMatches * 2;

  // Normalize score (0-100)
  return Math.min(100, score);
}

// Categorize content based on keywords
function categorizeContent(text: string): DocumentSection['category'] {
  const lowerText = text.toLowerCase();
  let maxScore = 0;
  let bestCategory: DocumentSection['category'] = "other";

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        score += 1;
      }
    });

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category as DocumentSection['category'];
    }
  }

  return bestCategory;
}

// Extract keywords from text
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);

  const frequency: { [key: string]: number } = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

// Split document into logical sections
function splitIntoSections(content: string, fileName: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  
  // Try to split by common section patterns
  const sectionPatterns = [
    /^[\d.]+\s+[A-Z][^\.]*$/gm, // "1.1 SECTION TITLE"
    /^[A-Z\s]{3,}$/gm, // "GENERAL CONDITIONS"
    /^\s*SECTION\s+\d+/gm, // "SECTION 01"
    /^\s*PART\s+\d+/gm, // "PART 1"
    /^\s*CHAPTER\s+\d+/gm, // "CHAPTER 1"
  ];

  let splitContent = content;
  let sectionSplits: string[] = [];

  // Try each pattern
  for (const pattern of sectionPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 2) {
      sectionSplits = content.split(pattern);
      break;
    }
  }

  // If no clear sections found, split by length
  if (sectionSplits.length <= 1) {
    const chunkSize = 2000; // characters per section
    sectionSplits = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      sectionSplits.push(content.slice(i, i + chunkSize));
    }
  }

  // Process each section
  sectionSplits.forEach((sectionContent, index) => {
    if (sectionContent.trim().length < 100) return; // Skip very small sections

    const relevanceScore = calculateRelevanceScore(sectionContent);
    const category = categorizeContent(sectionContent);
    const tokens = estimateTokens(sectionContent);
    const keywords = extractKeywords(sectionContent);

    // Generate section title
    const firstLine = sectionContent.split('\n')[0].trim();
    const title = firstLine.length > 50 
      ? `${firstLine.substring(0, 47)}...`
      : firstLine || `Section ${index + 1}`;

    sections.push({
      id: `${fileName}-section-${index}`,
      title,
      content: sectionContent,
      relevanceScore,
      category,
      tokens,
      keywords,
      isSelected: relevanceScore > 20 // Auto-select highly relevant sections
    });
  });

  return sections.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Main document analysis function
export async function analyzeDocument(filePath: string): Promise<DocumentAnalysis> {
  const objectStorage = new ObjectStorageService();
  const content = await objectStorage.readObjectContent(filePath);
  const fileName = filePath.split('/').pop() || filePath;
  const totalSize = content.length;
  const totalTokens = estimateTokens(content);

  console.log(`Analyzing document: ${fileName}`);
  console.log(`File size: ${totalSize.toLocaleString()} characters`);
  console.log(`Estimated tokens: ${totalTokens.toLocaleString()}`);

  const sections = splitIntoSections(content, fileName);
  const keyInformation = extractKeyInformation(content);

  // Calculate processing options
  const highRelevanceSections = sections.filter(s => s.relevanceScore > 50);
  const mediumRelevanceSections = sections.filter(s => s.relevanceScore > 20 && s.relevanceScore <= 50);
  const selectedSections = sections.filter(s => s.isSelected);

  const quickTokens = highRelevanceSections.reduce((sum, s) => sum + s.tokens, 0);
  const standardTokens = selectedSections.reduce((sum, s) => sum + s.tokens, 0);
  const deepTokens = totalTokens;

  const processingOptions = {
    quick: {
      tokens: quickTokens,
      cost: estimateCost(quickTokens),
      description: `High relevance sections only (${highRelevanceSections.length} sections)`
    },
    standard: {
      tokens: standardTokens,
      cost: estimateCost(standardTokens),
      description: `Auto-selected relevant sections (${selectedSections.length} sections)`
    },
    deep: {
      tokens: deepTokens,
      cost: estimateCost(deepTokens),
      description: `Complete document analysis (all content)`
    }
  };

  return {
    fileName,
    filePath,
    totalSize,
    totalTokens,
    sections,
    keyInformation,
    processingOptions
  };
}

// Process content based on selected options
export function processContentWithOptions(
  analysis: DocumentAnalysis, 
  options: ProcessingOptions
): string {
  let contentToProcess = '';

  switch (options.mode) {
    case 'quick':
      const quickSections = analysis.sections.filter(s => s.relevanceScore > 50);
      contentToProcess = quickSections.map(s => s.content).join('\n\n');
      break;

    case 'standard':
      const standardSections = analysis.sections.filter(s => s.isSelected);
      contentToProcess = standardSections.map(s => s.content).join('\n\n');
      break;

    case 'deep':
      contentToProcess = analysis.sections.map(s => s.content).join('\n\n');
      break;

    case 'custom':
      const customSections = analysis.sections.filter(s => 
        options.selectedSections?.includes(s.id)
      );
      contentToProcess = customSections.map(s => s.content).join('\n\n');
      break;
  }

  // Apply token limit if specified
  if (options.maxTokens && estimateTokens(contentToProcess) > options.maxTokens) {
    const words = contentToProcess.split(' ');
    const targetWords = Math.floor(options.maxTokens * 0.75); // Leave some buffer
    contentToProcess = words.slice(0, targetWords).join(' ') + '... [Content truncated to fit token limit]';
  }

  return contentToProcess;
}

// Analyze multiple documents
export async function analyzeDocuments(filePaths: string[]): Promise<DocumentAnalysis[]> {
  const analyses: DocumentAnalysis[] = [];
  
  for (const filePath of filePaths) {
    try {
      const analysis = await analyzeDocument(filePath);
      analyses.push(analysis);
    } catch (error) {
      console.error(`Failed to analyze document ${filePath}:`, error);
      // Create a basic analysis for failed documents
      analyses.push({
        fileName: filePath.split('/').pop() || filePath,
        filePath,
        totalSize: 0,
        totalTokens: 0,
        sections: [],
        keyInformation: { milestones: [], constraints: [] },
        processingOptions: {
          quick: { tokens: 0, cost: 0, description: "Analysis failed" },
          standard: { tokens: 0, cost: 0, description: "Analysis failed" },
          deep: { tokens: 0, cost: 0, description: "Analysis failed" }
        }
      });
    }
  }

  return analyses;
}