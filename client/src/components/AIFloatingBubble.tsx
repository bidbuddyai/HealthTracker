import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Sparkles, 
  Bot, 
  X, 
  Upload, 
  FileText, 
  Loader2, 
  Send,
  Minimize2,
  Maximize2,
  Calendar,
  GitBranch,
  Download,
  MessageCircle,
  AlertCircle,
  CheckCircle,
  Link2,
  Info,
  User,
  RefreshCw,
  Wand2,
  Clock,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "./ObjectUploader";
import type { UploadResult } from "@uppy/core";
import ScheduleEditor, { type Activity } from "./ScheduleEditor";
import { motion, AnimatePresence } from "framer-motion";

// Document analysis interfaces
interface DocumentSection {
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  category: "project_details" | "schedule" | "specifications" | "constraints" | "dates" | "scope" | "other";
  tokens: number;
  keywords: string[];
  isSelected: boolean;
}

interface DocumentAnalysis {
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

type ProcessingMode = "quick" | "standard" | "deep" | "custom";

interface AIFloatingBubbleProps {
  projectId: string;
  defaultOpen?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  activities?: Activity[];
  metadata?: {
    activitiesGenerated?: number;
    relationshipsCreated?: number;
    criticalPath?: string[];
    contractDuration?: number;
    extractedDates?: { start?: string; end?: string };
  };
}

// Available models from Poe's OpenAI-compatible API
const POE_MODELS = [
  // Claude Models
  { value: "Claude-Sonnet-4", label: "Claude Sonnet 4 (Best Overall)", category: "Claude" },
  { value: "Claude-3-Haiku", label: "Claude 3 Haiku (Fast)", category: "Claude" },
  { value: "Claude-3-Opus", label: "Claude 3 Opus (Advanced)", category: "Claude" },
  { value: "Claude-3.5-Sonnet", label: "Claude 3.5 Sonnet", category: "Claude" },
  
  // GPT Models
  { value: "GPT-5", label: "GPT-5 (Latest)", category: "GPT" },
  { value: "GPT-4o", label: "GPT-4o (Optimized)", category: "GPT" },
  { value: "GPT-4-Turbo", label: "GPT-4 Turbo", category: "GPT" },
  { value: "GPT-3.5-Turbo", label: "GPT-3.5 Turbo (Fast)", category: "GPT" },
  
  // Google Models
  { value: "Gemini-2.5-Pro", label: "Gemini 2.5 Pro (1M context)", category: "Google" },
  { value: "Gemini-1.5-Pro", label: "Gemini 1.5 Pro", category: "Google" },
  { value: "Gemini-Pro", label: "Gemini Pro", category: "Google" },
  
  // Reasoning Models
  { value: "o3-pro", label: "o3 Pro (Advanced Reasoning)", category: "Reasoning" },
  { value: "o1-preview", label: "o1 Preview (Reasoning)", category: "Reasoning" },
  { value: "o1-mini", label: "o1 Mini (Fast Reasoning)", category: "Reasoning" },
  
  // Other Models
  { value: "Grok-4", label: "Grok 4 (xAI)", category: "Other" },
  { value: "Llama-3.1-405B", label: "Llama 3.1 405B", category: "Other" },
  { value: "Llama-3.1-70B", label: "Llama 3.1 70B", category: "Other" },
  { value: "Mixtral-8x7B", label: "Mixtral 8x7B", category: "Other" },
  { value: "DeepSeek-V3", label: "DeepSeek V3", category: "Other" },
];

export default function AIFloatingBubble({ projectId, defaultOpen = false }: AIFloatingBubbleProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMiniChat, setIsMiniChat] = useState(false); // New state for mini chat mode
  const [activeTab, setActiveTab] = useState("chat");
  const [selectedModel, setSelectedModel] = useState("Claude-Sonnet-4");
  const [projectDescription, setProjectDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [generatedActivities, setGeneratedActivities] = useState<Activity[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isQuickGenerateDragOver, setIsQuickGenerateDragOver] = useState(false);
  
  // Document processing states
  const [documentAnalyses, setDocumentAnalyses] = useState<DocumentAnalysis[]>([]);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("standard");
  const [isAnalyzingDocs, setIsAnalyzingDocs] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [processingPreview, setProcessingPreview] = useState<{
    totalTokens: number;
    sectionsToProcess: number;
    estimatedCost: number;
    fileBreakdown: { fileName: string; sections: number; tokens: number; }[];
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const miniChatScrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-open when defaultOpen is true (from project creation)
  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true);
    }
  }, [defaultOpen]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Document analysis mutation
  const analyzeDocumentsMutation = useMutation({
    mutationFn: async (filePaths: string[]) => {
      const response = await apiRequest("POST", "/api/documents/analyze", {
        filePaths
      });
      
      if (!response.ok) {
        throw new Error("Failed to analyze documents");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setDocumentAnalyses(data.analyses);
      setShowDocumentPreview(true);
      
      toast({
        title: "Documents Analyzed",
        description: `Analyzed ${data.analyses.length} documents with ${data.summary.totalTokens.toLocaleString()} total tokens.`,
      });
    },
    onError: (error) => {
      console.error("Document analysis failed:", error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze documents. Using fallback processing.",
        variant: "destructive"
      });
    }
  });
  
  // Processing preview mutation
  const previewProcessingMutation = useMutation({
    mutationFn: async (options: { mode: ProcessingMode; selectedSections?: string[] }) => {
      const response = await apiRequest("POST", "/api/documents/preview-processing", {
        analyses: documentAnalyses,
        processingOptions: {
          mode: options.mode,
          selectedSections: options.selectedSections
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to preview processing");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setProcessingPreview(data.preview);
    }
  });

  // Generate schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: async (request: { message: string; isInitial?: boolean }) => {
      try {
        console.log("Starting schedule generation...");
        
        // Prepare document processing options
        const documentProcessing = documentAnalyses.length > 0 ? {
          mode: processingMode,
          selectedSections: processingMode === 'custom' 
            ? documentAnalyses.flatMap(doc => 
                doc.sections.filter(s => s.isSelected).map(s => s.id)
              )
            : undefined
        } : undefined;
        
        const response = await apiRequest("POST", "/api/schedule/ai/generate", {
          type: request.isInitial ? "create" : "update",
          projectDescription: request.message,
          userRequest: request.message,
          model: selectedModel,
          projectId: projectId, // Essential for saving changes!
          uploadedFiles,
          currentActivities: generatedActivities,
          documentProcessing,
          documentAnalyses: documentAnalyses.length > 0 ? documentAnalyses : undefined
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Server error:", errorText);
          throw new Error("Failed to generate schedule - server error");
        }
        
        const data = await response.json();
        console.log("Received data:", data);
        return data;
      } catch (error) {
        console.error("Generation error:", error);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      if (data && data.activities && data.activities.length > 0) {
        // Add assistant response to chat
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: generateAssistantResponse(data, variables.isInitial),
          timestamp: new Date(),
          activities: data.activities,
          metadata: {
            activitiesGenerated: data.activities.length,
            relationshipsCreated: countRelationships(data.activities),
            criticalPath: data.criticalPath,
            contractDuration: calculateDuration(data.activities),
            extractedDates: extractDates(data.activities)
          }
        };
        
        setChatHistory(prev => [...prev, assistantMessage]);
        setGeneratedActivities(data.activities);
        
        if (data.saved) {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "activities"] });
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "relationships"] });
          toast({
            title: "Schedule Updated",
            description: `${data.activities.length} activities with ${countRelationships(data.activities)} relationships saved to project.`,
          });
        }
      }
    },
    onError: (error) => {
      console.error("Schedule generation failed:", error);
      const errorMessage: ChatMessage = {
        role: "system",
        content: "Failed to generate schedule. Please check your API key and try again.",
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMessage]);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate schedule",
        variant: "destructive"
      });
    }
  });

  // Save schedule mutation for Preview tab
  const saveScheduleMutation = useMutation({
    mutationFn: async (activities: Activity[]) => {
      try {
        console.log("Saving schedule to project...");
        const response = await apiRequest("POST", `/api/projects/${projectId}/activities/bulk-save`, {
          activities: activities
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Server error:", errorText);
          throw new Error("Failed to save schedule - server error");
        }
        
        const data = await response.json();
        console.log("Save successful:", data);
        return data;
      } catch (error) {
        console.error("Save error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh the project data
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "relationships"] });
      
      toast({
        title: "Schedule Saved",
        description: `${data.activitiesCount || generatedActivities.length} activities saved to project.`,
      });
    },
    onError: (error) => {
      console.error("Save schedule failed:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save schedule to project. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Helper functions
  const countRelationships = (activities: Activity[]) => {
    return activities.reduce((count, act) => 
      count + (act.predecessors?.length || 0), 0
    );
  };

  const calculateDuration = (activities: Activity[]) => {
    if (!activities.length) return 0;
    const firstDate = activities[0]?.earlyStart ? new Date(activities[0].earlyStart) : new Date();
    let lastDate = firstDate;
    
    activities.forEach(act => {
      if (act.earlyFinish) {
        const finish = new Date(act.earlyFinish);
        if (finish > lastDate) lastDate = finish;
      }
    });
    
    return Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const extractDates = (activities: Activity[]) => {
    const dates: { start?: string; end?: string } = {};
    if (activities.length > 0) {
      dates.start = activities[0]?.startDate || activities[0]?.earlyStart?.toString() || undefined;
      let lastDate = dates.start;
      activities.forEach(act => {
        const finishDate = act.finishDate || act.earlyFinish?.toString();
        if (finishDate && (!lastDate || finishDate > lastDate)) {
          lastDate = finishDate;
        }
      });
      dates.end = lastDate;
    }
    return dates;
  };

  const generateAssistantResponse = (data: any, isInitial?: boolean) => {
    const meta = {
      activities: data.activities.length,
      relationships: countRelationships(data.activities),
      duration: calculateDuration(data.activities),
      criticalActivities: data.activities.filter((a: Activity) => a.isCritical).length
    };

    if (isInitial) {
      return `✅ **Schedule Generated Successfully!**

I've created a comprehensive CPM schedule with:
• **${meta.activities} activities** organized in logical sequence
• **${meta.relationships} dependency relationships** connecting activities
• **${meta.duration} days** total project duration
• **${meta.criticalActivities} critical path activities** identified

**Key Features Applied:**
${data.activities[0]?.constraintType ? '• Constraints applied based on project requirements' : ''}
${uploadedFiles.length > 0 ? '• Extracted information from uploaded documents' : ''}
${data.criticalPath ? `• Critical path: ${data.criticalPath.slice(0, 5).join(' → ')}${data.criticalPath.length > 5 ? '...' : ''}` : ''}

**Work Breakdown Structure:**
${generateWBSSummary(data.activities)}

**Next Steps:**
You can now:
- Ask me to modify specific activities
- Add constraints or milestones
- Adjust durations or dependencies
- Export the schedule

What would you like to adjust?`;
    } else {
      return `✅ **Schedule Updated!**

Changes applied:
• Modified ${meta.activities} activities
• Updated relationships and dependencies
• Recalculated critical path

The schedule now reflects your requested changes. What else would you like to modify?`;
    }
  };

  const generateWBSSummary = (activities: Activity[]) => {
    const wbsGroups: { [key: string]: number } = {};
    activities.forEach(act => {
      const wbs = act.wbs?.split('.')[0] || '1';
      wbsGroups[wbs] = (wbsGroups[wbs] || 0) + 1;
    });
    
    return Object.entries(wbsGroups)
      .slice(0, 5)
      .map(([wbs, count]) => `• Phase ${wbs}: ${count} activities`)
      .join('\n');
  };

  // Enhance prompt using a fast AI model
  const enhancePrompt = async () => {
    if (!chatInput.trim() || isEnhancing) return;
    
    setIsEnhancing(true);
    try {
      const response = await apiRequest("POST", "/api/schedule/ai/enhance-prompt", {
        prompt: chatInput,
        model: "Claude-3-Haiku", // Fast and cheap model for enhancement
        uploadedFiles: uploadedFiles // Pass uploaded files context for better enhancement
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.enhancedPrompt) {
          setChatInput(data.enhancedPrompt);
          toast({
            title: "Prompt Enhanced",
            description: "Your prompt has been improved for better results",
          });
        }
      }
    } catch (error) {
      console.error("Failed to enhance prompt:", error);
      toast({
        title: "Enhancement Failed",
        description: "Could not enhance prompt. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  // Enhance prompt for Quick Generate tab
  const enhanceQuickPrompt = async () => {
    if (!projectDescription.trim() || isEnhancing) return;
    
    setIsEnhancing(true);
    try {
      const response = await apiRequest("POST", "/api/schedule/ai/enhance-prompt", {
        prompt: projectDescription,
        model: "Claude-3-Haiku",
        uploadedFiles: uploadedFiles
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.enhancedPrompt) {
          setProjectDescription(data.enhancedPrompt);
          toast({
            title: "Prompt Enhanced",
            description: "Your prompt has been improved with CPM details",
          });
        }
      }
    } catch (error) {
      console.error("Failed to enhance prompt:", error);
      toast({
        title: "Enhancement Failed",
        description: "Could not enhance prompt. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEnhancing(false);
    }
  };
  
  const handleSendMessage = () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, userMessage]);
    setChatInput("");
    setIsGenerating(true);

    generateScheduleMutation.mutate(
      { 
        message: chatInput, 
        isInitial: chatHistory.length === 0 
      },
      {
        onSettled: () => setIsGenerating(false)
      }
    );
  };

  const handleFileUpload = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    const successful = result.successful || [];
    const newFiles = successful.map((file: any) => 
      file.response?.uploadURL || file.response?.url || ''
    ).filter(Boolean);
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Automatically analyze uploaded documents
    if (newFiles.length > 0) {
      setIsAnalyzingDocs(true);
      analyzeDocumentsMutation.mutate(newFiles, {
        onSettled: () => setIsAnalyzingDocs(false)
      });
    }
    
    // Add system message about file upload
    const fileMessage: ChatMessage = {
      role: "system",
      content: `📎 Uploaded ${successful.length} file(s). ${newFiles.length > 0 ? 'Analyzing content for intelligent processing...' : 'Files will be processed with basic analysis.'}`,
      timestamp: new Date()
    };
    setChatHistory(prev => [...prev, fileMessage]);
  };
  
  // Handle processing mode changes
  const handleProcessingModeChange = (mode: ProcessingMode) => {
    setProcessingMode(mode);
    if (documentAnalyses.length > 0) {
      previewProcessingMutation.mutate({ mode });
    }
  };
  
  // Handle section selection for custom mode
  const handleSectionToggle = (docIndex: number, sectionId: string) => {
    setDocumentAnalyses(prev => 
      prev.map((doc, idx) => 
        idx === docIndex 
          ? {
              ...doc,
              sections: doc.sections.map(section => 
                section.id === sectionId 
                  ? { ...section, isSelected: !section.isSelected }
                  : section
              )
            }
          : doc
      )
    );
    
    // Update preview if in custom mode
    if (processingMode === 'custom') {
      const selectedSections = documentAnalyses.flatMap(doc => 
        doc.sections.filter(s => s.isSelected).map(s => s.id)
      );
      previewProcessingMutation.mutate({ 
        mode: 'custom', 
        selectedSections 
      });
    }
  };
  
  // Get relevance score color
  const getRelevanceColor = (score: number) => {
    if (score >= 70) return "text-green-600 bg-green-50";
    if (score >= 40) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };
  
  // Get category icon
  const getCategoryIcon = (category: DocumentSection['category']) => {
    const icons = {
      project_details: Info,
      schedule: Calendar,
      specifications: FileText,
      constraints: AlertCircle,
      dates: Clock,
      scope: GitBranch,
      other: FileText
    };
    const Icon = icons[category];
    return <Icon className="w-4 h-4" />;
  };

  const handleQuickAction = (action: string) => {
    setChatInput(action);
    handleSendMessage();
  };

  const clearChat = () => {
    setChatHistory([]);
    setGeneratedActivities([]);
    setUploadedFiles([]);
  };

  const handleCloseModal = () => {
    setIsOpen(false);
    // If there's chat history, show the mini chat instead of just closing
    if (chatHistory.length > 0) {
      setIsMiniChat(true);
    }
  };

  const handleOpenFullModal = () => {
    setIsMiniChat(false);
    setIsOpen(true);
  };

  // Scroll to bottom for mini chat
  useEffect(() => {
    if (miniChatScrollRef.current) {
      miniChatScrollRef.current.scrollTop = miniChatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isMiniChat]);

  return (
    <TooltipProvider>
      {/* Floating Bubble - Only show if neither modal nor mini chat is open */}
      <AnimatePresence>
        {!isOpen && !isMiniChat && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setIsOpen(true)}
                  size="lg"
                  className="rounded-full w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-xl hover:shadow-2xl transition-all"
                  data-testid="button-ai-bubble"
                >
                  <Sparkles className="w-8 h-8" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>AI Schedule Assistant - Edit and refine your schedule</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini Chat Window */}
      <AnimatePresence>
        {isMiniChat && !isOpen && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-white rounded-lg shadow-2xl flex flex-col"
          >
            {/* Mini Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="font-medium">AI Schedule Assistant</span>
                {isGenerating && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleOpenFullModal}
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => setIsMiniChat(false)}
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20 h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Mini Chat Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3" ref={miniChatScrollRef}>
              <div className="space-y-3">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${msg.role === 'user' ? 'bg-purple-100 text-purple-900' : 'bg-gray-100'}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.metadata && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          {msg.metadata.activitiesGenerated && (
                            <p className="text-xs text-gray-500">
                              Generated {msg.metadata.activitiesGenerated} activities
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mini Chat Input */}
            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask about your schedule..."
                  className="min-h-[60px] resize-none text-sm"
                  disabled={isGenerating}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isGenerating}
                  className="bg-purple-600 hover:bg-purple-700"
                  size="icon"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {selectedModel}
                </Badge>
                {generatedActivities.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {generatedActivities.length} activities
                  </Badge>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Dialog */}
      <Dialog open={isOpen} onOpenChange={handleCloseModal}>
        <DialogContent className={`${isMinimized ? 'w-96' : 'w-[90vw] max-w-6xl'} h-[85vh] flex flex-col p-0`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-blue-600 text-white">
            <div className="flex items-center gap-3">
              <Bot className="w-6 h-6" />
              <div>
                <DialogTitle className="text-lg font-semibold text-white">
                  Schedule AI Assistant
                </DialogTitle>
                <DialogDescription className="text-sm text-purple-100">
                  Interactive CPM scheduling powered by AI
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
              <TabsList className="w-full justify-start px-6 py-6 bg-gray-50 rounded-none">
                <TabsTrigger value="chat" className="gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Interactive Chat
                </TabsTrigger>
                <TabsTrigger value="generate" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  Quick Generate
                </TabsTrigger>
                <TabsTrigger value="files" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Documents
                  {uploadedFiles.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {uploadedFiles.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2" disabled={generatedActivities.length === 0}>
                  <GitBranch className="w-4 h-4" />
                  Preview
                  {generatedActivities.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {generatedActivities.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Chat Tab */}
              <TabsContent value="chat" className="h-[calc(100%-60px)] p-0">
                <div className="flex flex-col h-full">
                  <Alert className="mx-6 mt-4 mb-2 bg-blue-50 border-blue-200">
                    <MessageCircle className="w-4 h-4 text-blue-600" />
                    <AlertDescription className="text-sm">
                      <strong>Interactive Chat:</strong> Have a conversation with AI to iteratively refine your schedule. Ask questions, request changes, and build step-by-step.
                    </AlertDescription>
                  </Alert>
                  
                  {/* Model Selector */}
                  <div className="px-6 py-3 border-b bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">AI Model:</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="w-48 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {POE_MODELS.map((model) => (
                              <SelectItem key={model.value} value={model.value}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearChat}
                        className="text-gray-600"
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Clear Chat
                      </Button>
                    </div>
                  </div>

                  {/* Chat Messages */}
                  <ScrollArea className="flex-1 px-6 py-4" ref={chatScrollRef}>
                    {chatHistory.length === 0 ? (
                      <div className="text-center py-12">
                        <Bot className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-medium mb-2">Start a Conversation</h3>
                        <p className="text-gray-500 mb-6">
                          I'll help create your CPM schedule. I can ask questions to gather details.
                        </p>
                        
                        {/* Smart Questions */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                          <p className="text-sm font-medium mb-3">Let me know about your project:</p>
                          <div className="space-y-2 text-left">
                            <button 
                              onClick={() => handleQuickAction("What type of construction project is this? When is the planned start date?")}
                              className="w-full text-left text-sm p-2 hover:bg-gray-100 rounded flex items-center gap-2"
                            >
                              <Calendar className="w-4 h-4 text-gray-400" />
                              Tell me project type & start date
                            </button>
                            <button 
                              onClick={() => handleQuickAction("What's the contract duration? Are there any milestone dates I should know about?")}
                              className="w-full text-left text-sm p-2 hover:bg-gray-100 rounded flex items-center gap-2"
                            >
                              <Clock className="w-4 h-4 text-gray-400" />
                              Contract duration & milestones
                            </button>
                            <button 
                              onClick={() => handleQuickAction("What are the major phases or work packages for this project?")}
                              className="w-full text-left text-sm p-2 hover:bg-gray-100 rounded flex items-center gap-2"
                            >
                              <GitBranch className="w-4 h-4 text-gray-400" />
                              Major phases & work packages
                            </button>
                          </div>
                        </div>
                        
                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                          <Button
                            variant="outline"
                            className="text-sm"
                            onClick={() => handleQuickAction("Create a 6-month commercial construction schedule with all trades")}
                          >
                            Commercial Building
                          </Button>
                          <Button
                            variant="outline"
                            className="text-sm"
                            onClick={() => handleQuickAction("Generate residential home construction schedule, 4 bedroom house")}
                          >
                            Residential Home
                          </Button>
                          <Button
                            variant="outline"
                            className="text-sm"
                            onClick={() => handleQuickAction("Create infrastructure project schedule for road construction")}
                          >
                            Infrastructure
                          </Button>
                          <Button
                            variant="outline"
                            className="text-sm"
                            onClick={() => handleQuickAction("Generate renovation schedule for office building modernization")}
                          >
                            Renovation
                          </Button>
                        </div>
                        
                        <div className="mt-6 p-4 bg-purple-50 rounded-lg max-w-md mx-auto">
                          <Info className="w-5 h-5 text-purple-600 mb-2 mx-auto" />
                          <p className="text-sm text-purple-900">
                            <strong>Pro Tip:</strong> Use this dialog for initial schedule creation.
                            After generation, use the floating button (bottom right) for edits and refinements.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {chatHistory.map((message, idx) => (
                          <div
                            key={idx}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-4 ${
                                message.role === 'user'
                                  ? 'bg-purple-600 text-white'
                                  : message.role === 'assistant'
                                  ? 'bg-gray-100'
                                  : 'bg-blue-50 border border-blue-200'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {message.role === 'assistant' && <Bot className="w-5 h-5 mt-0.5" />}
                                {message.role === 'user' && <User className="w-5 h-5 mt-0.5" />}
                                {message.role === 'system' && <Info className="w-5 h-5 mt-0.5 text-blue-600" />}
                                <div className="flex-1">
                                  <div className="text-sm whitespace-pre-wrap">
                                    {message.content}
                                  </div>
                                  
                                  {/* Metadata Display */}
                                  {message.metadata && (
                                    <div className="mt-3 pt-3 border-t space-y-2">
                                      <div className="flex flex-wrap gap-2">
                                        {message.metadata.activitiesGenerated && (
                                          <Badge variant="outline">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {message.metadata.activitiesGenerated} activities
                                          </Badge>
                                        )}
                                        {message.metadata.relationshipsCreated && (
                                          <Badge variant="outline">
                                            <Link2 className="w-3 h-3 mr-1" />
                                            {message.metadata.relationshipsCreated} links
                                          </Badge>
                                        )}
                                        {message.metadata.contractDuration && (
                                          <Badge variant="outline">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {message.metadata.contractDuration} days
                                          </Badge>
                                        )}
                                      </div>
                                      {message.metadata.extractedDates?.start && (
                                        <div className="text-xs text-gray-600">
                                          Schedule: {message.metadata.extractedDates.start} to {message.metadata.extractedDates.end}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-gray-400 mt-2">
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {isGenerating && (
                          <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-lg p-4">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Generating schedule...</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Chat Input */}
                  <div 
                    className="relative px-6 py-4 border-t bg-gray-50"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) {
                        setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
                        toast({
                          title: "Files Dropped",
                          description: `${files.length} file(s) will be analyzed by AI`,
                        });
                      }
                    }}
                  >
                    {isDragOver && (
                      <div className="absolute inset-0 bg-purple-50 border-2 border-dashed border-purple-500 rounded-lg z-10 flex items-center justify-center">
                        <div className="text-center">
                          <Upload className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                          <p className="text-purple-600 font-medium">Drop files here</p>
                          <p className="text-sm text-purple-500">Multiple files supported</p>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          placeholder="Describe your project or ask for changes..."
                          className="min-h-[80px] resize-none"
                          disabled={isGenerating || isEnhancing}
                        />
                        {chatInput.trim() && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={enhancePrompt}
                                disabled={isEnhancing || isGenerating}
                                className="w-full justify-start text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                              >
                                {isEnhancing ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Enhancing...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="w-4 h-4 mr-2" />
                                    Enhance Prompt with AI
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                Uses AI to improve your prompt with more details, better structure, and specific requirements for optimal schedule generation
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || isGenerating || isEnhancing}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          {isGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {uploadedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {uploadedFiles.map((file, idx) => (
                          <Badge key={idx} variant="secondary">
                            <FileText className="w-3 h-3 mr-1" />
                            Document {idx + 1}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Quick Generate Tab */}
              <TabsContent value="generate" className="px-6 py-4">
                <div className="space-y-4">
                  <Alert className="bg-purple-50 border-purple-200">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <AlertDescription className="text-sm">
                      <strong>Quick Generate:</strong> Describe your project once and instantly create a complete CPM schedule. Perfect for initial schedule creation.
                    </AlertDescription>
                  </Alert>
                  
                  <div>
                    <Label>Project Description</Label>
                    <Textarea
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      placeholder="Example: 10-story office building, 365 day contract, includes site work, foundations, structure, MEP, and finishes..."
                      className="min-h-[150px] mt-2"
                    />
                    
                    {/* Enhance Button for Quick Generate */}
                    {projectDescription.trim() && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={enhanceQuickPrompt}
                            disabled={isEnhancing || generateScheduleMutation.isPending}
                            className="w-full mt-2 justify-start text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          >
                            {isEnhancing ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enhancing...
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-4 h-4 mr-2" />
                                Enhance Prompt with AI
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm">
                            Uses AI to improve your prompt with CPM details, durations, and constraints
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  
                  {/* File Upload Section */}
                  <div>
                    <Label className="mb-2">Upload Documents (Optional)</Label>
                    <div
                      className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                        isQuickGenerateDragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
                      }`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsQuickGenerateDragOver(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Only set to false if we're leaving the drop zone entirely
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setIsQuickGenerateDragOver(false);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsQuickGenerateDragOver(false);
                        const files = Array.from(e.dataTransfer.files);
                        if (files.length > 0) {
                          setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
                          toast({
                            title: "Files Dropped",
                            description: `${files.length} file(s) will be analyzed when generating the schedule`,
                          });
                        }
                      }}
                    >
                      {/* Drop Zone Overlay */}
                      {isQuickGenerateDragOver && (
                        <div className="absolute inset-0 bg-purple-50 bg-opacity-90 rounded-lg flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <Upload className="w-10 h-10 text-purple-600 mx-auto mb-2" />
                            <p className="text-purple-600 font-medium">Drop files here</p>
                          </div>
                        </div>
                      )}
                      <div className={isQuickGenerateDragOver ? 'opacity-20' : ''}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
                              toast({
                                title: "Files Selected",
                                description: `${files.length} file(s) will be analyzed by AI when generating the schedule`,
                              });
                            }
                          }}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Choose Files (Multiple Allowed)
                        </Button>
                      </div>
                      <p className={`text-xs text-gray-600 mt-2 ${isQuickGenerateDragOver ? 'opacity-20' : ''}`}>
                        Upload bid documents, specs, or drawings for AI to extract contract duration and scope
                      </p>
                      
                      {uploadedFiles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 justify-center">
                          {uploadedFiles.map((file, idx) => (
                            <Badge key={idx} variant="secondary">
                              <FileText className="w-3 h-3 mr-1" />
                              Document {idx + 1}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => {
                      if (projectDescription) {
                        setActiveTab("chat");
                        setChatInput(projectDescription);
                        handleSendMessage();
                      }
                    }}
                    disabled={!projectDescription.trim() || generateScheduleMutation.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {generateScheduleMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Schedule...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Schedule
                      </>
                    )}
                  </Button>
                  
                  <div className="text-xs text-gray-500 text-center">
                    Tip: Upload bid documents to extract contract duration and milestones automatically
                  </div>
                </div>
              </TabsContent>

              {/* Files Tab */}
              <TabsContent value="files" className="px-6 py-4 h-[calc(100%-60px)] overflow-y-auto">
                <div className="space-y-4">
                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="w-4 h-4 text-blue-600" />
                    <AlertDescription className="text-sm">
                      <strong>Smart Document Processing:</strong> Upload documents and choose how much content to analyze. Save costs with intelligent content selection.
                    </AlertDescription>
                  </Alert>
                
                  {/* File Upload Section */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center ${
                      isDragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                    }}
                  >
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <h3 className="font-medium mb-1">Upload Project Documents</h3>
                    <p className="text-sm text-gray-500 mb-3">
                      PDF, Word, Excel, or text files
                    </p>
                    
                    <ObjectUploader
                      onComplete={handleFileUpload}
                      onGetUploadParameters={async () => ({
                        method: "PUT",
                        url: `/api/objects/upload/${projectId}/schedule-docs`
                      })}
                      maxNumberOfFiles={10}
                    >
                      Upload Documents
                    </ObjectUploader>
                    
                    {isAnalyzingDocs && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing document content...
                      </div>
                    )}
                  </div>
                  
                  {/* Document Analysis Results */}
                  {documentAnalyses.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Document Analysis</h3>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowDocumentPreview(!showDocumentPreview)}
                        >
                          {showDocumentPreview ? 'Hide Details' : 'Show Details'}
                        </Button>
                      </div>
                      
                      {/* Processing Mode Selection */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Processing Mode</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant={processingMode === 'quick' ? 'default' : 'outline'}
                            onClick={() => handleProcessingModeChange('quick')}
                            className="h-auto p-3 flex flex-col items-start"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Wand2 className="w-4 h-4" />
                              <span className="font-medium">Quick</span>
                            </div>
                            <span className="text-xs text-left">Key facts only</span>
                          </Button>
                          
                          <Button
                            size="sm"
                            variant={processingMode === 'standard' ? 'default' : 'outline'}
                            onClick={() => handleProcessingModeChange('standard')}
                            className="h-auto p-3 flex flex-col items-start"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle className="w-4 h-4" />
                              <span className="font-medium">Standard</span>
                            </div>
                            <span className="text-xs text-left">Balanced analysis</span>
                          </Button>
                          
                          <Button
                            size="sm"
                            variant={processingMode === 'deep' ? 'default' : 'outline'}
                            onClick={() => handleProcessingModeChange('deep')}
                            className="h-auto p-3 flex flex-col items-start"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <RefreshCw className="w-4 h-4" />
                              <span className="font-medium">Deep</span>
                            </div>
                            <span className="text-xs text-left">Complete analysis</span>
                          </Button>
                          
                          <Button
                            size="sm"
                            variant={processingMode === 'custom' ? 'default' : 'outline'}
                            onClick={() => handleProcessingModeChange('custom')}
                            className="h-auto p-3 flex flex-col items-start"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Plus className="w-4 h-4" />
                              <span className="font-medium">Custom</span>
                            </div>
                            <span className="text-xs text-left">Select sections</span>
                          </Button>
                        </div>
                      </div>
                      
                      {/* Processing Preview */}
                      {processingPreview && (
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <h4 className="font-medium text-sm">Processing Preview</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Tokens:</span>
                              <span className="font-medium ml-2">{processingPreview.totalTokens.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Sections:</span>
                              <span className="font-medium ml-2">{processingPreview.sectionsToProcess}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Est. Cost:</span>
                              <span className="font-medium ml-2 text-green-600">${processingPreview.estimatedCost.toFixed(3)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Mode:</span>
                              <span className="font-medium ml-2 capitalize">{processingMode}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Document Details */}
                      {showDocumentPreview && (
                        <div className="space-y-4">
                          {documentAnalyses.map((doc, docIndex) => (
                            <Card key={docIndex} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    {doc.fileName}
                                  </h4>
                                  <Badge variant="outline" className="text-xs">
                                    {doc.totalTokens.toLocaleString()} tokens
                                  </Badge>
                                </div>
                                
                                {/* Key Information */}
                                {(doc.keyInformation.contractDuration || doc.keyInformation.projectType || doc.keyInformation.milestones.length > 0) && (
                                  <div className="bg-blue-50 rounded p-3 text-sm">
                                    <h5 className="font-medium mb-2 text-blue-900">Extracted Information</h5>
                                    <div className="space-y-1 text-blue-800">
                                      {doc.keyInformation.contractDuration && (
                                        <div><strong>Duration:</strong> {doc.keyInformation.contractDuration}</div>
                                      )}
                                      {doc.keyInformation.projectType && (
                                        <div><strong>Type:</strong> {doc.keyInformation.projectType}</div>
                                      )}
                                      {doc.keyInformation.milestones.length > 0 && (
                                        <div><strong>Milestones:</strong> {doc.keyInformation.milestones.slice(0, 2).join(', ')}{doc.keyInformation.milestones.length > 2 ? '...' : ''}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Section Selection for Custom Mode */}
                                {processingMode === 'custom' && (
                                  <div className="space-y-2">
                                    <h5 className="text-sm font-medium">Select Sections to Process:</h5>
                                    <div className="max-h-40 overflow-y-auto space-y-2">
                                      {doc.sections.map((section) => (
                                        <div key={section.id} className="flex items-start gap-3 p-2 border rounded hover:bg-gray-50">
                                          <input
                                            type="checkbox"
                                            checked={section.isSelected}
                                            onChange={() => handleSectionToggle(docIndex, section.id)}
                                            className="mt-1"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                              {getCategoryIcon(section.category)}
                                              <span className="text-sm font-medium truncate">{section.title}</span>
                                              <Badge className={`text-xs ${getRelevanceColor(section.relevanceScore)}`}>
                                                {section.relevanceScore}%
                                              </Badge>
                                            </div>
                                            <p className="text-xs text-gray-600 line-clamp-2">
                                              {section.content.substring(0, 100)}...
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                              <Badge variant="outline" className="text-xs">
                                                {section.tokens} tokens
                                              </Badge>
                                              <Badge variant="outline" className="text-xs capitalize">
                                                {section.category.replace('_', ' ')}
                                              </Badge>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Uploaded Files List */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Uploaded Files:</h4>
                      <div className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-gray-100 rounded text-sm">
                            <FileText className="w-4 h-4" />
                            <span className="truncate flex-1">{file.split('/').pop()}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setUploadedFiles(prev => prev.filter((_, i) => i !== index));
                                setDocumentAnalyses(prev => prev.filter(doc => doc.filePath !== file));
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    // Handle file selection
                  }}
                />
              </TabsContent>

              {/* Preview Tab */}
              <TabsContent value="preview" className="px-6 py-4">
                {generatedActivities.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">
                        Preview & Edit Schedule
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Add a new activity
                          const newActivity: Activity = {
                            id: crypto.randomUUID(),
                            activityId: `NEW_${Date.now()}`,
                            activityName: "New Activity",
                            duration: 5,
                            status: "Not Started",
                            percentComplete: 0,
                            predecessors: [],
                            successors: [],
                            isCritical: false,
                            totalFloat: 0,
                            freeFloat: 0,
                            earlyStart: 0,
                            earlyFinish: 5,
                            startDate: new Date().toISOString().split('T')[0],
                            finishDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                          };
                          setGeneratedActivities([...generatedActivities, newActivity]);
                          toast({
                            title: "Activity Added",
                            description: "New activity added. Edit the name and duration below.",
                          });
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Activity
                      </Button>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded px-3 py-2">
                        <p className="text-xs text-gray-600">Activities</p>
                        <p className="text-lg font-semibold">{generatedActivities.length}</p>
                      </div>
                      <div className="bg-orange-50 rounded px-3 py-2">
                        <p className="text-xs text-gray-600">Critical</p>
                        <p className="text-lg font-semibold text-orange-600">
                          {generatedActivities.filter(a => a.isCritical).length}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded px-3 py-2">
                        <p className="text-xs text-gray-600">Duration</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {Math.max(...generatedActivities.map(a => a.duration || 0))} days
                        </p>
                      </div>
                    </div>

                    {/* Editable Activity List */}
                    <div className="border rounded-lg">
                      <ScrollArea className="h-[350px]">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-gray-50">
                            <tr>
                              <th className="text-left p-3">Activity Name</th>
                              <th className="text-center p-3 w-24">Duration</th>
                              <th className="text-center p-3 w-20">Critical</th>
                              <th className="text-center p-3 w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedActivities.map((activity, idx) => (
                              <tr key={activity.activityId} className="border-b hover:bg-gray-50">
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={activity.activityName}
                                    onChange={(e) => {
                                      const updated = [...generatedActivities];
                                      updated[idx].activityName = e.target.value;
                                      setGeneratedActivities(updated);
                                    }}
                                    className="w-full px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-purple-500 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <input
                                    type="number"
                                    value={activity.duration}
                                    onChange={(e) => {
                                      const newDuration = Math.max(1, parseInt(e.target.value) || 1);
                                      const updated = [...generatedActivities];
                                      updated[idx].duration = newDuration;
                                      updated[idx].remainingDuration = newDuration;
                                      setGeneratedActivities(updated);
                                    }}
                                    className="w-16 text-center px-2 py-1 bg-transparent border rounded hover:border-purple-400 focus:border-purple-500 focus:outline-none"
                                    min="1"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  {activity.isCritical ? (
                                    <Badge variant="destructive" className="text-xs">Yes</Badge>
                                  ) : (
                                    <span className="text-gray-400">No</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setGeneratedActivities(
                                        generatedActivities.filter(a => a.activityId !== activity.activityId)
                                      );
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-between items-center">
                      <Alert className="flex-1 mr-4">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Edit names and durations inline. Changes are temporary until saved.
                        </AlertDescription>
                      </Alert>
                      <Button
                        onClick={async () => {
                          await saveScheduleMutation.mutateAsync(generatedActivities);
                          toast({
                            title: "Schedule Saved",
                            description: `${generatedActivities.length} activities saved to project.`,
                          });
                        }}
                        disabled={saveScheduleMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {saveScheduleMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save to Project
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500">
                      No schedule generated yet. Start a conversation to create one.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}