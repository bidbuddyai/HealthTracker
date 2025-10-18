import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AssistantPanelProps {
  meetingId: string;
}

interface AssistantResponse {
  tool?: {
    tool: string;
    args: Record<string, any>;
    speak?: string;
  };
  result?: any;
  speak?: string;
  response?: string;
}

// Available models from Poe's OpenAI-compatible API
const POE_MODELS = [
  // GPT Models
  { value: "GPT-5", label: "GPT-5 (Latest Flagship)", category: "GPT" },
  { value: "GPT-5-mini", label: "GPT-5 Mini", category: "GPT" },
  { value: "GPT-4o", label: "GPT-4o", category: "GPT" },
  { value: "GPT-4.1", label: "GPT-4.1", category: "GPT" },
  
  // Claude Models
  { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", category: "Claude" },
  { value: "Claude-Opus-4.1", label: "Claude Opus 4.1", category: "Claude" },
  { value: "Claude-Sonnet-4", label: "Claude Sonnet 4 (30k thinking)", category: "Claude" },
  { value: "Claude-3.5-Sonnet", label: "Claude 3.5 Sonnet", category: "Claude" },
  
  // Google Models
  { value: "Gemini-2.5-Pro", label: "Gemini 2.5 Pro (1M context)", category: "Google" },
  { value: "Gemini-2.0-Flash", label: "Gemini 2.0 Flash", category: "Google" },
  
  // Reasoning Models
  { value: "o3-pro", label: "o3 Pro (Reasoning)", category: "Reasoning" },
  { value: "DeepSeek-R1-T", label: "DeepSeek R1-T (Reasoning)", category: "Reasoning" },
  { value: "DeepSeek-V3-FW", label: "DeepSeek V3-FW", category: "Reasoning" },
  { value: "Llama-4-Scout-T", label: "Llama 4 Scout-T (Reasoning)", category: "Reasoning" },
  
  // Other Leading Models
  { value: "Grok-4", label: "Grok 4 (xAI)", category: "Other" },
  { value: "GLM-4.5", label: "GLM 4.5", category: "Other" },
  { value: "Kimi-K2", label: "Kimi K2", category: "Other" },
  { value: "Qwen-3-235B-T", label: "Qwen 3 235B-T", category: "Other" },
  { value: "Mistral-Small-3", label: "Mistral Small 3", category: "Other" },
  { value: "Llama-4-Maverick", label: "Llama 4 Maverick", category: "Other" },
];

export default function AssistantPanel({ meetingId }: AssistantPanelProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState("Claude-Sonnet-4");
  const [conversation, setConversation] = useState<Array<{
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    model?: string;
  }>>([]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        messages: [
          ...conversation.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.content
          })),
          { role: 'user', content: message }
        ],
        model: selectedModel
      });
      return response.json();
    },
    onSuccess: (data: AssistantResponse) => {
      setConversation(prev => [
        ...prev,
        { type: 'user', content: query, timestamp: new Date() },
        { 
          type: 'assistant', 
          content: data.speak || data.response || 'Task completed successfully',
          timestamp: new Date(),
          model: selectedModel
        }
      ]);
      
      if (data.tool) {
        toast({
          title: "AI Assistant",
          description: data.speak || `Executed ${data.tool.tool} successfully`,
        });
      }
      
      setQuery("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendQuery = () => {
    if (!query.trim()) return;
    chatMutation.mutate(query);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuery();
    }
  };

  const quickActions = [
    { label: "Generate action items", query: "Create action items from today's discussion points" },
    { label: "Summarize meeting", query: "Provide a summary of this meeting" },
    { label: "Create RFI", query: "Help me create a new RFI for the structural beam specifications" },
    { label: "Distribute minutes", query: "Distribute the meeting minutes to all attendees" }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-brand-secondary flex items-center space-x-2">
            <i className="fas fa-robot"></i>
            <span>Meeting Assistant</span>
            <span className="text-xs bg-brand-accent text-white px-2 py-1 rounded-full">AI Powered</span>
          </h3>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[240px]" data-testid="select-ai-model">
              <SelectValue placeholder="Select AI Model" />
            </SelectTrigger>
            <SelectContent>
              {/* Group models by category */}
              <div className="font-semibold text-xs text-gray-500 px-2 py-1">GPT Models</div>
              {POE_MODELS.filter(m => m.category === "GPT").map(model => (
                <SelectItem key={model.value} value={model.value} data-testid={`model-${model.value}`}>
                  {model.label}
                </SelectItem>
              ))}
              
              <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2">Claude Models</div>
              {POE_MODELS.filter(m => m.category === "Claude").map(model => (
                <SelectItem key={model.value} value={model.value} data-testid={`model-${model.value}`}>
                  {model.label}
                </SelectItem>
              ))}
              
              <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2">Google Models</div>
              {POE_MODELS.filter(m => m.category === "Google").map(model => (
                <SelectItem key={model.value} value={model.value} data-testid={`model-${model.value}`}>
                  {model.label}
                </SelectItem>
              ))}
              
              <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2">Reasoning Models</div>
              {POE_MODELS.filter(m => m.category === "Reasoning").map(model => (
                <SelectItem key={model.value} value={model.value} data-testid={`model-${model.value}`}>
                  {model.label}
                </SelectItem>
              ))}
              
              <div className="font-semibold text-xs text-gray-500 px-2 py-1 mt-2">Other Models</div>
              {POE_MODELS.filter(m => m.category === "Other").map(model => (
                <SelectItem key={model.value} value={model.value} data-testid={`model-${model.value}`}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="p-6">
        {/* Conversation History */}
        {conversation.length > 0 && (
          <div className="mb-6 max-h-64 overflow-y-auto">
            <div className="space-y-3">
              {conversation.map((message, index) => (
                <div 
                  key={index}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${message.type}-${index}`}
                >
                  <div 
                    className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
                      message.type === 'user' 
                        ? 'bg-brand-secondary text-white' 
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Section */}
        <div className="flex items-start space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ask the assistant to help with meeting tasks
            </label>
            <div className="flex space-x-2">
              <Input 
                type="text" 
                placeholder="e.g., 'Create action items from today's safety discussion' or 'Summarize this meeting'"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-brand-accent focus:border-brand-accent"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={chatMutation.isPending}
                data-testid="input-assistant-query"
              />
              <Button 
                className="bg-brand-accent text-white hover:bg-green-600"
                onClick={handleSendQuery}
                disabled={chatMutation.isPending || !query.trim()}
                data-testid="button-send-query"
              >
                {chatMutation.isPending ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-paper-plane"></i>
                )}
              </Button>
            </div>
            
            {/* Quick Actions */}
            <div className="mt-2 flex flex-wrap gap-2">
              {quickActions.map((action, index) => (
                <button 
                  key={index}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors"
                  onClick={() => setQuery(action.query)}
                  disabled={chatMutation.isPending}
                  data-testid={`quick-action-${index}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Audio Controls */}
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline"
              className="text-gray-700 border-gray-300 hover:bg-gray-200 text-sm"
              data-testid="button-record-audio"
            >
              <i className="fas fa-microphone mr-2"></i>
              Record
            </Button>
            <Button 
              variant="outline"
              className="text-gray-700 border-gray-300 hover:bg-gray-200 text-sm"
              data-testid="button-upload-audio"
            >
              <i className="fas fa-upload mr-2"></i>
              Upload Audio
            </Button>
          </div>
        </div>

        {/* AI Status/Help */}
        {conversation.length === 0 && (
          <Card className="mt-4 bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <i className="fas fa-lightbulb text-blue-600 mt-1"></i>
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">AI Assistant Ready - Using {POE_MODELS.find(m => m.value === selectedModel)?.label || selectedModel}</h4>
                  <p className="text-sm text-blue-700">
                    I can help you create action items, summarize discussions, manage RFIs, and distribute meeting minutes. 
                    Try asking me to analyze your meeting content or use the quick action buttons above.
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    Powered by Poe's OpenAI-compatible API with access to GPT-5, Claude, Gemini, and advanced reasoning models.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
