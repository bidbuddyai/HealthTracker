import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Activity, Relationship, Wbs, InsertWbs } from "@shared/schema";
import { insertWbsSchema } from "@shared/schema";
import { z } from "zod";
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  Circle, 
  PlayCircle,
  Target,
  Calendar,
  Filter,
  Eye,
  ChevronRight,
  ChevronDown,
  Indent,
  Outdent,
  Code2,
  Plus,
  Search,
  Edit,
  Trash2,
  FolderTree,
  Settings
} from "lucide-react";

interface ScheduleGridProps {
  activities: Activity[];
  relationships: Relationship[];
  wbs: Wbs[];
  projectId: string;
  onActivitySelect: (activityId: string) => void;
  onNewActivity: () => void;
  onWbsUpdate?: () => void;
}

export default function ScheduleGrid({ 
  activities, 
  relationships, 
  wbs, 
  projectId,
  onActivitySelect, 
  onNewActivity,
  onWbsUpdate
}: ScheduleGridProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'critical' | 'in-progress' | 'constrained'>('all');
  const [sortBy, setSortBy] = useState<'earlyStart' | 'activityId' | 'totalFloat' | 'name'>('earlyStart');
  const [showColumns, setShowColumns] = useState({
    activityId: true,
    name: true,
    type: true,
    duration: true,
    earlyStart: true,
    earlyFinish: true,
    totalFloat: true,
    status: true,
    predecessors: true,
    constraints: true,
    responsibility: true,
    trade: true,
    wbs: true,
    activityCodes: false,
    customFields: false
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActivityCodes, setSelectedActivityCodes] = useState<string[]>([]);
  const [expandedWBS, setExpandedWBS] = useState<Set<string>>(new Set());
  
  // WBS Management State
  const [selectedWbs, setSelectedWbs] = useState<string | null>(null);
  const [showWbsDialog, setShowWbsDialog] = useState(false);
  const [editingWbs, setEditingWbs] = useState<Wbs | null>(null);
  const [showWbsManager, setShowWbsManager] = useState(false);

  // WBS Form
  const wbsFormSchema = insertWbsSchema.extend({
    name: z.string().min(1, "WBS name is required"),
  });

  const wbsForm = useForm<z.infer<typeof wbsFormSchema>>({
    resolver: zodResolver(wbsFormSchema),
    defaultValues: {
      projectId,
      parentId: null,
      code: "",
      name: "",
      level: 0,
      sequenceNumber: 1,
      rollupSettings: null
    }
  });

  // WBS Mutations
  const createWbsMutation = useMutation({
    mutationFn: async (data: InsertWbs) => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/wbs`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'wbs'] });
      onWbsUpdate?.();
      toast({ title: "WBS item created successfully" });
      setShowWbsDialog(false);
      wbsForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create WBS item", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    }
  });

  const updateWbsMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Wbs>) => {
      const response = await apiRequest('PUT', `/api/wbs/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'wbs'] });
      onWbsUpdate?.();
      toast({ title: "WBS item updated successfully" });
      setShowWbsDialog(false);
      setEditingWbs(null);
      wbsForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update WBS item", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    }
  });

  const deleteWbsMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/wbs/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'wbs'] });
      onWbsUpdate?.();
      toast({ title: "WBS item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete WBS item", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    }
  });

  const indentWbsMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/wbs/${id}/indent`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'wbs'] });
      onWbsUpdate?.();
      toast({ title: "WBS item indented successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to indent WBS item", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    }
  });

  const outdentWbsMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/wbs/${id}/outdent`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'wbs'] });
      onWbsUpdate?.();
      toast({ title: "WBS item outdented successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to outdent WBS item", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    }
  });

  // Generate WBS Code
  const { data: generatedCode } = useQuery({
    queryKey: ['/api/projects', projectId, 'wbs/generate-code', selectedWbs],
    queryFn: async () => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/wbs/generate-code`, { parentId: selectedWbs });
      return response.json();
    },
    enabled: showWbsDialog && !editingWbs
  });

  // WBS Helper Functions
  const handleCreateWbs = (parentWbsId?: string) => {
    setSelectedWbs(parentWbsId || null);
    setEditingWbs(null);
    wbsForm.reset({
      projectId,
      parentId: parentWbsId || null,
      code: "",
      name: "",
      level: parentWbsId ? (wbsMap.get(parentWbsId)?.level || 0) + 1 : 0,
      sequenceNumber: 1,
      rollupSettings: null
    });
    setShowWbsDialog(true);
  };

  const handleEditWbs = (wbs: Wbs) => {
    setEditingWbs(wbs);
    wbsForm.reset({
      projectId: wbs.projectId,
      parentId: wbs.parentId,
      code: wbs.code,
      name: wbs.name,
      level: wbs.level,
      sequenceNumber: wbs.sequenceNumber,
      rollupSettings: wbs.rollupSettings as any
    });
    setShowWbsDialog(true);
  };

  const handleDeleteWbs = (wbsId: string) => {
    if (confirm('Are you sure you want to delete this WBS item? This action cannot be undone.')) {
      deleteWbsMutation.mutate(wbsId);
    }
  };

  const onWbsSubmit = (data: z.infer<typeof wbsFormSchema>) => {
    // Use generated code if creating new WBS
    if (!editingWbs && generatedCode?.code) {
      data.code = generatedCode.code;
    }

    if (editingWbs) {
      updateWbsMutation.mutate({ id: editingWbs.id, ...data });
    } else {
      createWbsMutation.mutate(data);
    }
  };

  // Sort WBS items in hierarchy order
  const sortedWbs = [...wbs].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.sequenceNumber - b.sequenceNumber;
  });

  // Get WBS children for hierarchy display  
  const getWbsChildren = (parentId: string | null): Wbs[] => {
    return wbs.filter(w => w.parentId === parentId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  };

  // Check if WBS can be indented (has previous sibling)
  const canIndentWbs = (wbs: Wbs): boolean => {
    const siblings = getWbsChildren(wbs.parentId);
    const currentIndex = siblings.findIndex(s => s.id === wbs.id);
    return currentIndex > 0;
  };

  // Check if WBS can be outdented (has parent)
  const canOutdentWbs = (wbs: Wbs): boolean => {
    return wbs.parentId !== null;
  };
  
  // Extract unique activity codes and custom field keys for filtering
  const availableActivityCodes = Array.from(
    new Set(
      activities
        .flatMap(a => a.activityCodes ? Object.keys(a.activityCodes as any) : [])
    )
  );
  
  const availableCustomFields = Array.from(
    new Set(
      activities
        .flatMap(a => a.customFields ? Object.keys(a.customFields as any) : [])
    )
  );

  // Create a map of WBS items for quick lookup
  const wbsMap = new Map(wbs.map(w => [w.id, w]));

  // Create hierarchical activity display with WBS grouping
  const getActivityDisplayLevel = (activity: Activity): number => {
    if (!activity.wbsId) return 0;
    const wbsItem = wbsMap.get(activity.wbsId);
    return wbsItem ? wbsItem.level : 0;
  };
  
  const toggleWBSExpansion = (wbsId: string) => {
    const newExpanded = new Set(expandedWBS);
    if (newExpanded.has(wbsId)) {
      newExpanded.delete(wbsId);
    } else {
      newExpanded.add(wbsId);
    }
    setExpandedWBS(newExpanded);
  };
  
  // Filter and sort activities
  const filteredActivities = activities.filter(activity => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      if (!activity.name.toLowerCase().includes(searchLower) && 
          !activity.activityId.toLowerCase().includes(searchLower) &&
          !activity.responsibility?.toLowerCase().includes(searchLower) &&
          !activity.trade?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    // Status/type filters
    if (filter === 'critical' && !activity.isCritical) return false;
    if (filter === 'in-progress' && activity.status !== 'InProgress') return false;
    if (filter === 'constrained' && !activity.constraintType) return false;
    
    // Activity codes filter
    if (selectedActivityCodes.length > 0) {
      const activityCodes = activity.activityCodes as any;
      if (!activityCodes || !selectedActivityCodes.some(code => code in activityCodes)) {
        return false;
      }
    }
    
    return true;
  });

  // Create a map of relationships for predecessor/successor lookup
  const getPredecessors = (activityId: string) => {
    return relationships
      .filter(r => r.successorId === activityId)
      .map(r => {
        const pred = activities.find(a => a.id === r.predecessorId);
        if (!pred) return null;
        
        let relationText = `${pred.activityId}`;
        if (r.type !== 'FS') {
          relationText += r.type;
        }
        if (r.lag && r.lag !== 0) {
          relationText += r.lag > 0 ? `+${r.lag}` : `${r.lag}`;
        }
        return relationText;
      })
      .filter(Boolean)
      .join(', ');
  };

  const getSuccessors = (activityId: string) => {
    return relationships
      .filter(r => r.predecessorId === activityId)
      .map(r => {
        const succ = activities.find(a => a.id === r.successorId);
        return succ?.activityId || '';
      })
      .filter(Boolean)
      .join(', ');
  };

  // Additional status/type filters are applied in the main filteredActivities above

  // Sort filtered activities
  const sortedActivities = [...filteredActivities].sort((a, b) => {
    switch (sortBy) {
      case 'activityId':
        return a.activityId.localeCompare(b.activityId);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'totalFloat':
        return (a.totalFloat || 0) - (b.totalFloat || 0);
      case 'earlyStart':
      default:
        if (!a.earlyStart && !b.earlyStart) return 0;
        if (!a.earlyStart) return 1;
        if (!b.earlyStart) return -1;
        return new Date(a.earlyStart).getTime() - new Date(b.earlyStart).getTime();
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'InProgress':
        return <PlayCircle className="w-4 h-4 text-blue-600" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getConstraintBadge = (activity: Activity) => {
    if (!activity.constraintType || !activity.constraintDate) return null;
    
    const constraintMap = {
      'SNET': 'Start No Earlier',
      'SNLT': 'Start No Later',
      'FNET': 'Finish No Earlier',
      'FNLT': 'Finish No Later',
      'MSO': 'Must Start On',
      'MFO': 'Must Finish On'
    };

    return (
      <Badge variant="outline" className="text-xs">
        <Target className="w-3 h-3 mr-1" />
        {constraintMap[activity.constraintType as keyof typeof constraintMap] || activity.constraintType}
      </Badge>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: '2-digit'
    });
  };

  const formatDuration = (duration: number | null) => {
    if (!duration) return '-';
    return `${duration}d`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <span>Schedule Activities</span>
            <Badge variant="secondary">
              {sortedActivities.length} of {activities.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button 
              onClick={() => setShowWbsManager(!showWbsManager)} 
              size="sm" 
              variant={showWbsManager ? "default" : "outline"}
              data-testid="button-toggle-wbs-manager"
            >
              <FolderTree className="w-4 h-4 mr-2" />
              WBS Manager
            </Button>
            <Button onClick={() => handleCreateWbs()} size="sm" data-testid="button-new-wbs">
              <Plus className="w-4 h-4 mr-2" />
              New WBS
            </Button>
            <Button onClick={onNewActivity} size="sm" data-testid="button-new-activity-grid">
              <Plus className="w-4 h-4 mr-2" />
              New Activity
            </Button>
          </div>
        </div>
        
        {/* Enhanced Toolbar */}
        <div className="flex items-center justify-between space-x-4 mt-4">
          <div className="flex items-center space-x-2 flex-1">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search activities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
                data-testid="input-search-activities"
              />
            </div>
            
            {/* Filters */}
            <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
              <SelectTrigger className="w-40" data-testid="select-activity-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                <SelectItem value="critical">Critical Path</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="constrained">Constrained</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Activity Codes Filter */}
            {availableActivityCodes.length > 0 && (
              <Select value="" onValueChange={(code) => {
                if (code && !selectedActivityCodes.includes(code)) {
                  setSelectedActivityCodes([...selectedActivityCodes, code]);
                }
              }}>
                <SelectTrigger className="w-40" data-testid="select-activity-codes">
                  <Code2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Activity Codes" />
                </SelectTrigger>
                <SelectContent>
                  {availableActivityCodes.map(code => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Selected Activity Codes */}
            {selectedActivityCodes.map(code => (
              <Badge key={code} variant="secondary" className="cursor-pointer"
                onClick={() => setSelectedActivityCodes(selectedActivityCodes.filter(c => c !== code))}>
                {code} ×
              </Badge>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Sort */}
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-32" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="earlyStart">Early Start</SelectItem>
                <SelectItem value="activityId">Activity ID</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="totalFloat">Float</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Column Visibility */}
            <Button variant="outline" size="sm" className="p-2">
              <Eye className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {showColumns.activityId && (
                  <TableHead className="w-24">Activity ID</TableHead>
                )}
                {showColumns.name && (
                  <TableHead className="min-w-48">Activity Name</TableHead>
                )}
                {showColumns.wbs && (
                  <TableHead className="w-32">WBS</TableHead>
                )}
                {showColumns.activityCodes && (
                  <TableHead className="w-40">Activity Codes</TableHead>
                )}
                {showColumns.customFields && (
                  <TableHead className="w-40">Custom Fields</TableHead>
                )}
                {showColumns.type && (
                  <TableHead className="w-20">Type</TableHead>
                )}
                {showColumns.duration && (
                  <TableHead className="w-20">Duration</TableHead>
                )}
                {showColumns.earlyStart && (
                  <TableHead className="w-24">Early Start</TableHead>
                )}
                {showColumns.earlyFinish && (
                  <TableHead className="w-24">Early Finish</TableHead>
                )}
                {showColumns.totalFloat && (
                  <TableHead className="w-20">Float</TableHead>
                )}
                {showColumns.status && (
                  <TableHead className="w-24">Status</TableHead>
                )}
                {showColumns.predecessors && (
                  <TableHead className="w-32">Predecessors</TableHead>
                )}
                {showColumns.constraints && (
                  <TableHead className="w-32">Constraints</TableHead>
                )}
                {showColumns.responsibility && (
                  <TableHead className="w-24">Responsibility</TableHead>
                )}
                {showColumns.trade && (
                  <TableHead className="w-24">Trade</TableHead>
                )}
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedActivities.map((activity) => (
                <TableRow 
                  key={activity.id} 
                  className={`cursor-pointer hover:bg-muted/50 ${
                    activity.isCritical ? 'border-l-4 border-l-red-500' : ''
                  }`}
                  onClick={() => onActivitySelect(activity.id)}
                  data-testid={`row-activity-${activity.activityId}`}
                >
                  {showColumns.activityId && (
                    <TableCell className="font-medium">
                      {activity.activityId}
                    </TableCell>
                  )}
                  {showColumns.name && (
                    <TableCell>
                      <div 
                        className="flex items-center"
                        style={{ paddingLeft: `${getActivityDisplayLevel(activity) * 16}px` }}
                      >
                        {/* WBS Expansion Toggle for WBS Summary activities */}
                        {activity.type === 'WBSSummary' && activity.wbsId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 h-6 w-6 mr-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWBSExpansion(activity.wbsId!);
                            }}
                          >
                            {expandedWBS.has(activity.wbsId) ? 
                              <ChevronDown className="w-3 h-3" /> : 
                              <ChevronRight className="w-3 h-3" />
                            }
                          </Button>
                        )}
                        
                        {/* Activity Type Icon */}
                        <div className="mr-2">
                          {activity.type === 'StartMilestone' || activity.type === 'FinishMilestone' ? (
                            <Target className="w-4 h-4 text-blue-600" />
                          ) : activity.type === 'WBSSummary' ? (
                            <ChevronRight className="w-4 h-4 text-purple-600" />
                          ) : activity.type === 'LOE' ? (
                            <Calendar className="w-4 h-4 text-orange-600" />
                          ) : activity.type === 'Hammock' ? (
                            <Outdent className="w-4 h-4 text-green-600" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        
                        <div className="flex flex-col">
                          <span className="font-medium">{activity.name}</span>
                          {activity.wbsId && wbsMap.has(activity.wbsId) && (
                            <span className="text-xs text-gray-500">
                              {wbsMap.get(activity.wbsId)?.code} - {wbsMap.get(activity.wbsId)?.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  {showColumns.wbs && (
                    <TableCell>
                      <div className="text-xs">
                        {activity.wbsId && wbsMap.has(activity.wbsId) ? (
                          <Badge variant="outline" className="text-xs">
                            {wbsMap.get(activity.wbsId)?.code}
                          </Badge>
                        ) : '-'}
                      </div>
                    </TableCell>
                  )}
                  {showColumns.activityCodes && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {activity.activityCodes && Object.keys(activity.activityCodes as any).length > 0 ? (
                          Object.entries(activity.activityCodes as any).slice(0, 2).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {String(value)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {showColumns.customFields && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {activity.customFields && Object.keys(activity.customFields as any).length > 0 ? (
                          Object.entries(activity.customFields as any).slice(0, 2).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {String(value)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {showColumns.type && (
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {activity.type}
                      </Badge>
                    </TableCell>
                  )}
                  {showColumns.duration && (
                    <TableCell>{formatDuration(activity.originalDuration)}</TableCell>
                  )}
                  {showColumns.earlyStart && (
                    <TableCell>{formatDate(activity.earlyStart)}</TableCell>
                  )}
                  {showColumns.earlyFinish && (
                    <TableCell>{formatDate(activity.earlyFinish)}</TableCell>
                  )}
                  {showColumns.totalFloat && (
                    <TableCell>
                      <div className={`font-medium ${
                        activity.isCritical ? 'text-red-600' : 
                        (activity.totalFloat || 0) <= 5 ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {activity.totalFloat !== null ? `${activity.totalFloat}d` : '-'}
                      </div>
                    </TableCell>
                  )}
                  {showColumns.status && (
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(activity.status)}
                        <span className="text-sm">{activity.status}</span>
                      </div>
                    </TableCell>
                  )}
                  {showColumns.predecessors && (
                    <TableCell>
                      <span className="text-xs text-gray-600">
                        {getPredecessors(activity.id) || '-'}
                      </span>
                    </TableCell>
                  )}
                  {showColumns.constraints && (
                    <TableCell>
                      {getConstraintBadge(activity)}
                    </TableCell>
                  )}
                  {showColumns.responsibility && (
                    <TableCell className="text-sm">
                      {activity.responsibility || '-'}
                    </TableCell>
                  )}
                  {showColumns.trade && (
                    <TableCell className="text-sm">
                      {activity.trade || '-'}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivitySelect(activity.id);
                      }}
                      data-testid={`button-view-activity-${activity.activityId}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        {sortedActivities.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Circle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-medium">No activities found</p>
            <p className="text-sm">Create your first activity to get started</p>
            <Button onClick={onNewActivity} className="mt-4">
              <Circle className="w-4 h-4 mr-2" />
              Create Activity
            </Button>
          </div>
        )}
      </CardContent>

      {/* WBS Manager Panel */}
      {showWbsManager && (
        <CardContent className="border-t">
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <FolderTree className="w-5 h-5 mr-2" />
              Work Breakdown Structure
            </h3>
            
            <div className="space-y-2">
              {/* Root WBS Items */}
              {getWbsChildren(null).map((wbsItem) => (
                <WBSTreeNode 
                  key={wbsItem.id}
                  wbs={wbsItem}
                  allWbs={wbs}
                  level={0}
                  onEdit={handleEditWbs}
                  onDelete={handleDeleteWbs}
                  onIndent={indentWbsMutation.mutate}
                  onOutdent={outdentWbsMutation.mutate}
                  onCreateChild={handleCreateWbs}
                  canIndent={canIndentWbs}
                  canOutdent={canOutdentWbs}
                />
              ))}
              
              {wbs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FolderTree className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No WBS items created yet</p>
                  <Button onClick={() => handleCreateWbs()} className="mt-2">
                    Create First WBS Item
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}

      {/* WBS Create/Edit Dialog */}
      <Dialog open={showWbsDialog} onOpenChange={setShowWbsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingWbs ? 'Edit WBS Item' : 'Create WBS Item'}
            </DialogTitle>
          </DialogHeader>
          
          <Form {...wbsForm}>
            <form onSubmit={wbsForm.handleSubmit(onWbsSubmit)} className="space-y-4">
              <FormField
                control={wbsForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WBS Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter WBS name..." 
                        {...field}
                        data-testid="input-wbs-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={wbsForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WBS Code</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={generatedCode?.code || "Auto-generated"} 
                        {...field}
                        data-testid="input-wbs-code"
                        disabled={!editingWbs}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setShowWbsDialog(false)}
                  data-testid="button-cancel-wbs"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createWbsMutation.isPending || updateWbsMutation.isPending}
                  data-testid="button-save-wbs"
                >
                  {createWbsMutation.isPending || updateWbsMutation.isPending ? 
                    'Saving...' : 
                    editingWbs ? 'Update' : 'Create'
                  }
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// WBS Tree Node Component
interface WBSTreeNodeProps {
  wbs: Wbs;
  allWbs: Wbs[];
  level: number;
  onEdit: (wbs: Wbs) => void;
  onDelete: (wbsId: string) => void;
  onIndent: (wbsId: string) => void;
  onOutdent: (wbsId: string) => void;
  onCreateChild: (parentId: string) => void;
  canIndent: (wbs: Wbs) => boolean;
  canOutdent: (wbs: Wbs) => boolean;
}

function WBSTreeNode({ 
  wbs, 
  allWbs, 
  level, 
  onEdit, 
  onDelete, 
  onIndent, 
  onOutdent, 
  onCreateChild,
  canIndent,
  canOutdent
}: WBSTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const getWbsChildren = (parentId: string): Wbs[] => {
    return allWbs.filter(w => w.parentId === parentId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  };
  
  const children = getWbsChildren(wbs.id);
  const hasChildren = children.length > 0;
  
  return (
    <div className="border rounded-lg p-3" style={{ marginLeft: `${level * 24}px` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid={`button-expand-wbs-${wbs.code}`}
            >
              {isExpanded ? 
                <ChevronDown className="w-3 h-3" /> : 
                <ChevronRight className="w-3 h-3" />
              }
            </Button>
          )}
          
          <Badge variant="outline" className="text-xs font-mono">
            {wbs.code}
          </Badge>
          
          <span className="font-medium">{wbs.name}</span>
          
          <Badge variant="secondary" className="text-xs">
            Level {wbs.level}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6"
            onClick={() => onCreateChild(wbs.id)}
            data-testid={`button-add-child-${wbs.code}`}
          >
            <Plus className="w-3 h-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6"
            onClick={() => onIndent(wbs.id)}
            disabled={!canIndent(wbs)}
            data-testid={`button-indent-${wbs.code}`}
          >
            <Indent className="w-3 h-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6"
            onClick={() => onOutdent(wbs.id)}
            disabled={!canOutdent(wbs)}
            data-testid={`button-outdent-${wbs.code}`}
          >
            <Outdent className="w-3 h-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6"
            onClick={() => onEdit(wbs)}
            data-testid={`button-edit-${wbs.code}`}
          >
            <Edit className="w-3 h-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-6 w-6 text-red-600 hover:text-red-700"
            onClick={() => onDelete(wbs.id)}
            data-testid={`button-delete-${wbs.code}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <WBSTreeNode
              key={child.id}
              wbs={child}
              allWbs={allWbs}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onCreateChild={onCreateChild}
              canIndent={canIndent}
              canOutdent={canOutdent}
            />
          ))}
        </div>
      )}
    </div>
  );
}