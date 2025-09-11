import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Edit2, Trash2, GitBranch, Calendar, Clock, AlertTriangle, Save, Grid3x3, TableIcon, Info, Users, FileText, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MSProjectGanttChart from "./GanttChart";
import type { Activity as DbActivity } from "@shared/schema";

export interface Activity {
  id: string;
  activityId: string;
  activityName: string;
  duration: number;
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;
  predecessors: string[];
  successors: string[];
  status: 'Not Started' | 'In Progress' | 'Completed';
  percentComplete: number;
  startDate?: string;
  finishDate?: string;
  resources?: string[];
  wbs?: string;
  // MS Project-style additional fields
  constraintType?: 'ASAP' | 'ALAP' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';
  constraintDate?: string;
  actualStart?: string;
  actualFinish?: string;
  actualDuration?: number;
  remainingDuration?: number;
  cost?: number;
  baselineDuration?: number;
  baselineStart?: string;
  baselineFinish?: string;
  notes?: string;
  priority?: number;
  resourceCost?: number;
  work?: number;
  physicalPercentComplete?: number;
}

interface ScheduleEditorProps {
  activities: Activity[];
  onActivitiesChange: (activities: Activity[]) => void;
  projectStartDate: string;
  onSave?: () => void;
}

export default function ScheduleEditor({ 
  activities: initialActivities, 
  onActivitiesChange,
  projectStartDate,
  onSave
}: ScheduleEditorProps) {
  const { toast } = useToast();
  
  // Calculate CPM network
  const calculateCPM = (acts: Activity[], startDateStr: string): Activity[] => {
    const activityMap = new Map(acts.map(a => [a.activityId, { ...a }]));
    const startDate = new Date(startDateStr);
    
    // Forward pass - calculate early start/finish
    const calculateEarlyDates = (activity: Activity, visited = new Set<string>()): void => {
      if (visited.has(activity.activityId)) return;
      visited.add(activity.activityId);
      
      let maxEarlyFinish = 0;
      
      if (activity.predecessors.length === 0) {
        activity.earlyStart = 0;
      } else {
        for (const predId of activity.predecessors) {
          const pred = activityMap.get(predId);
          if (pred) {
            if (!visited.has(predId)) {
              calculateEarlyDates(pred, visited);
            }
            maxEarlyFinish = Math.max(maxEarlyFinish, pred.earlyFinish || 0);
          }
        }
        activity.earlyStart = maxEarlyFinish;
      }
      
      activity.earlyFinish = activity.earlyStart + activity.duration;
      
      // Calculate actual dates
      const actStartDate = new Date(startDate);
      actStartDate.setDate(actStartDate.getDate() + activity.earlyStart);
      activity.startDate = actStartDate.toISOString().split('T')[0];
      
      const actFinishDate = new Date(startDate);
      actFinishDate.setDate(actFinishDate.getDate() + activity.earlyFinish - 1);
      activity.finishDate = actFinishDate.toISOString().split('T')[0];
    };
    
    // Calculate early dates for all activities
    activityMap.forEach(activity => {
      calculateEarlyDates(activity);
    });
    
    // Find project finish
    let projectFinish = 0;
    activityMap.forEach(activity => {
      if (activity.successors.length === 0) {
        projectFinish = Math.max(projectFinish, activity.earlyFinish || 0);
      }
    });
    
    // Backward pass - calculate late start/finish
    const calculateLateDates = (activity: Activity, visited = new Set<string>()): void => {
      if (visited.has(activity.activityId)) return;
      visited.add(activity.activityId);
      
      if (activity.successors.length === 0) {
        activity.lateFinish = projectFinish;
      } else {
        let minLateStart = Infinity;
        for (const succId of activity.successors) {
          const succ = activityMap.get(succId);
          if (succ) {
            if (!visited.has(succId)) {
              calculateLateDates(succ, visited);
            }
            minLateStart = Math.min(minLateStart, succ.lateStart || Infinity);
          }
        }
        activity.lateFinish = minLateStart;
      }
      
      activity.lateStart = activity.lateFinish - activity.duration;
      activity.totalFloat = activity.lateStart - (activity.earlyStart || 0);
      activity.isCritical = activity.totalFloat === 0;
    };
    
    // Calculate late dates for all activities
    activityMap.forEach(activity => {
      calculateLateDates(activity);
    });
    
    return Array.from(activityMap.values());
  };
  
  // Initialize activities with CPM calculations
  const [activities, setActivities] = useState<Activity[]>(() => {
    if (initialActivities.length > 0) {
      return calculateCPM(initialActivities, projectStartDate);
    }
    return initialActivities;
  });
  
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [selectedView, setSelectedView] = useState<'table' | 'gantt' | 'network'>('table');
  
  // Form state for activity editing
  const [formData, setFormData] = useState({
    activityId: '',
    activityName: '',
    duration: 1,
    predecessors: '',
    status: 'Not Started' as Activity['status'],
    percentComplete: 0,
    wbs: '',
    resources: '',
    // MS Project-style fields
    constraintType: 'ASAP' as Activity['constraintType'],
    constraintDate: '',
    actualStart: '',
    actualFinish: '',
    actualDuration: 0,
    remainingDuration: 1,
    cost: 0,
    baselineDuration: 0,
    baselineStart: '',
    baselineFinish: '',
    notes: '',
    priority: 500,
    resourceCost: 0,
    work: 0,
    physicalPercentComplete: 0
  });

  // Manually trigger update to parent
  const updateParentActivities = (newActivities: Activity[]) => {
    const calculatedActivities = calculateCPM(newActivities, projectStartDate);
    setActivities(calculatedActivities);
    onActivitiesChange(calculatedActivities);
  };

  const handleAddActivity = () => {
    setEditingActivity(null);
    setFormData({
      activityId: `A${(activities.length + 1).toString().padStart(3, '0')}`,
      activityName: '',
      duration: 1,
      predecessors: '',
      status: 'Not Started',
      percentComplete: 0,
      wbs: '',
      resources: '',
      constraintType: 'ASAP',
      constraintDate: '',
      actualStart: '',
      actualFinish: '',
      actualDuration: 0,
      remainingDuration: 1,
      cost: 0,
      baselineDuration: 0,
      baselineStart: '',
      baselineFinish: '',
      notes: '',
      priority: 500,
      resourceCost: 0,
      work: 0,
      physicalPercentComplete: 0
    });
    setShowActivityDialog(true);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setFormData({
      activityId: activity.activityId,
      activityName: activity.activityName,
      duration: activity.duration,
      predecessors: activity.predecessors.join(', '),
      status: activity.status,
      percentComplete: activity.percentComplete,
      wbs: activity.wbs || '',
      resources: activity.resources?.join(', ') || '',
      constraintType: activity.constraintType || 'ASAP',
      constraintDate: activity.constraintDate || '',
      actualStart: activity.actualStart || '',
      actualFinish: activity.actualFinish || '',
      actualDuration: activity.actualDuration || 0,
      remainingDuration: activity.remainingDuration || activity.duration,
      cost: activity.cost || 0,
      baselineDuration: activity.baselineDuration || activity.duration,
      baselineStart: activity.baselineStart || activity.startDate || '',
      baselineFinish: activity.baselineFinish || activity.finishDate || '',
      notes: activity.notes || '',
      priority: activity.priority || 500,
      resourceCost: activity.resourceCost || 0,
      work: activity.work || 0,
      physicalPercentComplete: activity.physicalPercentComplete || 0
    });
    setShowActivityDialog(true);
  };

  const handleSaveActivity = () => {
    const predecessorList = formData.predecessors
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    const resourceList = formData.resources
      .split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);
    
    const newActivity: Activity = {
      id: editingActivity?.id || crypto.randomUUID(),
      activityId: formData.activityId,
      activityName: formData.activityName,
      duration: formData.duration,
      predecessors: predecessorList,
      successors: [],
      status: formData.status,
      percentComplete: formData.percentComplete,
      wbs: formData.wbs,
      resources: resourceList,
      constraintType: formData.constraintType,
      constraintDate: formData.constraintDate || undefined,
      actualStart: formData.actualStart || undefined,
      actualFinish: formData.actualFinish || undefined,
      actualDuration: formData.actualDuration || undefined,
      remainingDuration: formData.remainingDuration || undefined,
      cost: formData.cost || undefined,
      baselineDuration: formData.baselineDuration || undefined,
      baselineStart: formData.baselineStart || undefined,
      baselineFinish: formData.baselineFinish || undefined,
      notes: formData.notes || undefined,
      priority: formData.priority || 500,
      resourceCost: formData.resourceCost || undefined,
      work: formData.work || undefined,
      physicalPercentComplete: formData.physicalPercentComplete || undefined
    };
    
    let updatedActivities: Activity[];
    
    if (editingActivity) {
      updatedActivities = activities.map(a => 
        a.id === editingActivity.id ? newActivity : a
      );
    } else {
      updatedActivities = [...activities, newActivity];
    }
    
    // Update successors based on predecessors
    updatedActivities = updatedActivities.map(activity => {
      const successors = updatedActivities
        .filter(a => a.predecessors.includes(activity.activityId))
        .map(a => a.activityId);
      return { ...activity, successors };
    });
    
    // Update activities and notify parent
    updateParentActivities(updatedActivities);
    setShowActivityDialog(false);
    
    toast({
      title: editingActivity ? "Activity updated" : "Activity added",
      description: `${formData.activityName} has been ${editingActivity ? 'updated' : 'added'} to the schedule.`,
    });
  };

  const handleDeleteActivity = (activityId: string) => {
    const updatedActivities = activities.filter(a => a.id !== activityId);
    // Update activities and notify parent
    updateParentActivities(updatedActivities);
    
    toast({
      title: "Activity deleted",
      description: "The activity has been removed from the schedule.",
    });
  };

  const criticalPath = useMemo(() => {
    return activities.filter(a => a.isCritical);
  }, [activities]);

  const projectDuration = useMemo(() => {
    return Math.max(...activities.map(a => a.earlyFinish || 0), 0);
  }, [activities]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Schedule Editor</CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleAddActivity} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Activity
              </Button>
              {onSave && (
                <Button onClick={onSave} variant="default" size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Save Schedule
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Schedule Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <Label className="text-sm text-gray-600">Total Activities</Label>
              <p className="text-2xl font-bold">{activities.length}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Project Duration</Label>
              <p className="text-2xl font-bold">{projectDuration} days</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Critical Activities</Label>
              <p className="text-2xl font-bold text-red-600">{criticalPath.length}</p>
            </div>
          </div>

          <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="table">Table View</TabsTrigger>
              <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
              <TabsTrigger value="network">Network Diagram</TabsTrigger>
            </TabsList>

            <TabsContent value="table">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Activity</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Finish</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Float</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Predecessors</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activities.map((activity) => (
                      <tr key={activity.id} className={activity.isCritical ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-sm font-medium">
                          {activity.activityId}
                          {activity.isCritical && (
                            <AlertTriangle className="inline-block h-3 w-3 ml-1 text-red-500" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">{activity.activityName}</td>
                        <td className="px-3 py-2 text-sm">{activity.duration}d</td>
                        <td className="px-3 py-2 text-sm">{activity.startDate}</td>
                        <td className="px-3 py-2 text-sm">{activity.finishDate}</td>
                        <td className="px-3 py-2 text-sm">
                          <Badge variant={activity.totalFloat === 0 ? 'destructive' : 'outline'}>
                            {activity.totalFloat}d
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm">{activity.predecessors.join(', ') || '-'}</td>
                        <td className="px-3 py-2">
                          <Badge variant={
                            activity.status === 'Completed' ? 'default' :
                            activity.status === 'In Progress' ? 'secondary' : 'outline'
                          }>
                            {activity.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditActivity(activity)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteActivity(activity.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="gantt">
              <MSProjectGanttChart 
                activities={[]} 
                relationships={[]}
                wbs={[]}
                onActivitySelect={(activityId: string) => {}}
              />
            </TabsContent>

            <TabsContent value="network">
              <NetworkDiagram activities={activities} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* MS Project-style Activity Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Task Information - {formData.activityName || 'New Task'}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="predecessors">Predecessors</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="tracking">Tracking</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-[500px] mt-4">
              {/* General Tab */}
              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="activityName">Name</Label>
                    <Input
                      id="activityName"
                      value={formData.activityName}
                      onChange={(e) => setFormData({ ...formData, activityName: e.target.value })}
                      className="font-medium"
                    />
                  </div>
                  <div>
                    <Label htmlFor="activityId">ID</Label>
                    <Input
                      id="activityId"
                      value={formData.activityId}
                      onChange={(e) => setFormData({ ...formData, activityId: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="duration">Duration</Label>
                    <div className="flex gap-2">
                      <Input
                        id="duration"
                        type="number"
                        min="0"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                        className="flex-1"
                      />
                      <span className="flex items-center px-2 text-sm text-gray-600">days</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="wbs">WBS</Label>
                    <Input
                      id="wbs"
                      value={formData.wbs}
                      onChange={(e) => setFormData({ ...formData, wbs: e.target.value })}
                      placeholder="1.2.3"
                    />
                  </div>
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select 
                      value={formData.priority.toString()} 
                      onValueChange={(v) => setFormData({ ...formData, priority: parseInt(v) })}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1000">Highest (1000)</SelectItem>
                        <SelectItem value="750">High (750)</SelectItem>
                        <SelectItem value="500">Medium (500)</SelectItem>
                        <SelectItem value="250">Low (250)</SelectItem>
                        <SelectItem value="0">Lowest (0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label>Percent Complete</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[formData.percentComplete]}
                      onValueChange={(value) => setFormData({ ...formData, percentComplete: value[0] })}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.percentComplete}
                        onChange={(e) => setFormData({ ...formData, percentComplete: parseInt(e.target.value) || 0 })}
                        className="w-20"
                      />
                      <span className="text-sm text-gray-600">%</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select 
                      value={formData.status} 
                      onValueChange={(v) => setFormData({ ...formData, status: v as Activity['status'] })}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Not Started">Not Started</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="constraintType">Constraint Type</Label>
                    <Select 
                      value={formData.constraintType} 
                      onValueChange={(v) => setFormData({ ...formData, constraintType: v as Activity['constraintType'] })}
                    >
                      <SelectTrigger id="constraintType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASAP">As Soon As Possible</SelectItem>
                        <SelectItem value="ALAP">As Late As Possible</SelectItem>
                        <SelectItem value="SNET">Start No Earlier Than</SelectItem>
                        <SelectItem value="SNLT">Start No Later Than</SelectItem>
                        <SelectItem value="FNET">Finish No Earlier Than</SelectItem>
                        <SelectItem value="FNLT">Finish No Later Than</SelectItem>
                        <SelectItem value="MSO">Must Start On</SelectItem>
                        <SelectItem value="MFO">Must Finish On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(formData.constraintType !== 'ASAP' && formData.constraintType !== 'ALAP') && (
                  <div>
                    <Label htmlFor="constraintDate">Constraint Date</Label>
                    <Input
                      id="constraintDate"
                      type="date"
                      value={formData.constraintDate}
                      onChange={(e) => setFormData({ ...formData, constraintDate: e.target.value })}
                    />
                  </div>
                )}
              </TabsContent>

              {/* Predecessors Tab */}
              <TabsContent value="predecessors" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="predecessors">Predecessors</Label>
                    <Textarea
                      id="predecessors"
                      value={formData.predecessors}
                      onChange={(e) => setFormData({ ...formData, predecessors: e.target.value })}
                      placeholder="Enter task IDs separated by commas (e.g., A001, A002)\nOr use relationships like: A001FS+2, A002SS"
                      rows={5}
                      className="font-mono"
                    />
                    <p className="text-sm text-gray-600 mt-2">
                      Relationship types: FS (Finish-to-Start), SS (Start-to-Start), SF (Start-to-Finish), FF (Finish-to-Finish)
                    </p>
                  </div>

                  {editingActivity && (
                    <div>
                      <Label>Current Dependencies</Label>
                      <div className="border rounded-lg p-3 bg-gray-50">
                        <div className="space-y-2">
                          <div>
                            <span className="font-medium text-sm">Predecessors:</span>
                            <span className="text-sm ml-2">
                              {editingActivity.predecessors.length > 0 ? editingActivity.predecessors.join(', ') : 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-sm">Successors:</span>
                            <span className="text-sm ml-2">
                              {editingActivity.successors.length > 0 ? editingActivity.successors.join(', ') : 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Resources Tab */}
              <TabsContent value="resources" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="resources">Resource Names</Label>
                    <Textarea
                      id="resources"
                      value={formData.resources}
                      onChange={(e) => setFormData({ ...formData, resources: e.target.value })}
                      placeholder="Enter resource names separated by commas\ne.g., John Doe[100%], Excavator[50%], Mary Smith[25%]"
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="work">Work (hours)</Label>
                      <Input
                        id="work"
                        type="number"
                        min="0"
                        value={formData.work}
                        onChange={(e) => setFormData({ ...formData, work: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="resourceCost">Resource Cost ($)</Label>
                      <Input
                        id="resourceCost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.resourceCost}
                        onChange={(e) => setFormData({ ...formData, resourceCost: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="cost">Total Cost ($)</Label>
                    <Input
                      id="cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="baselineStart">Baseline Start</Label>
                      <Input
                        id="baselineStart"
                        type="date"
                        value={formData.baselineStart}
                        onChange={(e) => setFormData({ ...formData, baselineStart: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="baselineFinish">Baseline Finish</Label>
                      <Input
                        id="baselineFinish"
                        type="date"
                        value={formData.baselineFinish}
                        onChange={(e) => setFormData({ ...formData, baselineFinish: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="baselineDuration">Baseline Duration (days)</Label>
                    <Input
                      id="baselineDuration"
                      type="number"
                      min="0"
                      value={formData.baselineDuration}
                      onChange={(e) => setFormData({ ...formData, baselineDuration: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  {editingActivity && (
                    <div>
                      <Label>Calculated Values</Label>
                      <div className="border rounded-lg p-3 bg-gray-50">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="font-medium">Early Start:</span>
                            <span className="ml-2">{editingActivity.earlyStart || 0}</span>
                          </div>
                          <div>
                            <span className="font-medium">Early Finish:</span>
                            <span className="ml-2">{editingActivity.earlyFinish || 0}</span>
                          </div>
                          <div>
                            <span className="font-medium">Late Start:</span>
                            <span className="ml-2">{editingActivity.lateStart || 0}</span>
                          </div>
                          <div>
                            <span className="font-medium">Late Finish:</span>
                            <span className="ml-2">{editingActivity.lateFinish || 0}</span>
                          </div>
                          <div>
                            <span className="font-medium">Total Float:</span>
                            <span className="ml-2">{editingActivity.totalFloat || 0} days</span>
                          </div>
                          <div>
                            <span className="font-medium">Free Float:</span>
                            <span className="ml-2">{editingActivity.freeFloat || 0} days</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium">Critical Path:</span>
                            <Badge className="ml-2" variant={editingActivity.isCritical ? 'destructive' : 'outline'}>
                              {editingActivity.isCritical ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tracking Tab */}
              <TabsContent value="tracking" className="space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actualStart">Actual Start</Label>
                      <Input
                        id="actualStart"
                        type="date"
                        value={formData.actualStart}
                        onChange={(e) => setFormData({ ...formData, actualStart: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="actualFinish">Actual Finish</Label>
                      <Input
                        id="actualFinish"
                        type="date"
                        value={formData.actualFinish}
                        onChange={(e) => setFormData({ ...formData, actualFinish: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actualDuration">Actual Duration (days)</Label>
                      <Input
                        id="actualDuration"
                        type="number"
                        min="0"
                        value={formData.actualDuration}
                        onChange={(e) => setFormData({ ...formData, actualDuration: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="remainingDuration">Remaining Duration (days)</Label>
                      <Input
                        id="remainingDuration"
                        type="number"
                        min="0"
                        value={formData.remainingDuration}
                        onChange={(e) => setFormData({ ...formData, remainingDuration: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>Physical % Complete</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[formData.physicalPercentComplete]}
                        onValueChange={(value) => setFormData({ ...formData, physicalPercentComplete: value[0] })}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.physicalPercentComplete}
                          onChange={(e) => setFormData({ ...formData, physicalPercentComplete: parseInt(e.target.value) || 0 })}
                          className="w-20"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Physical completion represents the actual work done, independent of duration.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-4">
                <div>
                  <Label htmlFor="notes">Task Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Enter any additional notes, comments, or documentation for this task..."
                    rows={12}
                    className="resize-none"
                  />
                  <p className="text-sm text-gray-600 mt-2">
                    Use this space to document assumptions, risks, issues, or any other relevant information.
                  </p>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <Separator className="my-4" />

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {editingActivity && (
                <span>Last modified: {new Date().toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowActivityDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveActivity}>
                {editingActivity ? 'OK' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Simple Gantt Chart Component (legacy)
function SimpleGanttChart({ activities, projectStartDate }: { activities: Activity[], projectStartDate: string }) {
  const startDate = new Date(projectStartDate);
  const endDate = new Date(Math.max(...activities.map(a => new Date(a.finishDate || projectStartDate).getTime())));
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px] p-4 bg-gray-50 rounded-lg">
        {/* Timeline Header */}
        <div className="flex border-b-2 border-gray-300 pb-2 mb-2">
          <div className="w-48 font-medium">Activity</div>
          <div className="flex-1 flex">
            {Array.from({ length: Math.min(totalDays, 30) }, (_, i) => {
              const date = new Date(startDate);
              date.setDate(date.getDate() + i);
              return (
                <div key={i} className="flex-1 text-xs text-center border-l border-gray-200">
                  {date.getDate()}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Activities */}
        {activities.map((activity) => {
          const actStart = new Date(activity.startDate || projectStartDate);
          const actFinish = new Date(activity.finishDate || projectStartDate);
          const startOffset = Math.ceil((actStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          const duration = Math.ceil((actFinish.getTime() - actStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          return (
            <div key={activity.id} className="flex items-center h-10 border-b border-gray-200">
              <div className="w-48 text-sm truncate pr-2">
                {activity.activityId}: {activity.activityName}
              </div>
              <div className="flex-1 relative">
                <div 
                  className={`absolute h-6 rounded ${
                    activity.isCritical ? 'bg-red-500' : 'bg-blue-500'
                  } opacity-80`}
                  style={{
                    left: `${(startOffset / totalDays) * 100}%`,
                    width: `${(duration / totalDays) * 100}%`
                  }}
                >
                  {activity.percentComplete > 0 && (
                    <div 
                      className="absolute top-0 left-0 h-full bg-green-500 rounded"
                      style={{ width: `${activity.percentComplete}%` }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Network Diagram Component
function NetworkDiagram({ activities }: { activities: Activity[] }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg min-h-[400px]">
      <div className="grid grid-cols-4 gap-4">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={`p-3 rounded-lg border-2 ${
              activity.isCritical 
                ? 'border-red-500 bg-red-50' 
                : 'border-gray-300 bg-white'
            }`}
          >
            <div className="text-xs font-medium">{activity.activityId}</div>
            <div className="text-sm font-semibold truncate">{activity.activityName}</div>
            <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
              <div>ES: {activity.earlyStart}</div>
              <div>EF: {activity.earlyFinish}</div>
              <div>LS: {activity.lateStart}</div>
              <div>LF: {activity.lateFinish}</div>
            </div>
            <div className="mt-1 text-xs">
              Duration: {activity.duration}d | Float: {activity.totalFloat}d
            </div>
            {activity.predecessors.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                <GitBranch className="inline h-3 w-3" /> {activity.predecessors.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}