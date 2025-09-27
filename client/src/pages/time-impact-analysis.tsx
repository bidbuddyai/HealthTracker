import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTiaScenarioSchema, type TiaScenario, type TiaDelay, type TiaFragnet, type TiaResult } from "@shared/schema";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  GitBranch,
  Hammer,
  Info,
  Layers,
  LineChart,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";
import { format } from "date-fns";

export function TimeImpactAnalysis() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  
  const form = useForm({
    resolver: zodResolver(insertTiaScenarioSchema.omit({ projectId: true, createdBy: true })),
    defaultValues: {
      name: "",
      description: "",
      scenarioType: "delay-analysis" as "delay-analysis" | "acceleration" | "what-if" | "recovery",
      impactType: "eot" as "eot" | "disruption" | "change-order" | "weather",
      targetDate: "",
      isActive: true
    }
  });

  // Fetch TIA scenarios
  const { data: scenarios = [], isLoading: scenariosLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/tia-scenarios`],
    enabled: !!projectId
  });

  // Fetch selected scenario details
  const { data: scenarioDetails } = useQuery({
    queryKey: [`/api/tia-scenarios/${selectedScenario}`],
    enabled: !!selectedScenario
  });

  // Fetch scenario delays
  const { data: delays = [] } = useQuery({
    queryKey: [`/api/tia-scenarios/${selectedScenario}/delays`],
    enabled: !!selectedScenario
  });

  // Fetch scenario fragnets
  const { data: fragnets = [] } = useQuery({
    queryKey: [`/api/tia-scenarios/${selectedScenario}/fragnets`],
    enabled: !!selectedScenario
  });

  // Create scenario mutation
  const createScenarioMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/projects/${projectId}/tia-scenarios`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tia-scenarios`] });
      setShowCreateDialog(false);
      form.reset();
      toast({
        title: "Scenario Created",
        description: "TIA scenario has been created successfully."
      });
    }
  });

  // Analyze scenario mutation
  const analyzeScenarioMutation = useMutation({
    mutationFn: (scenarioId: string) => apiRequest(`/api/tia-scenarios/${scenarioId}/analyze`, {
      method: "POST"
    }),
    onSuccess: (result) => {
      setAnalysisResults(result);
      toast({
        title: "Analysis Complete",
        description: "Time impact analysis has been completed."
      });
    }
  });

  const handleCreateScenario = (values: any) => {
    createScenarioMutation.mutate(values);
  };

  const getScenarioIcon = (type: string) => {
    switch (type) {
      case "delay-analysis":
        return <Clock className="h-4 w-4" />;
      case "acceleration":
        return <Zap className="h-4 w-4" />;
      case "what-if":
        return <GitBranch className="h-4 w-4" />;
      case "recovery":
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getImpactColor = (days: number) => {
    if (days <= 0) return "text-green-600";
    if (days <= 10) return "text-yellow-600";
    if (days <= 30) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Time Impact Analysis</h1>
          <p className="text-muted-foreground">
            Analyze schedule delays, what-if scenarios, and recovery options
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button 
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-create-scenario"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Scenario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create TIA Scenario</DialogTitle>
              <DialogDescription>
                Define a new time impact analysis scenario to model schedule changes
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateScenario)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scenario Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Weather Delay Impact Q2 2025" 
                          data-testid="input-scenario-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe the scenario and its purpose..."
                          data-testid="textarea-scenario-description"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scenarioType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scenario Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-scenario-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="delay-analysis">Delay Analysis</SelectItem>
                            <SelectItem value="acceleration">Acceleration Study</SelectItem>
                            <SelectItem value="what-if">What-If Analysis</SelectItem>
                            <SelectItem value="recovery">Recovery Planning</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="impactType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Impact Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value || "eot"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-impact-type">
                              <SelectValue placeholder="Select impact" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="eot">Extension of Time</SelectItem>
                            <SelectItem value="disruption">Disruption</SelectItem>
                            <SelectItem value="change-order">Change Order</SelectItem>
                            <SelectItem value="weather">Weather Impact</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="targetDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Completion Date (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="date"
                          data-testid="input-target-date"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Set a target date to analyze recovery options
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateDialog(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createScenarioMutation.isPending}
                    data-testid="button-save-scenario"
                  >
                    Create Scenario
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Scenarios List */}
        <div className="col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>TIA Scenarios</CardTitle>
              <CardDescription>
                Select a scenario to view details and analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {scenariosLoading ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading scenarios...
                </div>
              ) : scenarios.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No scenarios created yet</p>
                </div>
              ) : (
                scenarios.map((scenario: TiaScenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => setSelectedScenario(scenario.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedScenario === scenario.id
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid={`button-scenario-${scenario.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getScenarioIcon(scenario.scenarioType)}
                        <div>
                          <div className="font-medium">{scenario.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {scenario.scenarioType?.replace("-", " ")}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scenario Details */}
        <div className="col-span-8">
          {selectedScenario ? (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="delays" data-testid="tab-delays">Delays</TabsTrigger>
                <TabsTrigger value="fragnets" data-testid="tab-fragnets">Fragnets</TabsTrigger>
                <TabsTrigger value="analysis" data-testid="tab-analysis">Analysis</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Scenario Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {scenarioDetails && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-muted-foreground">Type</Label>
                            <div className="flex items-center space-x-2 mt-1">
                              {getScenarioIcon(scenarioDetails.scenarioType)}
                              <span className="capitalize">
                                {scenarioDetails.scenarioType?.replace("-", " ")}
                              </span>
                            </div>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Impact</Label>
                            <div className="mt-1">
                              <Badge variant="outline">
                                {scenarioDetails.impactType?.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        
                        {scenarioDetails.description && (
                          <div>
                            <Label className="text-muted-foreground">Description</Label>
                            <p className="mt-1 text-sm">{scenarioDetails.description}</p>
                          </div>
                        )}
                        
                        {scenarioDetails.targetDate && (
                          <div>
                            <Label className="text-muted-foreground">Target Date</Label>
                            <p className="mt-1">
                              {format(new Date(scenarioDetails.targetDate), "MMM dd, yyyy")}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="delays" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Delay Events</CardTitle>
                      <Button size="sm" variant="outline">
                        <Plus className="mr-1 h-3 w-3" />
                        Add Delay
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {delays.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No delays defined</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {delays.map((delay: TiaDelay) => (
                          <div 
                            key={delay.id}
                            className="p-3 border rounded-lg"
                            data-testid={`delay-${delay.id}`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium">
                                  Activity: {delay.affectedActivityId}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {delay.delayDays} days • {delay.delayType}
                                </div>
                              </div>
                              <Badge variant="destructive">
                                {delay.delayDays} days
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="fragnets" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Schedule Fragnets</CardTitle>
                      <Button size="sm" variant="outline">
                        <Plus className="mr-1 h-3 w-3" />
                        Add Fragnet
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {fragnets.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No fragnets defined</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {fragnets.map((fragnet: TiaFragnet) => (
                          <div 
                            key={fragnet.id}
                            className="p-3 border rounded-lg"
                            data-testid={`fragnet-${fragnet.id}`}
                          >
                            <div className="font-medium">{fragnet.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Insertion: {fragnet.insertionPoint}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="analysis" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Impact Analysis</CardTitle>
                      <Button 
                        onClick={() => analyzeScenarioMutation.mutate(selectedScenario)}
                        disabled={analyzeScenarioMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                        data-testid="button-run-analysis"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {analyzeScenarioMutation.isPending ? "Analyzing..." : "Run Analysis"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {analysisResults ? (
                      <div className="space-y-4">
                        {/* Impact Summary */}
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertTitle>Analysis Results</AlertTitle>
                          <AlertDescription>
                            <div className="mt-2 space-y-2">
                              <div className="flex justify-between">
                                <span>Net Impact:</span>
                                <span className={`font-bold ${getImpactColor(analysisResults.netImpactDays)}`}>
                                  {analysisResults.netImpactDays > 0 ? "+" : ""}
                                  {analysisResults.netImpactDays} days
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Original Finish:</span>
                                <span>{analysisResults.unimpactedFinishDate}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Impacted Finish:</span>
                                <span className="font-medium">
                                  {analysisResults.impactedFinishDate}
                                </span>
                              </div>
                            </div>
                          </AlertDescription>
                        </Alert>
                        
                        {/* Critical Path Changes */}
                        {analysisResults.criticalPathChanges && (
                          <div>
                            <h4 className="font-medium mb-2">Critical Path Changes</h4>
                            <div className="text-sm space-y-1">
                              {analysisResults.criticalPathChanges.becameCritical?.length > 0 && (
                                <div>
                                  <span className="text-red-600">Became Critical:</span>{" "}
                                  {analysisResults.criticalPathChanges.becameCritical.length} activities
                                </div>
                              )}
                              {analysisResults.criticalPathChanges.lostCriticality?.length > 0 && (
                                <div>
                                  <span className="text-green-600">Lost Criticality:</span>{" "}
                                  {analysisResults.criticalPathChanges.lostCriticality.length} activities
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Affected Milestones */}
                        {analysisResults.affectedMilestones?.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Affected Milestones</h4>
                            <div className="space-y-1">
                              {analysisResults.affectedMilestones.map((milestone: any) => (
                                <div 
                                  key={milestone.activityId}
                                  className="text-sm flex justify-between"
                                  data-testid={`milestone-${milestone.activityId}`}
                                >
                                  <span>{milestone.name}</span>
                                  <span className="text-orange-600">
                                    +{milestone.delayDays} days
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Run analysis to see impact results</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="h-full">
              <CardContent className="flex items-center justify-center h-full py-12">
                <div className="text-center text-muted-foreground">
                  <LineChart className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Select a scenario to view details</p>
                  <p className="text-sm mt-2">
                    Create scenarios to analyze schedule impacts and recovery options
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}