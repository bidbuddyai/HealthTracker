import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Calendar, GitBranch, Upload, FileText, Save, FolderOpen, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ScheduleEditor, { type Activity } from "./ScheduleEditor";
import { ObjectUploader } from "./ObjectUploader";
import type { UploadResult } from "@uppy/core";

interface InteractiveScheduleCreatorProps {
  projectId: string;
  onScheduleCreated?: (scheduleId: string) => void;
}

// Comprehensive list of latest Poe API models (2025)
interface ModelInfo {
  value: string;
  label: string;
  category: string;
  description: string;
  contextLength: string;
  speed: 'Fast' | 'Medium' | 'Slow';
  quality: 'Good' | 'High' | 'Excellent';
  cost: 'Low' | 'Medium' | 'High';
  recommended?: boolean;
}

const POE_MODELS: ModelInfo[] = [
  // Latest GPT Models (OpenAI)
  { 
    value: "GPT-5", 
    label: "GPT-5 (Latest Flagship)", 
    category: "GPT", 
    description: "OpenAI's newest flagship model with enhanced reasoning and coding capabilities",
    contextLength: "128K",
    speed: "Medium",
    quality: "Excellent",
    cost: "High",
    recommended: true
  },
  { 
    value: "ChatGPT-5", 
    label: "ChatGPT-5 (GPT-5 Snapshot)", 
    category: "GPT", 
    description: "GPT-5 version optimized for conversational AI with latest training",
    contextLength: "128K",
    speed: "Medium",
    quality: "Excellent",
    cost: "High"
  },
  { 
    value: "GPT-5-mini", 
    label: "GPT-5 Mini (Fast & Smart)", 
    category: "GPT", 
    description: "Smaller, faster GPT-5 variant matching GPT-4.1 performance at lower cost",
    contextLength: "128K",
    speed: "Fast",
    quality: "High",
    cost: "Medium",
    recommended: true
  },
  { 
    value: "GPT-4.1", 
    label: "GPT-4.1 (Improved Coding)", 
    category: "GPT", 
    description: "Enhanced GPT-4 with improved coding capabilities and 400K context window",
    contextLength: "400K",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  },
  { 
    value: "GPT-4o", 
    label: "GPT-4o (Vision Enabled)", 
    category: "GPT", 
    description: "Multimodal model with vision capabilities and strong reasoning",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  },
  { 
    value: "GPT-4o-mini", 
    label: "GPT-4o Mini (Budget Option)", 
    category: "GPT", 
    description: "Smaller version of GPT-4o, cost-effective for simple tasks",
    contextLength: "128K",
    speed: "Fast",
    quality: "Good",
    cost: "Low"
  },

  // Advanced Reasoning Models
  { 
    value: "o3-pro", 
    label: "o3 Pro (Advanced Reasoning)", 
    category: "Reasoning", 
    description: "OpenAI's latest reasoning model for complex problem-solving",
    contextLength: "200K",
    speed: "Slow",
    quality: "Excellent",
    cost: "High",
    recommended: true
  },
  { 
    value: "o4-mini-deep", 
    label: "o4 Mini Deep (Latest Reasoning)", 
    category: "Reasoning", 
    description: "Latest reasoning variant with enhanced deep thinking capabilities",
    contextLength: "200K",
    speed: "Medium",
    quality: "Excellent",
    cost: "High"
  },

  // Claude Models (Anthropic)
  { 
    value: "Claude-Opus-4.1", 
    label: "Claude Opus 4.1 (Latest Flagship)", 
    category: "Claude", 
    description: "Anthropic's most powerful model with 200K context and exceptional reasoning",
    contextLength: "200K",
    speed: "Slow",
    quality: "Excellent",
    cost: "High",
    recommended: true
  },
  { 
    value: "Claude-Sonnet-4", 
    label: "Claude Sonnet 4 (Best Balance)", 
    category: "Claude", 
    description: "High-performance model balancing quality and speed for professional work",
    contextLength: "200K",
    speed: "Medium",
    quality: "Excellent",
    cost: "Medium",
    recommended: true
  },
  { 
    value: "Claude-3.7-Sonnet", 
    label: "Claude 3.7 Sonnet (Hybrid Reasoning)", 
    category: "Claude", 
    description: "Feb 2025 hybrid model combining reasoning with fast response times",
    contextLength: "200K",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  },
  { 
    value: "Claude-3.5-Sonnet", 
    label: "Claude 3.5 Sonnet (Proven)", 
    category: "Claude", 
    description: "Reliable previous generation model with strong coding capabilities",
    contextLength: "200K",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  },

  // Google Gemini Models
  { 
    value: "Gemini-2.5-Pro", 
    label: "Gemini 2.5 Pro (1M Context + Web)", 
    category: "Gemini", 
    description: "Google's flagship with massive 1M token context and web search integration",
    contextLength: "1M",
    speed: "Medium",
    quality: "Excellent",
    cost: "High",
    recommended: true
  },
  { 
    value: "Gemini-2.5-Flash", 
    label: "Gemini 2.5 Flash (Fast Pro)", 
    category: "Gemini", 
    description: "Faster variant of 2.5 Pro with reduced latency",
    contextLength: "1M",
    speed: "Fast",
    quality: "High",
    cost: "Medium"
  },
  { 
    value: "Gemini-2.0-Flash", 
    label: "Gemini 2.0 Flash", 
    category: "Gemini", 
    description: "Latest 2.0 generation with improved performance",
    contextLength: "1M",
    speed: "Fast",
    quality: "High",
    cost: "Medium"
  },

  // Other Leading Models
  { 
    value: "Grok-4", 
    label: "Grok 4 (xAI Latest)", 
    category: "Other", 
    description: "xAI's latest reasoning model with real-time information access",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  },
  { 
    value: "DeepSeek-R1", 
    label: "DeepSeek R1 (Open Reasoning)", 
    category: "Other", 
    description: "Open-source reasoning model with strong mathematical capabilities",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Low",
    recommended: true
  },
  { 
    value: "DeepSeek-V3-FW", 
    label: "DeepSeek V3-FW", 
    category: "Other", 
    description: "Latest DeepSeek variant with enhanced capabilities",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Low"
  },
  { 
    value: "Llama-4-Maverick", 
    label: "Llama 4 Maverick (Meta Latest)", 
    category: "Other", 
    description: "Meta's newest flagship model with advanced reasoning",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Low"
  },
  { 
    value: "Llama-3.1-405B", 
    label: "Llama 3.1 405B (Free & Powerful)", 
    category: "Other", 
    description: "Large open-source model, excellent for complex tasks at no cost",
    contextLength: "128K",
    speed: "Slow",
    quality: "High",
    cost: "Low",
    recommended: true
  },
  { 
    value: "Qwen-3-235B-T", 
    label: "Qwen 3 235B-T (Alibaba)", 
    category: "Other", 
    description: "Alibaba's flagship model with strong multilingual capabilities",
    contextLength: "128K",
    speed: "Medium",
    quality: "High",
    cost: "Low"
  },
  { 
    value: "Kimi-K2", 
    label: "Kimi K2 (Large Context)", 
    category: "Other", 
    description: "Specialized model with very large context window for document analysis",
    contextLength: "2M",
    speed: "Medium",
    quality: "High",
    cost: "Medium"
  }
];

