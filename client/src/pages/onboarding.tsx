import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HardHat, Building2, Wrench, Settings, AlertTriangle, Loader2 } from "lucide-react";

type TradeOption = {
  id: string;
  title: string;
  description: string;
  icon: typeof HardHat;
  templateCategories: string[];
};

const TRADE_OPTIONS: TradeOption[] = [
  {
    id: "abatement_demolition",
    title: "Hazardous Abatement & Demolition",
    description: "Asbestos remediation, environmental controls, structural demolition, and utility management",
    icon: AlertTriangle,
    templateCategories: ["Abatement", "Demolition"]
  },
  {
    id: "general_contractor",
    title: "General Contractor",
    description: "Full project lifecycle from mobilization through punchlist, managing multiple trades",
    icon: Building2,
    templateCategories: ["General Construction"]
  },
  {
    id: "mep_subcontractor",
    title: "MEP Subcontractor",
    description: "Mechanical, Electrical, Plumbing installation from BIM coordination through commissioning",
    icon: Wrench,
    templateCategories: ["MEP"]
  },
  {
    id: "custom_hybrid",
    title: "Custom / Hybrid",
    description: "Select multiple trade templates to build a customized rule set for your specific needs",
    icon: Settings,
    templateCategories: []
  }
];

export default function Onboarding() {
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);
  const [customSelections, setCustomSelections] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const brainLoadMutation = useMutation({
    mutationFn: async (data: { primaryTrade: string; templateCategories: string[] }) => {
      const response = await apiRequest("POST", "/api/onboarding/brain-load", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome aboard!",
        description: "Your trade preferences have been saved and your scheduling brain is loaded.",
      });
      setLocation("/projects");
    },
    onError: (error) => {
      toast({
        title: "Setup failed",
        description: error instanceof Error ? error.message : "Failed to save preferences",
        variant: "destructive",
      });
    }
  });

  const handleTradeSelect = (tradeId: string) => {
    setSelectedTrade(tradeId);
    if (tradeId !== "custom_hybrid") {
      setCustomSelections([]);
    }
  };

  const handleCustomToggle = (category: string) => {
    setCustomSelections(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleContinue = () => {
    if (!selectedTrade) return;

    const trade = TRADE_OPTIONS.find(t => t.id === selectedTrade);
    if (!trade) return;

    const templateCategories = selectedTrade === "custom_hybrid" 
      ? customSelections 
      : trade.templateCategories;

    if (templateCategories.length === 0 && selectedTrade === "custom_hybrid") {
      toast({
        title: "Select at least one trade",
        description: "Please choose at least one trade template for your custom setup.",
        variant: "destructive",
      });
      return;
    }

    brainLoadMutation.mutate({
      primaryTrade: trade.title,
      templateCategories
    });
  };

  const isCustomMode = selectedTrade === "custom_hybrid";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardHat className="h-10 w-10 text-orange-500" />
            <h1 className="text-3xl font-bold text-white">Welcome to ScheduleSam</h1>
          </div>
          <p className="text-slate-400 text-lg">
            What is your primary trade? We'll load the right scheduling logic for you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {TRADE_OPTIONS.map((trade) => {
            const Icon = trade.icon;
            const isSelected = selectedTrade === trade.id;
            
            return (
              <Card 
                key={trade.id}
                data-testid={`trade-option-${trade.id}`}
                className={`cursor-pointer transition-all duration-200 hover:border-orange-500/50 ${
                  isSelected 
                    ? "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/30" 
                    : "border-slate-700 bg-slate-800/50"
                }`}
                onClick={() => handleTradeSelect(trade.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? "bg-orange-500/20" : "bg-slate-700"}`}>
                      <Icon className={`h-6 w-6 ${isSelected ? "text-orange-500" : "text-slate-400"}`} />
                    </div>
                    <CardTitle className={`text-lg ${isSelected ? "text-orange-500" : "text-white"}`}>
                      {trade.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    {trade.description}
                  </CardDescription>
                  {trade.templateCategories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trade.templateCategories.map(cat => (
                        <span 
                          key={cat}
                          className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isCustomMode && (
          <Card className="border-slate-700 bg-slate-800/50 mb-8" data-testid="custom-trade-selection">
            <CardHeader>
              <CardTitle className="text-white">Select Your Trade Templates</CardTitle>
              <CardDescription>Choose one or more trade categories to build your custom rule set</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {["Abatement", "Demolition", "General Construction", "MEP"].map((category) => (
                  <label 
                    key={category}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 hover:border-orange-500/50 cursor-pointer transition-colors"
                    data-testid={`custom-checkbox-${category.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Checkbox
                      checked={customSelections.includes(category)}
                      onCheckedChange={() => handleCustomToggle(category)}
                    />
                    <span className="text-white text-sm">{category}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center">
          <Button
            size="lg"
            data-testid="continue-button"
            disabled={!selectedTrade || brainLoadMutation.isPending}
            onClick={handleContinue}
            className="bg-orange-500 hover:bg-orange-600 text-white px-8"
          >
            {brainLoadMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Your Brain...
              </>
            ) : (
              "Continue to ScheduleSam"
            )}
          </Button>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          You can always adjust your trade preferences later in Settings
        </p>
      </div>
    </div>
  );
}