export default function InteractiveScheduleCreator({ projectId, onScheduleCreated }: InteractiveScheduleCreatorProps) {
  const { toast } = useToast();
  const [projectDescription, setProjectDescription] = useState("");
  const [userRequest, setUserRequest] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [projectStartDate, setProjectStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  // Load model preference from localStorage or default to Claude-Sonnet-4
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('schedulesam-preferred-model') || "Claude-Sonnet-4";
    }
    return "Claude-Sonnet-4";
  });

  // Save model selection to localStorage
  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('schedulesam-preferred-model', value);
    }
  };
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  
  // Generate schedule with AI
  const generateScheduleMutation = useMutation({
    mutationFn: async (type: 'create' | 'update' | 'lookahead') => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/schedules/generate-ai`, {
        type,
        projectDescription,
        currentActivities: activities,
        userRequest,
        startDate: projectStartDate,
        uploadedFiles,
        model: selectedModel
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.activities && data.activities.length > 0) {
        setActivities(data.activities);
        toast({
          title: "Schedule generated",
          description: `Created ${data.activities.length} activities with CPM calculations.`,
        });
      }
      if (data.schedule?.id) {
        onScheduleCreated?.(data.schedule.id);
      }
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Failed to generate schedule. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Query for existing schedules
  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/schedules`],
    enabled: showLoadDialog
  });
  
  // Save schedule to database
  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/schedules/save`, {
        name: scheduleName || "Untitled Schedule",
        activities: activities,
        startDate: projectStartDate,
        notes: scheduleNotes
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Schedule saved",
        description: `Successfully saved schedule with ${data.activitiesCount} activities.`,
      });
      if (data.schedule?.id) {
        onScheduleCreated?.(data.schedule.id);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedules`] });
      setShowSaveDialog(false);
      setScheduleName("");
      setScheduleNotes("");
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Failed to save schedule. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Load schedule from database
  const loadScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await apiRequest("GET", `/api/schedules/${scheduleId}/activities`);
      return response.json();
    },
    onSuccess: (data) => {
      // Transform database activities to editor format
      const transformedActivities: Activity[] = data.map((act: any) => ({
        activityId: act.activityId,
        activityName: act.activityName,
        duration: act.originalDuration || 0,
        startDate: act.startDate || "",
        finishDate: act.finishDate || "",
        predecessors: act.predecessors ? act.predecessors.split(',').filter((p: string) => p) : [],
        successors: act.successors ? act.successors.split(',').filter((s: string) => s) : [],
        percentComplete: act.remainingDuration && act.originalDuration 
          ? Math.round((1 - act.remainingDuration / act.originalDuration) * 100)
          : 0,
        totalFloat: act.totalFloat || 0,
        isCritical: act.totalFloat === 0,
        status: act.status || "Not Started",
        wbs: act.notes || ""
      }));
      
      setActivities(transformedActivities);
      setShowLoadDialog(false);
      toast({
        title: "Schedule loaded",
        description: `Loaded ${transformedActivities.length} activities from saved schedule.`,
      });
    },
    onError: () => {
      toast({
        title: "Load failed",
        description: "Failed to load schedule. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const handleGenerateSchedule = async () => {
    if (!projectDescription.trim()) {
      toast({
        title: "Description required",
        description: "Please provide a project description.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGenerating(true);
    setGenerationProgress("Initializing AI analysis...");
    
    // Set progress updates
    const progressTimer1 = setTimeout(() => {
      if (isGenerating) {
        setGenerationProgress("Analyzing uploaded documents (this may take 30-60 seconds)...");
      }
    }, 5000);
    
    const progressTimer2 = setTimeout(() => {
      if (isGenerating) {
        setGenerationProgress("Building CPM schedule with dependencies...");
      }
    }, 20000);
    
    const progressTimer3 = setTimeout(() => {
      if (isGenerating) {
        setGenerationProgress("Finalizing schedule and calculating critical path...");
      }
    }, 35000);
    
    try {
      await generateScheduleMutation.mutateAsync('create');
    } finally {
      setIsGenerating(false);
      setGenerationProgress("");
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      clearTimeout(progressTimer3);
    }
  };
  
  const handleUpdateSchedule = async () => {
    if (!userRequest.trim()) {
      toast({
        title: "Request required",
        description: "Please describe what changes you want to make.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGenerating(true);
    try {
      await generateScheduleMutation.mutateAsync('update');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleGenerateLookahead = async () => {
    if (activities.length === 0) {
      toast({
        title: "No schedule",
        description: "Please create a schedule first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", `/api/projects/${projectId}/schedules/generate-lookahead-ai`, {
        currentActivities: activities,
        startDate: projectStartDate
      });
      const data = await response.json();
      
      toast({
        title: "Lookahead generated",
        description: `Created 3-week lookahead with ${data.activities?.length || 0} activities.`,
      });
      
      if (data.lookahead?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      }
    } catch (error) {
      toast({
        title: "Generation failed",
        description: "Failed to generate lookahead.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const examplePrompts = [
    "Create a 6-month demolition schedule for a 5-story office building including asbestos abatement",
    "Add interior demolition activities with 2-week durations for each floor",
    "Update all foundation activities to 50% complete",
    "Add weather delays to all exterior activities",
    "Create a detailed schedule for bridge demolition with traffic control",
    "Add inspection milestones after each major phase"
  ];
  
  return (
    <div className="space-y-6">
      {/* AI Schedule Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Schedule Creator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activities.length === 0 ? (
            <>
              <div>
                <Label htmlFor="project-desc">Project Description</Label>
                <Textarea
                  id="project-desc"
                  placeholder="Describe your project... e.g., '5-story office building demolition with asbestos abatement, 6-month timeline, downtown location'"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Project Start Date</Label>
                  <input
                    id="start-date"
                    type="date"
                    value={projectStartDate}
                    onChange={(e) => setProjectStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div>
                  <Label htmlFor="ai-model">AI Model</Label>
                  <Select value={selectedModel} onValueChange={handleModelChange} data-testid="select-ai-model">
                    <SelectTrigger id="ai-model">
                      <SelectValue placeholder="Select AI model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[400px] overflow-y-auto">
                      {/* Recommended Models */}
                      <div className="font-semibold text-xs text-green-600 px-2 py-1 sticky top-0 bg-white border-b">⭐ Recommended Models</div>
                      {POE_MODELS.filter(m => m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value} className="relative">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* GPT Models */}
                      <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2 sticky top-0 bg-white border-b">🤖 GPT Models (OpenAI)</div>
                      {POE_MODELS.filter(m => m.category === "GPT" && !m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Reasoning Models */}
                      <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2 sticky top-0 bg-white border-b">🧠 Advanced Reasoning Models</div>
                      {POE_MODELS.filter(m => m.category === "Reasoning" && !m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Claude Models */}
                      <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2 sticky top-0 bg-white border-b">🎭 Claude Models (Anthropic)</div>
                      {POE_MODELS.filter(m => m.category === "Claude" && !m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Gemini Models */}
                      <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2 sticky top-0 bg-white border-b">💎 Gemini Models (Google)</div>
                      {POE_MODELS.filter(m => m.category === "Gemini" && !m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Other Models */}
                      <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2 sticky top-0 bg-white border-b">🚀 Other Leading Models</div>
                      {POE_MODELS.filter(m => m.category === "Other" && !m.recommended).map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.speed === 'Fast' ? 'bg-green-100 text-green-700' :
                                  model.speed === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.speed}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  model.cost === 'Low' ? 'bg-green-100 text-green-700' :
                                  model.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{model.cost} Cost</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Example Prompts:</Label>
                <div className="grid gap-2">
                  {examplePrompts.slice(0, 3).map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setProjectDescription(prompt)}
                      className="text-left p-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <Label>Upload Documents (Optional)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <ObjectUploader
                    maxNumberOfFiles={5}
                    maxFileSize={10 * 1024 * 1024} // 10MB
                    onGetUploadParameters={async () => {
                      const response = await fetch('/api/objects/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      });
                      const data = await response.json();
                      return {
                        method: 'PUT' as const,
                        url: data.uploadURL,
                      };
                    }}
                    onComplete={async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
                      if (result.successful && result.successful.length > 0) {
                        const newFiles: string[] = [];
                        const newFileNames: string[] = [];
                        
                        for (const file of result.successful) {
                          const uploadURL = file.uploadURL as string;
                          if (uploadURL) {
                            // Finalize the upload
                            const response = await fetch('/api/objects/finalize', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ uploadURL }),
                            });
                            const data = await response.json();
                            newFiles.push(data.objectPath);
                            newFileNames.push(file.name || 'Unknown File');
                          }
                        }
                        
                        setUploadedFiles(prev => [...prev, ...newFiles]);
                        setUploadedFileNames(prev => [...prev, ...newFileNames]);
                        
                        toast({
                          title: "Files uploaded",
                          description: `Successfully uploaded ${result.successful.length} file(s)`,
                        });
                      }
                    }}
                    buttonClassName="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Plans/Specs/Documents
                  </ObjectUploader>
                </div>
                {uploadedFileNames.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-gray-600">Uploaded files:</div>
                    {uploadedFileNames.map((name, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span>{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {uploadedFileNames.length > 0 && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription className="text-sm">
                    <strong>Note:</strong> AI analysis of {uploadedFileNames.length} document(s) may take 30-60 seconds using {POE_MODELS.find(m => m.value === selectedModel)?.label || selectedModel} for accurate results.
                  </AlertDescription>
                </Alert>
              )}
              
              {isGenerating && generationProgress && (
                <Alert className="bg-amber-50 border-amber-200">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  <AlertDescription className="text-sm inline">
                    {generationProgress}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleGenerateSchedule}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {generationProgress || "Generating CPM Schedule..."}
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      Generate CPM Schedule
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={() => setShowLoadDialog(true)}
                  variant="outline"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load Existing
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert>
                <GitBranch className="h-4 w-4" />
                <AlertDescription>
                  Schedule created with {activities.length} activities. 
                  Critical path has {activities.filter(a => a.isCritical).length} activities.
                  You can now edit manually or use AI to update.
                </AlertDescription>
              </Alert>
              
              <div>
                <Label htmlFor="update-request">Update Request</Label>
                <Textarea
                  id="update-request"
                  placeholder="Describe changes... e.g., 'Add 5 days to all demolition activities' or 'Update foundation work to 75% complete'"
                  value={userRequest}
                  onChange={(e) => setUserRequest(e.target.value)}
                  rows={2}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleUpdateSchedule}
                  disabled={isGenerating}
                  variant="outline"
                  className="flex-1"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Update with AI
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={handleGenerateLookahead}
                  disabled={isGenerating}
                  variant="outline"
                  className="flex-1"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      Generate 3-Week Lookahead
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={() => setShowLoadDialog(true)}
                  variant="outline"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load
                </Button>
                
                <Button 
                  onClick={() => {
                    setActivities([]);
                    setProjectDescription("");
                    setUserRequest("");
                    setUploadedFiles([]);
                    setUploadedFileNames([]);
                  }}
                  variant="ghost"
                >
                  Start Over
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Schedule Editor */}
      {activities.length > 0 && (
        <ScheduleEditor
          activities={activities}
          onActivitiesChange={setActivities}
          projectStartDate={projectStartDate}
          onSave={() => {
            setScheduleName(projectDescription || "CPM Schedule");
            setScheduleNotes(`Generated with AI (${selectedModel}). ${uploadedFileNames.length > 0 ? `Based on ${uploadedFileNames.length} uploaded document(s).` : ''}`);
            setShowSaveDialog(true);
          }}
        />
      )}
      
      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Schedule</DialogTitle>
            <DialogDescription>
              Save this schedule to the database for future reference and editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="schedule-name">Schedule Name</Label>
              <Input
                id="schedule-name"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="Enter schedule name..."
              />
            </div>
            <div>
              <Label htmlFor="schedule-notes">Notes (Optional)</Label>
              <Textarea
                id="schedule-notes"
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="Add any notes about this schedule..."
                rows={3}
              />
            </div>
            <Alert>
              <AlertDescription>
                This will save {activities.length} activities with their dependencies and CPM calculations.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => saveScheduleMutation.mutate()}
              disabled={saveScheduleMutation.isPending || !scheduleName.trim()}
            >
              {saveScheduleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Load Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Schedule</DialogTitle>
            <DialogDescription>
              Select a previously saved schedule to load and edit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {schedules.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No saved schedules found. Create and save a schedule first.
                </AlertDescription>
              </Alert>
            ) : (
              schedules.map((schedule: any) => (
                <Card 
                  key={schedule.id} 
                  className={`cursor-pointer hover:bg-gray-50 ${selectedScheduleId === schedule.id ? 'ring-2 ring-orange-500' : ''}`}
                  onClick={() => setSelectedScheduleId(schedule.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{schedule.notes || "Untitled Schedule"}</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>Data Date: {schedule.dataDate}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3" />
                            <span>Created: {new Date(schedule.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded">
                          {schedule.scheduleType}
                        </span>
                        <div className="text-sm text-gray-500 mt-1">
                          Version {schedule.version}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoadDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedScheduleId) {
                  loadScheduleMutation.mutate(selectedScheduleId);
                }
              }}
              disabled={loadScheduleMutation.isPending || !selectedScheduleId}
            >
              {loadScheduleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}